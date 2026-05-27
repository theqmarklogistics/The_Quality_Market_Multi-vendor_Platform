'use client'
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { MessageCircleIcon } from "lucide-react"
import ConversationList from "@/components/chat/ConversationList"

export default function StoreChatPage() {
    const { getToken } = useAuth()
    const router = useRouter()
    const [starting, setStarting] = useState(false)

    const startAdminChat = async () => {
        setStarting(true)
        try {
            const token = await getToken()
            const { data } = await axios.post(
                '/api/chat/conversations',
                { targetType: 'ADMIN' },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            router.push(`/store/chat/${data.conversation.id}`)
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setStarting(false)
        }
    }

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-2xl">Store <span className="text-slate-800 font-medium">Chats</span></h1>
                    <p className="text-sm text-slate-400 mt-0.5">Conversations with customers and admin</p>
                </div>
                <button
                    onClick={startAdminChat}
                    disabled={starting}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition disabled:opacity-60"
                >
                    <MessageCircleIcon size={15} />
                    {starting ? 'Opening…' : 'Chat with Admin'}
                </button>
            </div>
            <ConversationList basePath="/store/chat" />
        </div>
    )
}
