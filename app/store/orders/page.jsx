'use client'
import { useEffect, useState, useCallback } from "react"
import Loading from "@/components/Loading"
import Pagination from "@/components/Pagination"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import { SearchIcon, XIcon, ShoppingBagIcon } from "lucide-react"

const ORDER_STATUSES = ['', 'ORDER_PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED']

const STATUS_LABELS = {
    ORDER_PLACED: 'Placed',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered'
}

export default function StoreOrders() {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const { getToken } = useAuth()

    const fetchOrders = useCallback(async (pg = 1, q = '', st = '') => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg, limit: 20 })
            if (q) params.set('search', q)
            if (st) params.set('status', st)
            const { data } = await axios.get(`/api/store/orders?${params}`, {
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

    useEffect(() => { fetchOrders(1, search, statusFilter) }, [search, statusFilter])

    const handleSearch = (e) => {
        e.preventDefault()
        setSearch(searchInput.trim())
    }

    const clearSearch = () => { setSearchInput(''); setSearch('') }

    const handlePageChange = (p) => { fetchOrders(p, search, statusFilter) }

    const handleStatusFilter = (st) => { setStatusFilter(st) }

    const [updatingStatus, setUpdatingStatus] = useState(false)

    const openModal = (order) => setSelectedOrder(order)
    const closeModal = () => setSelectedOrder(null)

    const updateOrderStatus = async (orderId, status) => {
        setUpdatingStatus(true)
        try {
            const token = await getToken()
            await axios.patch(`/api/store/orders/${orderId}`, { status }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const updated = { ...selectedOrder, status }
            setSelectedOrder(updated)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
            toast.success(`Order marked as ${status.toLowerCase()}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setUpdatingStatus(false)
        }
    }

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h1 className="text-2xl text-slate-500">Store <span className="text-slate-800 font-medium">Orders</span></h1>
                {total > 0 && <span className="text-xs text-slate-400">{total} order{total !== 1 ? 's' : ''}</span>}
            </div>

            {/* Search + Filter */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <form onSubmit={handleSearch} className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-full text-sm w-56">
                    <SearchIcon size={15} className="text-slate-400 shrink-0" />
                    <input
                        className="flex-1 bg-transparent outline-none placeholder-slate-400 text-slate-700"
                        placeholder="Search customer…"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                    {searchInput && <button type="button" onClick={clearSearch}><XIcon size={14} className="text-slate-400 hover:text-slate-600" /></button>}
                </form>

                <div className="flex flex-wrap gap-1.5">
                    {ORDER_STATUSES.map(s => (
                        <button
                            key={s}
                            onClick={() => handleStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusFilter === s
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {s ? STATUS_LABELS[s] || s : 'All'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
                </div>
            ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <ShoppingBagIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500 text-lg">No orders found</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {search || statusFilter ? 'Try adjusting your filters.' : 'Customer orders will appear here.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto max-w-4xl rounded-md shadow border border-gray-200">
                        <table className="w-full text-sm text-left text-gray-600">
                            <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                                <tr>
                                    {['#', 'Customer', 'Total', 'Payment', 'Status', 'Date'].map((h, i) => (
                                        <th key={i} className="px-4 py-3">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {orders.map((order, index) => (
                                    <tr
                                        key={order.id}
                                        className="hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                                        onClick={() => openModal(order)}
                                    >
                                        <td className="pl-6 text-green-600">{(page - 1) * 20 + index + 1}</td>
                                        <td className="px-4 py-3">{order.user?.name}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800">{currency} {Number(order.total).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {order.paymentStatus || (order.isPaid ? 'PAID' : 'PENDING')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                                                {STATUS_LABELS[order.status] || order.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={pages} onPageChange={handlePageChange} />
                </>
            )}

            {/* Order detail modal */}
            {selectedOrder && (
                <div onClick={closeModal} className="fixed inset-0 flex items-center justify-center bg-black/50 text-slate-700 text-sm backdrop-blur-xs z-50">
                    <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-semibold text-slate-900 mb-4 text-center">Order Details</h2>

                        <div className="mb-4">
                            <h3 className="font-semibold mb-2">Customer</h3>
                            <p><span className="text-green-700">Name:</span> {selectedOrder.user?.name}</p>
                            <p><span className="text-green-700">Email:</span> {selectedOrder.user?.email}</p>
                            <p><span className="text-green-700">Phone:</span> {selectedOrder.address?.phone}</p>
                            <p><span className="text-green-700">Address:</span> {[selectedOrder.address?.street, selectedOrder.address?.city, selectedOrder.address?.state, selectedOrder.address?.zip, selectedOrder.address?.country].filter(Boolean).join(', ')}</p>
                        </div>

                        <div className="mb-4">
                            <h3 className="font-semibold mb-2">Products</h3>
                            <div className="space-y-2">
                                {selectedOrder.orderItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 border border-slate-100 shadow rounded p-2">
                                        <img
                                            src={item.product?.images?.[0]?.src || item.product?.images?.[0]}
                                            alt={item.product?.name}
                                            className="w-16 h-16 object-cover rounded"
                                        />
                                        <div className="flex-1">
                                            <p className="text-slate-800">{item.product?.name}</p>
                                            <p>Qty: {item.quantity}</p>
                                            <p>Price: {currency} {Number(item.price).toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4 space-y-1">
                            <p><span className="text-green-700">Status:</span> {selectedOrder.status}</p>
                            <p><span className="text-green-700">Payment:</span> {selectedOrder.paymentStatus || (selectedOrder.isPaid ? 'PAID' : 'PENDING')}</p>
                            <p><span className="text-green-700">Total:</span> {currency} {Number(selectedOrder.total).toLocaleString()}</p>
                            <p><span className="text-green-700">Date:</span> {new Date(selectedOrder.createdAt).toLocaleString()}</p>
                        </div>

                        {['ORDER_PLACED', 'PROCESSING'].includes(selectedOrder.status) && (
                            <div className="mb-4 flex flex-wrap gap-2">
                                {selectedOrder.status === 'ORDER_PLACED' && (
                                    <button
                                        onClick={() => updateOrderStatus(selectedOrder.id, 'PROCESSING')}
                                        disabled={updatingStatus}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition disabled:opacity-60"
                                    >
                                        {updatingStatus ? 'Updating…' : 'Mark as Processing'}
                                    </button>
                                )}
                                {selectedOrder.status === 'PROCESSING' && (
                                    <button
                                        onClick={() => updateOrderStatus(selectedOrder.id, 'SHIPPED')}
                                        disabled={updatingStatus}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition disabled:opacity-60"
                                    >
                                        {updatingStatus ? 'Updating…' : 'Mark as Shipped'}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button onClick={closeModal} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
