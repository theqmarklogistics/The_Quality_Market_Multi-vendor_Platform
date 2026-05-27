'use client'
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import ConversationList from "@/components/chat/ConversationList"
import { MessageCircleIcon } from "lucide-react"

export default function BuyerChatsPage() {
    const router = useRouter()
    const { getToken } = useAuth()
    const { user } = useUser()
    const [starting, setStarting] = useState(false)

    const startAdminChat = async () => {
        if (!user) return
        setStarting(true)
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/chat/conversations', { targetType: 'ADMIN' }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const conversationId = data?.conversation?.id || data?.conversation?.conversationId || data?.id
            if (!conversationId) {
                toast.error('Unable to start admin conversation')
                return
            }
            router.push(`/chat/${conversationId}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setStarting(false)
        }
    }

    return (
        <div className="mx-6 my-16 min-h-[60vh]">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl text-slate-700">My Chats</h1>
                        <p className="text-slate-500 mt-1">Your conversations with admin and store owners appear here.</p>
                    </div>
                    <button
                        onClick={startAdminChat}
                        disabled={starting || !user}
                        className="flex items-center gap-2 bg-slate-800 text-white text-sm px-5 py-2.5 rounded-full hover:bg-slate-900 disabled:opacity-50 transition shrink-0"
                    >
                        <MessageCircleIcon size={16} />
                        {starting ? 'Starting…' : 'Contact Admin'}
                    </button>
                </div>
                <ConversationList basePath="/chat" />
            </div>
        </div>
    )
}
