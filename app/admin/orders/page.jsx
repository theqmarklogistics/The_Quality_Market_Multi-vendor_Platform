'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"

const orderStatuses = ["ORDER_PLACED", "PROCESSING", "SHIPPED", "DELIVERED"]

export default function AdminOrders() {
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchOrders = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/orders', {
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

    const updateStatus = async (orderId, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/orders', { orderId, status }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            toast.success(data.message)
            setOrders(prev => prev.map(order => order.id === orderId ? { ...order, status } : order))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => {
        fetchOrders()
    }, [])

    if (loading) return <p className="text-slate-500">Loading orders...</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Manage <span className="text-slate-800 font-medium">Orders</span></h1>

            {orders.length > 0 ? (
                <div className="overflow-x-auto max-w-6xl rounded-md shadow border border-gray-200 mt-6">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Store</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Payment</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50 transition-colors duration-150">
                                    <td className="px-4 py-3">{order.user?.name}</td>
                                    <td className="px-4 py-3">{order.store?.name}</td>
                                    <td className="px-4 py-3">{order.total}</td>
                                    <td className="px-4 py-3">{order.paymentStatus}</td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={order.status}
                                            onChange={e => updateStatus(order.id, e.target.value)}
                                            className="border-gray-300 rounded-md text-sm focus:ring focus:ring-blue-200"
                                        >
                                            {orderStatuses.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex items-center justify-center h-80">
                    <h1 className="text-3xl text-slate-400 font-medium">No orders found</h1>
                </div>
            )}
        </div>
    )
}
