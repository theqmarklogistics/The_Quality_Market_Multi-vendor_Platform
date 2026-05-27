'use client'
import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { MessageCircleIcon } from "lucide-react"

export default function ConversationList({ basePath }) {
    const { getToken } = useAuth()
    const { user } = useUser()

    const [loading, setLoading] = useState(true)
    const [conversations, setConversations] = useState([])

    const fetchConversations = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/chat/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            })
            setConversations(data.conversations || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchConversations()
    }, [])

    if (loading) return (
        <div className="flex flex-col gap-3 max-w-4xl">
            {[1, 2, 3].map(i => (
                <div key={i} className="flex items-start gap-3 border border-slate-100 rounded-xl bg-white p-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-slate-200 rounded w-1/3" />
                        <div className="h-3 bg-slate-100 rounded w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    )

    if (conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                <MessageCircleIcon size={32} className="text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No conversations yet</p>
                <p className="text-sm text-slate-400 mt-1">Start a chat to see it here.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3 max-w-4xl">
            {conversations.map((conversation) => {
                const other = conversation.participants?.find(p => p.userId !== user?.id)?.user
                const lastMsg = conversation.messages?.[0]
                const unread = conversation._count?.messages || 0
                const isAdmin = conversation.targetType === 'ADMIN'
                const displayName = other?.name || (isAdmin ? 'Admin Support' : 'Store Owner')
                const initials = displayName[0].toUpperCase()

                return (
                    <Link
                        key={conversation.id}
                        href={`${basePath}/${conversation.id}`}
                        className="flex items-start gap-3 border border-slate-200 rounded-xl bg-white p-4 hover:bg-slate-50 transition"
                    >
                        {/* Avatar */}
                        <div className="shrink-0">
                            {other?.image ? (
                                <Image
                                    src={other.image}
                                    alt={displayName}
                                    width={40}
                                    height={40}
                                    className="w-10 h-10 rounded-full object-cover"
                                />
                            ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${isAdmin ? 'bg-slate-700' : 'bg-indigo-500'}`}>
                                    {initials}
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-800 text-sm truncate">{displayName}</p>
                                    <p className="text-[11px] text-slate-400">{isAdmin ? 'Admin Support' : 'Store Chat'}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    {unread > 0 && (
                                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            {unread}
                                        </span>
                                    )}
                                    <p className="text-[11px] text-slate-400 whitespace-nowrap">
                                        {new Date(conversation.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 truncate mt-1">
                                {lastMsg?.content || 'No messages yet'}
                            </p>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}
