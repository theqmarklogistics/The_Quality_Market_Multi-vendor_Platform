'use client'
import StoreInfo from "@/components/admin/StoreInfo"
import Loading from "@/components/Loading"
import { useAuth, useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import axios from "axios"

export default function AdminApprove() {

    const { user } = useUser()
    const { getToken } = useAuth()

    const [stores, setStores] = useState([])
    const [loading, setLoading] = useState(true)
    const [rejectNotes, setRejectNotes] = useState({})   // storeId → note text
    const [rejectingId, setRejectingId] = useState(null) // which store is showing the notes input

    const fetchStores = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/approve-store', {
                headers: { Authorization: `Bearer ${token}` }
            })
            setStores(data.stores)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const handleApprove = async ({ storeId, status, notes }) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/approve-store', { storeId, status, notes }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setRejectingId(null)
            setRejectNotes(prev => { const n = { ...prev }; delete n[storeId]; return n })
            await fetchStores()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const submitRejection = async (storeId) => {
        const notes = rejectNotes[storeId]?.trim() || ''
        await handleApprove({ storeId, status: 'rejected', notes })
    }

    useEffect(() => {
        if (user) fetchStores()
    }, [user])

    if (loading) return <Loading />

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Approve <span className="text-slate-800 font-medium">Stores</span></h1>

            {stores.length ? (
                <div className="flex flex-col gap-4 mt-4">
                    {stores.map((store) => (
                        <div key={store.id} className="bg-white border rounded-lg shadow-sm p-6 flex max-md:flex-col gap-4 md:items-start max-w-4xl">
                            <StoreInfo store={store} />

                            <div className="flex flex-col gap-3 pt-2 min-w-56">
                                {rejectingId === store.id ? (
                                    <>
                                        <textarea
                                            rows={3}
                                            autoFocus
                                            placeholder="Reason for rejection (shown to seller)…"
                                            value={rejectNotes[store.id] || ''}
                                            onChange={e => setRejectNotes(prev => ({ ...prev, [store.id]: e.target.value }))}
                                            className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm outline-none focus:border-red-300 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => toast.promise(submitRejection(store.id), { loading: 'Rejecting…', success: 'Rejected', error: e => e.message })}
                                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition"
                                            >
                                                Confirm Reject
                                            </button>
                                            <button
                                                onClick={() => setRejectingId(null)}
                                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex gap-3 flex-wrap">
                                        <button
                                            onClick={() => toast.promise(handleApprove({ storeId: store.id, status: 'approved' }), { loading: 'Approving…', success: 'Approved', error: e => e.message })}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => setRejectingId(store.id)}
                                            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition"
                                        >
                                            Reject…
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex items-center justify-center h-80">
                    <h1 className="text-3xl text-slate-400 font-medium">No Applications Pending</h1>
                </div>
            )}
        </div>
    )
}
