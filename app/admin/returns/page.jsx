'use client'
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import Image from "next/image"
import { format } from "date-fns"
import { RotateCcwIcon } from "lucide-react"

const STATUS_STYLES = {
    REQUESTED:  'bg-yellow-100 text-yellow-700',
    APPROVED:   'bg-blue-100 text-blue-700',
    REJECTED:   'bg-red-100 text-red-700',
    COMPLETED:  'bg-green-100 text-green-700',
}

const FILTERS = ['', 'REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED']

export default function AdminReturns() {
    const { getToken } = useAuth()
    const [returns, setReturns] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [reviewing, setReviewing] = useState(null)
    const [notes, setNotes] = useState('')

    const fetchReturns = async (status = filter) => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams()
            if (status) params.set('status', status)
            const { data } = await axios.get(`/api/admin/returns?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setReturns(data.returns || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }

    const review = async (id, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post(`/api/admin/returns/${id}/review`, { status, adminNotes: notes }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setReviewing(null)
            setNotes('')
            fetchReturns()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => { fetchReturns() }, [filter])

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl">Return <span className="text-slate-800 font-medium">Requests</span></h1>
                <div className="flex gap-2 flex-wrap">
                    {FILTERS.map(s => (
                        <button key={s} onClick={() => setFilter(s)}
                            className={`rounded-full px-3 py-1 text-sm border transition ${filter === s ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            {s || 'All'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <p className="text-slate-400">Loading returns…</p>
            ) : returns.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <RotateCcwIcon size={36} className="text-slate-300 mb-3" />
                    <p className="text-slate-400 font-medium">No return requests</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4 max-w-4xl">
                    {returns.map(ret => (
                        <div key={ret.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                    {ret.user?.image && (
                                        <Image src={ret.user.image} alt={ret.user.name} width={36} height={36} className="rounded-full" />
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{ret.user?.name}</p>
                                        <p className="text-xs text-slate-400">{ret.user?.email}</p>
                                    </div>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[ret.status]}`}>
                                    {ret.status}
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-3 mb-3">
                                {ret.order?.orderItems?.map((item, i) => (
                                    <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                                        {item.product?.images?.[0] && (
                                            <Image src={item.product.images[0]} alt={item.product.name} width={32} height={32} className="h-8 w-auto object-contain" />
                                        )}
                                        <span className="text-slate-700">{item.product?.name}</span>
                                    </div>
                                ))}
                            </div>

                            <p className="text-sm text-slate-700 mb-1"><span className="font-medium">Reason:</span> {ret.reason}</p>
                            {ret.adminNotes && (
                                <p className="text-sm text-slate-500 mb-1"><span className="font-medium">Admin notes:</span> {ret.adminNotes}</p>
                            )}
                            <p className="text-xs text-slate-400">{format(new Date(ret.createdAt), 'PPp')}</p>

                            {ret.status === 'REQUESTED' && reviewing?.id !== ret.id && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => setReviewing(ret)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
                                        Review
                                    </button>
                                </div>
                            )}

                            {ret.status === 'APPROVED' && (
                                <button onClick={() => toast.promise(review(ret.id, 'COMPLETED'), { loading: 'Updating…' })}
                                    className="mt-3 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition">
                                    Mark Completed (stock restored)
                                </button>
                            )}

                            {reviewing?.id === ret.id && (
                                <div className="mt-3 space-y-2 max-w-lg">
                                    <textarea rows={2} placeholder="Admin notes (optional)…" value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => toast.promise(review(ret.id, 'APPROVED'), { loading: 'Updating…' })}
                                            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
                                            Approve
                                        </button>
                                        <button onClick={() => toast.promise(review(ret.id, 'REJECTED'), { loading: 'Updating…' })}
                                            className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition">
                                            Reject
                                        </button>
                                        <button onClick={() => { setReviewing(null); setNotes('') }}
                                            className="px-3 py-1.5 border border-slate-200 text-sm rounded-lg hover:bg-slate-50 transition">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
