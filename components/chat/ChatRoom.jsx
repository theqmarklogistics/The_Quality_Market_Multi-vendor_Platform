'use client'
import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { initializeSocket } from "@/lib/socketClient"

export default function ChatRoom({ conversationId }) {
    const { getToken } = useAuth()
    const { user } = useUser()

    const [loading, setLoading] = useState(true)
    const [conversation, setConversation] = useState(null)
    const [messages, setMessages] = useState([])
    const [messageInput, setMessageInput] = useState("")

    const scrollRef = useRef(null)

    const otherParticipant = useMemo(() => {
        if (!conversation?.participants || !user?.id) return null
        return conversation.participants.find((participant) => participant.userId !== user.id)?.user || null
    }, [conversation, user])

    const fetchConversationData = async () => {
        try {
            const token = await getToken()
            const [conversationRes, messagesRes] = await Promise.all([
                axios.get(`/api/chat/conversations/${conversationId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get(`/api/chat/conversations/${conversationId}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ])
            setConversation(conversationRes.data.conversation)
            setMessages(messagesRes.data.messages || [])

            await axios.put(`/api/chat/conversations/${conversationId}/messages`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            })
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const sendMessage = async (event) => {
        event.preventDefault()
        if (!messageInput.trim()) return

        try {
            const token = await getToken()
            const res = await axios.post(`/api/chat/conversations/${conversationId}/messages`, {
                content: messageInput
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setMessageInput("")
            // Append the returned message immediately so the sender sees it without waiting for the next poll
            if (res.data?.message) {
                setMessages(prev =>
                    prev.some(m => m.id === res.data.message.id) ? prev : [...prev, res.data.message]
                )
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => {
        fetchConversationData()
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        let socket = null
        let mounted = true
        let pollInterval = null

        const initRealtime = async () => {
            const token = await getToken()
            if (!mounted || !token) return

            socket = initializeSocket(token)

            if (!socket) {
                // Socket.IO not available (e.g., Vercel serverless) — poll for new messages every 5 s.
                // Call getToken() fresh each iteration — the closure token may have expired.
                pollInterval = setInterval(async () => {
                    if (!mounted) return
                    try {
                        const freshToken = await getToken()
                        if (!freshToken) return
                        const res = await axios.get(`/api/chat/conversations/${conversationId}/messages`, {
                            headers: { Authorization: `Bearer ${freshToken}` }
                        })
                        setMessages(res.data.messages || [])
                    } catch { /* ignore polling errors */ }
                }, 5000)
                return
            }

            // Join the conversation room
            socket.emit('join-conversation', conversationId)

            // Listen for new messages
            socket.on('new-message', (payload) => {
                const incomingMessage = payload?.message
                if (!incomingMessage) return
                setMessages((prev) => prev.some((item) => item.id === incomingMessage.id) ? prev : [...prev, incomingMessage])

                if (incomingMessage.senderId !== user?.id) {
                    axios.put(`/api/chat/conversations/${conversationId}/messages`, {}, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => null)
                }
            })

            socket.on("messages-read", (payload) => {
                if (!payload?.messageIds?.length) return
                setMessages((prev) => prev.map((message) => (
                    payload.messageIds.includes(message.id)
                        ? { ...message, isRead: true }
                        : message
                )))
            })
        }

        initRealtime()

        return () => {
            mounted = false
            if (pollInterval) clearInterval(pollInterval)
            if (socket) {
                socket.emit('leave-conversation', conversationId)
                socket.off('new-message')
                socket.off('messages-read')
                // Keep socket connected for other conversations
            }
        }
    }, [conversationId, user?.id])

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    if (loading) return <p className="text-slate-500">Loading chat...</p>

    return (
        <div className="w-full max-w-5xl mx-auto border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-500">Conversation with</p>
                <h1 className="text-xl text-slate-800 font-medium">
                    {otherParticipant?.name || 'Participant'}
                </h1>
            </div>

            <div className="h-[55vh] overflow-y-auto p-4 bg-slate-50/50">
                {messages.length === 0 ? (
                    <p className="text-slate-400">No messages yet.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {messages.map((message) => {
                            const isMe = message.senderId === user?.id
                            return (
                                <div key={message.id} className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${isMe ? 'self-end bg-slate-800 text-white' : 'self-start bg-white border border-slate-200 text-slate-700'}`}>
                                    <p>{message.content}</p>
                                    <p className={`text-[10px] mt-1 ${isMe ? 'text-slate-200' : 'text-slate-400'}`}>
                                        {new Date(message.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            )
                        })}
                        <div ref={scrollRef} />
                    </div>
                )}
            </div>

            <form onSubmit={sendMessage} className="p-3 border-t border-slate-200 flex gap-2">
                <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message"
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 outline-none focus:border-slate-500"
                />
                <button type="submit" className="px-4 py-2 rounded-md bg-slate-800 text-white hover:bg-slate-900">
                    Send
                </button>
            </form>
        </div>
    )
}
