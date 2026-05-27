'use client'
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import ConversationList from "@/components/chat/ConversationList"
import axios from "axios"
import Link from "next/link"
import toast from "react-hot-toast"
import { MessageCircleIcon, StoreIcon } from "lucide-react"

function StoreConversationList() {
    const { getToken } = useAuth()
    const [loading, setLoading] = useState(true)
    const [conversations, setConversations] = useState([])
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)

    const fetchConversations = useCallback(async (pg = 1) => {
        setLoading(true)
        try {
            const token = await getToken()
            const { data } = await axios.get(`/api/admin/conversations?page=${pg}&limit=20`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setConversations(data.conversations || [])
            setPage(data.page || pg)
            setPages(data.pages || 1)
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setLoading(false)
        }
    }, [getToken])

    useEffect(() => { fetchConversations(1) }, [fetchConversations])

    if (loading) return <p className="text-slate-400">Loading store conversations…</p>

    if (conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                <StoreIcon size={32} className="text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No store conversations yet</p>
                <p className="text-sm text-slate-400 mt-1">Buyer-seller chats will appear here.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3 max-w-4xl">
            {conversations.map((conv) => {
                const buyer = conv.participants.find(p => p.user.id !== conv.store?.userId)
                const lastMsg = conv.messages?.[0]
                return (
                    <Link
                        key={conv.id}
                        href={`/admin/chat/${conv.id}`}
                        className="border border-slate-200 rounded-lg bg-white p-4 hover:bg-slate-50 transition"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <StoreIcon size={14} className="text-slate-400" />
                                <span className="font-medium text-slate-700">{conv.store?.name || 'Unknown Store'}</span>
                                {buyer && <span className="text-slate-400">↔ {buyer.user.name || buyer.user.email}</span>}
                            </div>
                            {conv._count?.messages > 0 && (
                                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                                    {conv._count.messages}
                                </span>
                            )}
                        </div>
                        <p className="text-slate-600 text-sm mt-1 truncate">{lastMsg?.content || 'No messages yet'}</p>
                        <p className="text-xs text-slate-400 mt-1">Updated {new Date(conv.updatedAt).toLocaleString()}</p>
                    </Link>
                )
            })}
            {pages > 1 && (
                <div className="flex gap-2 mt-2">
                    {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                        <button
                            key={p}
                            onClick={() => fetchConversations(p)}
                            className={`px-3 py-1 rounded text-sm border transition ${p === page ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AdminChatsPage() {
    const [tab, setTab] = useState('mine')

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-1">Admin <span className="text-slate-800 font-medium">Chats</span></h1>
            <p className="text-sm text-slate-400 mb-5">Conversations with buyers and sellers, plus oversight of all store chats.</p>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setTab('mine')}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${tab === 'mine' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    <MessageCircleIcon size={14} /> My Conversations
                </button>
                <button
                    onClick={() => setTab('store')}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${tab === 'store' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    <StoreIcon size={14} /> Store Conversations
                </button>
            </div>

            {tab === 'mine' && <ConversationList basePath="/admin/chat" />}
            {tab === 'store' && <StoreConversationList />}
        </div>
    )
}
