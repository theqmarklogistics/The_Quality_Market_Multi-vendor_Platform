'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState, useCallback } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import Pagination from "@/components/Pagination"
import { CreditCardIcon } from "lucide-react"

const PROOF_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED']

const PROOF_LABELS = {
    SUBMITTED: 'Pending Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
}

export default function AdminPayments() {
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [proofStatus, setProofStatus] = useState('SUBMITTED')
    // Reviewing the proof is mandatory before a payment can be marked received:
    // track which proofs the admin actually opened this session.
    const [viewedProofs, setViewedProofs] = useState(() => new Set())

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    const fetchProofs = useCallback(async (pg = 1, ps = 'SUBMITTED') => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg, limit: 20, proofStatus: ps })
            const { data } = await axios.get(`/api/admin/payments?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setOrders(data.orders || [])
            setTotal(data.total || 0)
            setPage(data.page || pg)
            setPages(data.pages || 1)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }, [getToken])

    useEffect(() => { fetchProofs(1, proofStatus) }, [proofStatus])

    const reviewProof = async (orderId, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/payments', { orderId, status }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setOrders(prev => prev.filter(o => o.id !== orderId))
            setTotal(t => t - 1)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const handlePageChange = (p) => { fetchProofs(p, proofStatus) }

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl">Review <span className="text-slate-800 font-medium">Payments</span></h1>
                {total > 0 && <span className="text-xs text-slate-400">{total} record{total !== 1 ? 's' : ''}</span>}
            </div>

            {/* Status tabs */}
            <div className="flex gap-2 mb-5">
                {PROOF_STATUSES.map(s => (
                    <button
                        key={s}
                        onClick={() => { setProofStatus(s); setPage(1) }}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium border transition ${proofStatus === s
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                        {PROOF_LABELS[s]}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
                </div>
            ) : orders.length > 0 ? (
                <>
                    <div className="flex flex-col gap-4 max-w-5xl">
                        {orders.map((order) => (
                            <div key={order.id} className="bg-white border rounded-lg shadow-sm p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                                    <div>
                                        <p className="text-slate-800 font-medium text-sm font-mono">{order.id.slice(0, 12)}…</p>
                                        <p className="text-sm text-slate-500">{order.user?.name} &rarr; {order.store?.name}</p>
                                        <p className="text-sm font-semibold text-slate-700 mt-0.5">{currency} {Number(order.total).toLocaleString()}</p>
                                    </div>
                                    {order.paymentProofUrl && (
                                        <a
                                            href={order.paymentProofUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={() => setViewedProofs(prev => new Set(prev).add(order.id))}
                                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline border border-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg"
                                        >
                                            View Proof ↗
                                        </a>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mb-3">{new Date(order.createdAt).toLocaleString()}</p>

                                {proofStatus === 'SUBMITTED' && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button
                                            onClick={() => toast.promise(reviewProof(order.id, 'APPROVED'), { loading: 'Approving…', success: 'Approved', error: e => e.message })}
                                            disabled={!viewedProofs.has(order.id)}
                                            title={!viewedProofs.has(order.id) ? 'Open "View Proof" first — reviewing the proof is mandatory' : undefined}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Mark Received
                                        </button>
                                        <button
                                            onClick={() => toast.promise(reviewProof(order.id, 'REJECTED'), { loading: 'Rejecting…', success: 'Rejected', error: e => e.message })}
                                            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <Pagination page={page} totalPages={pages} onPageChange={handlePageChange} />
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <CreditCardIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500 text-lg">No {PROOF_LABELS[proofStatus].toLowerCase()} proofs</p>
                    <p className="text-sm text-slate-400 mt-1">Payment proof submissions will appear here.</p>
                </div>
            )}
        </div>
    )
}
