'use client'
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { CircleDollarSignIcon, CheckCircleIcon } from "lucide-react"

export default function AdminPayouts() {
    const { getToken } = useAuth()
    const [data, setData] = useState({ payouts: [], storeSummaries: [] })
    const [loading, setLoading] = useState(true)
    const [form, setForm] = useState({ storeId: '', amount: '', periodStart: '', periodEnd: '', notes: '' })
    const [creating, setCreating] = useState(false)

    const fetchData = async () => {
        try {
            const token = await getToken()
            const { data: d } = await axios.get('/api/admin/payouts', { headers: { Authorization: `Bearer ${token}` } })
            setData(d)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally { setLoading(false) }
    }

    const createPayout = async (e) => {
        e.preventDefault()
        try {
            const token = await getToken()
            await axios.post('/api/admin/payouts', form, { headers: { Authorization: `Bearer ${token}` } })
            toast.success('Payout created')
            setForm({ storeId: '', amount: '', periodStart: '', periodEnd: '', notes: '' })
            setCreating(false)
            fetchData()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const markPaid = async (id) => {
        try {
            const token = await getToken()
            await axios.patch(`/api/admin/payouts/${id}`, {}, { headers: { Authorization: `Bearer ${token}` } })
            toast.success('Payout marked as paid')
            fetchData()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => { fetchData() }, [])

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    if (loading) return <p className="text-slate-400">Loading payouts…</p>

    return (
        <div className="text-slate-500 mb-28 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h1 className="text-2xl">Seller <span className="text-slate-800 font-medium">Payouts</span></h1>
                <button onClick={() => setCreating(v => !v)}
                    className={`text-sm rounded-full px-4 py-1.5 border transition ${creating ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {creating ? 'Cancel' : '+ New Payout'}
                </button>
            </div>

            {/* Create form */}
            {creating && (
                <form onSubmit={e => toast.promise(createPayout(e), { loading: 'Creating…' })}
                    className="mb-8 p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-sm">
                    <h2 className="font-medium text-slate-800">Create Payout</h2>
                    <div className="flex flex-wrap gap-3">
                        <select required value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-slate-400 min-w-48">
                            <option value="">Select store…</option>
                            {data.storeSummaries.map(s => (
                                <option key={s.id} value={s.id}>{s.name} — Unpaid: {currency}{s.unpaid.toLocaleString()}</option>
                            ))}
                        </select>
                        <input type="number" required min="1" placeholder="Amount" value={form.amount}
                            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-slate-400 w-36" />
                        <input type="date" required value={form.periodStart}
                            onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-slate-400" />
                        <span className="self-center text-slate-400">to</span>
                        <input type="date" required value={form.periodEnd}
                            onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-slate-400" />
                    </div>
                    <input type="text" placeholder="Notes (optional)" value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white outline-none focus:border-slate-400" />
                    <button type="submit" className="px-5 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-900 transition">Create</button>
                </form>
            )}

            {/* Store summaries */}
            {data.storeSummaries.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-lg font-medium text-slate-700 mb-3">Store Earnings Summary</h2>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full bg-white text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="py-3 px-4 text-left font-semibold text-slate-600">Store</th>
                                    <th className="py-3 px-4 text-right font-semibold text-slate-600">Net Earnings</th>
                                    <th className="py-3 px-4 text-right font-semibold text-slate-600">Paid Out</th>
                                    <th className="py-3 px-4 text-right font-semibold text-slate-600">Unpaid</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.storeSummaries.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="py-3 px-4 font-medium text-slate-800">{s.name}</td>
                                        <td className="py-3 px-4 text-right text-slate-600">{currency}{s.netEarnings.toLocaleString()}</td>
                                        <td className="py-3 px-4 text-right text-slate-500">{currency}{s.totalPaidOut.toLocaleString()}</td>
                                        <td className={`py-3 px-4 text-right font-semibold ${s.unpaid > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                            {currency}{s.unpaid.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Payout history */}
            <h2 className="text-lg font-medium text-slate-700 mb-3">Payout History</h2>
            {data.payouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <CircleDollarSignIcon size={36} className="text-slate-300 mb-3" />
                    <p className="text-slate-400">No payouts recorded yet</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full bg-white text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Store</th>
                                <th className="py-3 px-4 text-right font-semibold text-slate-600">Amount</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Period</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Status</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.payouts.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="py-3 px-4 font-medium text-slate-800">{p.store?.name}</td>
                                    <td className="py-3 px-4 text-right text-slate-700 font-semibold">{currency}{Number(p.amount).toLocaleString()}</td>
                                    <td className="py-3 px-4 text-slate-500 text-xs">
                                        {format(new Date(p.periodStart), 'MMM d')} – {format(new Date(p.periodEnd), 'MMM d, yyyy')}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {p.status === 'PAID' && <CheckCircleIcon size={10} />} {p.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        {p.status === 'PENDING' && (
                                            <button onClick={() => toast.promise(markPaid(p.id), { loading: 'Updating…' })}
                                                className="text-xs text-green-700 hover:underline font-medium">
                                                Mark Paid
                                            </button>
                                        )}
                                        {p.status === 'PAID' && p.paidAt && (
                                            <span className="text-xs text-slate-400">{format(new Date(p.paidAt), 'MMM d, yyyy')}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
