'use client'
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { ClipboardListIcon } from "lucide-react"

const ACTION_COLORS = {
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    UPDATED:  'bg-blue-100 text-blue-700',
    CREATED:  'bg-purple-100 text-purple-700',
    PAID:     'bg-emerald-100 text-emerald-700',
    COMPLETED:'bg-teal-100 text-teal-700',
}

function actionColor(action) {
    for (const [key, cls] of Object.entries(ACTION_COLORS)) {
        if (action.includes(key)) return cls;
    }
    return 'bg-slate-100 text-slate-600';
}

export default function AdminAudit() {
    const { getToken } = useAuth()
    const [logs, setLogs] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState('')
    const [filterAction, setFilterAction] = useState('')

    const fetchLogs = async (pg = 1) => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg })
            if (filterType) params.set('targetType', filterType)
            if (filterAction) params.set('action', filterAction)
            const { data } = await axios.get(`/api/admin/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } })
            setLogs(data.logs || [])
            setTotal(data.total || 0)
            setPage(data.page || pg)
            setTotalPages(data.totalPages || 1)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally { setLoading(false) }
    }

    useEffect(() => { fetchLogs(1) }, [filterType, filterAction])

    const TARGET_TYPES = ['', 'Product', 'Store', 'Order', 'Return', 'Payout']

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl">Admin <span className="text-slate-800 font-medium">Audit Log</span></h1>
                <span className="text-xs text-slate-400">{total} entries</span>
            </div>

            <div className="flex gap-3 flex-wrap mb-5">
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 bg-white">
                    {TARGET_TYPES.map(t => <option key={t} value={t}>{t || 'All types'}</option>)}
                </select>
                <input type="text" placeholder="Filter by action…" value={filterAction} onChange={e => setFilterAction(e.target.value)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 w-44" />
            </div>

            {loading ? (
                <p className="text-slate-400">Loading…</p>
            ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <ClipboardListIcon size={36} className="text-slate-300 mb-3" />
                    <p className="text-slate-400">No audit entries found</p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full bg-white text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">When</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Admin</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Action</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Target</th>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50">
                                        <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{format(new Date(log.createdAt), 'MMM d, HH:mm')}</td>
                                        <td className="py-3 px-4 text-slate-700">{log.adminName || log.adminId.slice(0, 8)}</td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${actionColor(log.action)}`}>
                                                {log.action.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 text-xs">
                                            <span className="font-medium">{log.targetType}</span>
                                            <span className="ml-1 font-mono opacity-60">{log.targetId.slice(0, 8)}</span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-400 text-xs max-w-xs truncate">{log.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-4">
                            <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-40">Prev</button>
                            <span className="self-center text-xs text-slate-400">{page} / {totalPages}</span>
                            <button disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)}
                                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-40">Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
