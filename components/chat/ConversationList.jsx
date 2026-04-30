'use client'
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import Link from "next/link"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

export default function ConversationList({ basePath }) {
    const { getToken } = useAuth()

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

    if (loading) return <p className="text-slate-500">Loading conversations...</p>

    if (conversations.length === 0) {
        return <p className="text-slate-400">No conversations yet.</p>
    }

    return (
        <div className="flex flex-col gap-3 max-w-4xl">
            {conversations.map((conversation) => (
                <Link
                    key={conversation.id}
                    href={`${basePath}/${conversation.id}`}
                    className="border border-slate-200 rounded-lg bg-white p-4 hover:bg-slate-50 transition"
                >
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-400">{conversation.targetType === 'ADMIN' ? 'Admin Chat' : 'Store Owner Chat'}</p>
                        {conversation?._count?.messages > 0 && (
                            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white">
                                {conversation._count.messages}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-700">
                        {conversation.messages?.[0]?.content || 'No message yet'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Updated {new Date(conversation.updatedAt).toLocaleString()}</p>
                </Link>
            ))}
        </div>
    )
}
