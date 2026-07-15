'use client'
// Admin email inbox: send an email to any customer and read their replies as a
// threaded conversation. Replies arrive via the Resend inbound webhook
// (/api/email/inbound) — the banner below flags when that isn't configured yet.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { MailIcon, SendIcon, PlusIcon, RefreshCwIcon, InboxIcon, AlertTriangleIcon, ArrowDownLeftIcon, ArrowUpRightIcon } from 'lucide-react'

export default function AdminInbox() {
    const { getToken } = useAuth()
    const [threads, setThreads] = useState([])
    const [inboundConfigured, setInboundConfigured] = useState(true)
    const [loading, setLoading] = useState(true)
    const [activeThread, setActiveThread] = useState(null) // full thread w/ messages
    const [threadLoading, setThreadLoading] = useState(false)
    const [reply, setReply] = useState('')
    const [sending, setSending] = useState(false)
    // Compose-new form
    const [composing, setComposing] = useState(false)
    const [compose, setCompose] = useState({ to: '', subject: '', body: '' })

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken])

    const loadThreads = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/email-threads', { headers: await authHeaders() })
            setThreads(data.threads || [])
            setInboundConfigured(data.inboundConfigured !== false)
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to load inbox')
        } finally {
            setLoading(false)
        }
    }, [authHeaders])

    useEffect(() => { loadThreads() }, [loadThreads])

    const openThread = async (threadId) => {
        setThreadLoading(true)
        try {
            const { data } = await axios.get(`/api/admin/email-threads/${threadId}`, { headers: await authHeaders() })
            setActiveThread(data.thread)
            setThreads(prev => prev.map(t => t.id === threadId ? { ...t, unreadCount: 0 } : t))
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to open thread')
        } finally {
            setThreadLoading(false)
        }
    }

    const sendReply = async () => {
        if (!reply.trim() || !activeThread) return
        setSending(true)
        try {
            await axios.post(`/api/admin/email-threads/${activeThread.id}`, { body: reply }, { headers: await authHeaders() })
            setReply('')
            await openThread(activeThread.id)
            loadThreads()
            toast.success('Reply sent')
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to send reply')
        } finally {
            setSending(false)
        }
    }

    const sendNew = async (e) => {
        e.preventDefault()
        setSending(true)
        try {
            const { data } = await axios.post('/api/admin/email-threads', compose, { headers: await authHeaders() })
            toast.success('Email sent')
            setComposing(false)
            setCompose({ to: '', subject: '', body: '' })
            await loadThreads()
            if (data.threadId) openThread(data.threadId)
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to send email')
        } finally {
            setSending(false)
        }
    }

    const fmtTime = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h1 className="text-2xl">Email <span className="text-slate-800 font-medium">Inbox</span></h1>
                <div className="flex gap-2">
                    <button onClick={loadThreads} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                        <RefreshCwIcon size={14} /> Refresh
                    </button>
                    <button onClick={() => setComposing(v => !v)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium transition">
                        <PlusIcon size={15} /> New Email
                    </button>
                </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">Send emails to customers and read their replies here as a conversation.</p>

            {!inboundConfigured && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" />
                    <span>
                        Sending works, but <strong>incoming replies are not wired up yet</strong>: set
                        <code className="mx-1 rounded bg-amber-100 px-1">INBOUND_EMAIL_DOMAIN</code> and
                        <code className="mx-1 rounded bg-amber-100 px-1">RESEND_WEBHOOK_SECRET</code>, add the Resend inbound MX record,
                        and point the <em>email.received</em> webhook at <code className="rounded bg-amber-100 px-1">/api/email/inbound</code>.
                    </span>
                </div>
            )}

            {composing && (
                <form onSubmit={sendNew} className="mb-5 rounded-xl border border-green-100 bg-green-50/50 p-4 space-y-2 max-w-3xl">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <input type="email" value={compose.to} onChange={e => setCompose(f => ({ ...f, to: e.target.value }))} placeholder="Customer email" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 bg-white" required />
                        <input value={compose.subject} onChange={e => setCompose(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 bg-white" required />
                    </div>
                    <textarea rows={4} value={compose.body} onChange={e => setCompose(f => ({ ...f, body: e.target.value }))} placeholder="Write your message…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 bg-white resize-none" required />
                    <div className="flex gap-2">
                        <button disabled={sending} className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                            <SendIcon size={14} /> {sending ? 'Sending…' : 'Send Email'}
                        </button>
                        <button type="button" onClick={() => setComposing(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                </form>
            )}

            <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
                {/* Thread list */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {threads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                            <InboxIcon size={32} className="text-slate-300 mb-2" />
                            <p className="text-sm text-slate-400">No email threads yet.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
                            {threads.map(t => (
                                <button key={t.id} onClick={() => openThread(t.id)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${activeThread?.id === t.id ? 'bg-green-50/60' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium text-slate-700 truncate">{t.customerEmail}</p>
                                        {t.unreadCount > 0 && (
                                            <span className="shrink-0 rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5">{t.unreadCount}</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{t.subject}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{fmtTime(t.lastMessageAt)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Conversation */}
                <div className="rounded-xl border border-slate-200 bg-white min-h-[24rem] flex flex-col">
                    {!activeThread ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                            <MailIcon size={36} className="text-slate-300 mb-3" />
                            <p className="text-sm text-slate-400">Select a thread to read the conversation, or start a new email.</p>
                        </div>
                    ) : (
                        <>
                            <div className="border-b border-slate-100 px-5 py-3">
                                <p className="font-medium text-slate-800">{activeThread.subject}</p>
                                <p className="text-xs text-slate-400">{activeThread.customerEmail}{activeThread.orderId ? ` · order #${activeThread.orderId.slice(0, 12)}` : ''}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[26rem]">
                                {threadLoading ? (
                                    <p className="text-sm text-slate-400">Loading…</p>
                                ) : activeThread.messages.map(m => (
                                    <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.direction === 'OUTBOUND' ? 'ml-auto bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                        <p className={`flex items-center gap-1 text-[11px] mb-1 ${m.direction === 'OUTBOUND' ? 'text-white/60' : 'text-slate-400'}`}>
                                            {m.direction === 'OUTBOUND' ? <ArrowUpRightIcon size={11} /> : <ArrowDownLeftIcon size={11} />}
                                            {m.direction === 'OUTBOUND' ? 'You' : m.fromEmail} · {fmtTime(m.createdAt)}
                                        </p>
                                        {m.bodyText
                                            ? <p className="whitespace-pre-wrap">{m.bodyText}</p>
                                            : <div className="prose prose-sm max-w-none [&_*]:!text-inherit" dangerouslySetInnerHTML={{ __html: m.bodyHtml || '' }} />}
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-slate-100 p-4 flex gap-2">
                                <textarea
                                    rows={2}
                                    value={reply}
                                    onChange={e => setReply(e.target.value)}
                                    placeholder={`Reply to ${activeThread.customerEmail}…`}
                                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 resize-none"
                                />
                                <button onClick={sendReply} disabled={sending || !reply.trim()} className="self-end inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                                    <SendIcon size={14} /> {sending ? 'Sending…' : 'Send'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
