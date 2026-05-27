'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { DownloadIcon, MailIcon, SendIcon, UsersIcon } from 'lucide-react'

export default function AdminNewsletter() {
    const { getToken } = useAuth()

    // Data
    const [stats, setStats] = useState({ total: 0, active: 0, unsubscribed: 0 })
    const [subscribers, setSubscribers] = useState([])
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
    const [loading, setLoading] = useState(true)

    // Compose
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [sending, setSending] = useState(false)

    const fetchPage = async (page = 1) => {
        setLoading(true)
        try {
            const token = await getToken()
            const { data } = await axios.get(`/api/admin/newsletter?page=${page}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setStats(data.stats)
            setSubscribers(data.subscribers)
            setPagination(data.pagination)
        } catch {
            toast.error('Failed to load subscribers')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchPage(1) }, [])

    const exportCsv = () => {
        const rows = [
            ['Email', 'Subscribed At', 'Status'],
            ...subscribers.map(s => [
                s.email,
                new Date(s.subscribedAt).toLocaleString(),
                s.unsubscribedAt ? 'Unsubscribed' : 'Active',
            ]),
        ]
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const sendNewsletter = async () => {
        if (!subject.trim()) { toast.error('Subject is required'); return }
        if (!body.trim()) { toast.error('Message body is required'); return }
        if (stats.active === 0) { toast.error('No active subscribers'); return }

        setSending(true)
        try {
            const token = await getToken()
            const { data } = await axios.post(
                '/api/admin/newsletter/send',
                { subject, body },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            toast.success(`Newsletter sent to ${data.sent} subscriber${data.sent !== 1 ? 's' : ''}!`)
            setSubject('')
            setBody('')
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-6">Newsletter <span className="text-slate-800 font-medium">Management</span></h1>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: 'Total Subscribers', value: stats.total, icon: UsersIcon, color: 'text-slate-700' },
                    { label: 'Active', value: stats.active, icon: MailIcon, color: 'text-green-600' },
                    { label: 'Unsubscribed', value: stats.unsubscribed, icon: MailIcon, color: 'text-slate-400' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="border border-slate-200 rounded-2xl p-5 bg-white flex items-center gap-4">
                        <Icon size={22} className={color} />
                        <div>
                            <p className="text-2xl font-semibold text-slate-800">{value}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Subscriber list */}
                <section className="border border-slate-200 rounded-2xl p-6 bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium text-slate-700">Subscribers</h2>
                        <button
                            onClick={exportCsv}
                            disabled={subscribers.length === 0}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                        >
                            <DownloadIcon size={13} /> Export CSV
                        </button>
                    </div>

                    {loading ? (
                        <p className="text-slate-400 text-sm py-6 text-center">Loading…</p>
                    ) : subscribers.length === 0 ? (
                        <p className="text-slate-400 text-sm py-6 text-center">No subscribers yet.</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left pb-2 text-xs text-slate-400 font-medium">Email</th>
                                            <th className="text-left pb-2 text-xs text-slate-400 font-medium">Joined</th>
                                            <th className="text-left pb-2 text-xs text-slate-400 font-medium">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subscribers.map(s => (
                                            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                                                <td className="py-2.5 pr-4 text-slate-700 truncate max-w-[180px]">{s.email}</td>
                                                <td className="py-2.5 pr-4 text-slate-400 text-xs whitespace-nowrap">
                                                    {new Date(s.subscribedAt).toLocaleDateString()}
                                                </td>
                                                <td className="py-2.5">
                                                    {s.unsubscribedAt ? (
                                                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Unsubscribed</span>
                                                    ) : (
                                                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pagination.pages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => fetchPage(pagination.page - 1)}
                                        disabled={pagination.page <= 1}
                                        className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-xs text-slate-400">
                                        Page {pagination.page} of {pagination.pages}
                                    </span>
                                    <button
                                        onClick={() => fetchPage(pagination.page + 1)}
                                        disabled={pagination.page >= pagination.pages}
                                        className="text-xs text-slate-500 border border-slate-200 px-3 py-1.5 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                    >
                                        Next →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Compose & send */}
                <section className="border border-slate-200 rounded-2xl p-6 bg-white">
                    <div className="flex items-center gap-3 mb-5">
                        <SendIcon size={18} className="text-slate-400" />
                        <h2 className="text-lg font-medium text-slate-700">Send Newsletter</h2>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">Subject line</label>
                            <input
                                type="text"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="e.g. New arrivals this week 🎉"
                                disabled={sending}
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">Message body</label>
                            <textarea
                                rows={8}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder={"Hi there,\n\nWe have some exciting news to share with you..."}
                                disabled={sending}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                                Plain text — line breaks are preserved. An unsubscribe link is automatically added to the footer.
                            </p>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-400 mb-3">
                                This will be sent to <strong className="text-slate-600">{stats.active} active subscriber{stats.active !== 1 ? 's' : ''}</strong>.
                            </p>
                            <button
                                onClick={sendNewsletter}
                                disabled={sending || stats.active === 0}
                                className="inline-flex items-center gap-2 bg-slate-800 text-white text-sm px-6 py-2.5 rounded-full hover:bg-slate-900 disabled:opacity-50 transition"
                            >
                                <SendIcon size={14} />
                                {sending ? 'Sending…' : `Send to ${stats.active} subscriber${stats.active !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
