'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"

export default function AdminPayments() {
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchProofs = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/payments', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            setOrders(data.orders || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const reviewProof = async (orderId, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/payments', { orderId, status }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            toast.success(data.message)
            await fetchProofs()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => {
        fetchProofs()
    }, [])

    if (loading) return <p className="text-slate-500">Loading payment proofs...</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Review <span className="text-slate-800 font-medium">Payments</span></h1>

            {orders.length > 0 ? (
                <div className="flex flex-col gap-4 mt-4 max-w-5xl">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-white border rounded-lg shadow-sm p-4">
                            <p className="text-slate-800 font-medium">Order: {order.id}</p>
                            <p className="text-sm">Buyer: {order.user?.name}</p>
                            <p className="text-sm">Store: {order.store?.name}</p>
                            <p className="text-sm">Total: {order.total}</p>
                            {order.paymentProofUrl && (
                                <a href={order.paymentProofUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm">View Payment Proof</a>
                            )}
                            <div className="mt-3 flex gap-3">
                                <button
                                    onClick={() => toast.promise(reviewProof(order.id, 'APPROVED'), { loading: 'Approving proof...' })}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                >
                                    Mark Received
                                </button>
                                <button
                                    onClick={() => toast.promise(reviewProof(order.id, 'REJECTED'), { loading: 'Rejecting proof...' })}
                                    className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 text-sm"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex items-center justify-center h-80">
                    <h1 className="text-3xl text-slate-400 font-medium">No submitted payment proofs</h1>
                </div>
            )}
        </div>
    )
}
