'use client'
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { CircleDollarSignIcon, CheckCircleIcon, ClockIcon } from "lucide-react"

export default function StorePayouts() {
    const { getToken } = useAuth()
    const [payouts, setPayouts] = useState([])
    const [loading, setLoading] = useState(true)

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    useEffect(() => {
        const fetch = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/store/payouts', { headers: { Authorization: `Bearer ${token}` } })
                setPayouts(data.payouts || [])
            } catch (error) {
                toast.error(error?.response?.data?.error || error.message)
            } finally { setLoading(false) }
        }
        fetch()
    }, [])

    const totalPaid = payouts.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.amount, 0)
    const totalPending = payouts.filter(p => p.status === 'PENDING').reduce((acc, p) => acc + p.amount, 0)

    if (loading) return <p className="text-slate-400">Loading payouts…</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-6">My <span className="text-slate-800 font-medium">Payouts</span></h1>

            {payouts.length > 0 && (
                <div className="flex flex-wrap gap-4 mb-8">
                    <div className="flex items-center gap-4 border border-slate-200 rounded-xl px-5 py-4 bg-white">
                        <CheckCircleIcon size={28} className="text-green-500" />
                        <div>
                            <p className="text-xs text-slate-400">Total Received</p>
                            <p className="text-xl font-semibold text-slate-800">{currency}{totalPaid.toLocaleString()}</p>
                        </div>
                    </div>
                    {totalPending > 0 && (
                        <div className="flex items-center gap-4 border border-slate-200 rounded-xl px-5 py-4 bg-white">
                            <ClockIcon size={28} className="text-yellow-500" />
                            <div>
                                <p className="text-xs text-slate-400">Pending</p>
                                <p className="text-xl font-semibold text-slate-800">{currency}{totalPending.toLocaleString()}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {payouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <CircleDollarSignIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500">No payouts yet</p>
                    <p className="text-sm text-slate-400 mt-1">Payouts from the platform will appear here.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full bg-white text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Period</th>
                                <th className="py-3 px-4 text-right font-semibold text-slate-600">Amount</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Status</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Paid On</th>
                                <th className="py-3 px-4 text-left font-semibold text-slate-600">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {payouts.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="py-3 px-4 text-slate-600 text-xs">
                                        {format(new Date(p.periodStart), 'MMM d')} – {format(new Date(p.periodEnd), 'MMM d, yyyy')}
                                    </td>
                                    <td className="py-3 px-4 text-right font-semibold text-slate-800">{currency}{Number(p.amount).toLocaleString()}</td>
                                    <td className="py-3 px-4">
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${p.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {p.status === 'PAID' ? <CheckCircleIcon size={10} /> : <ClockIcon size={10} />} {p.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-xs text-slate-400">{p.paidAt ? format(new Date(p.paidAt), 'MMM d, yyyy') : '—'}</td>
                                    <td className="py-3 px-4 text-xs text-slate-400">{p.notes || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
