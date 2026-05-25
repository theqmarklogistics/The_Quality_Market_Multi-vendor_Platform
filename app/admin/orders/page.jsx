'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState, useCallback } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import Pagination from "@/components/Pagination"
import { ShoppingBagIcon, SearchIcon, XIcon } from "lucide-react"

const ORDER_STATUSES = ['', 'ORDER_PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED']

const STATUS_LABELS = {
    ORDER_PLACED: 'Placed',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    DELIVERED: 'Delivered'
}

export default function AdminOrders() {
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const fetchOrders = useCallback(async (pg = 1, q = '', st = '') => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg, limit: 20 })
            if (q) params.set('search', q)
            if (st) params.set('status', st)
            const { data } = await axios.get(`/api/admin/orders?${params}`, {
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

    const updateStatus = async (orderId, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/orders', { orderId, status }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput.trim()) }
    const clearSearch = () => { setSearchInput(''); setSearch('') }
    const handlePageChange = (p) => { fetchOrders(p, search, statusFilter) }

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl">Manage <span className="text-slate-800 font-medium">Orders</span></h1>
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
                            onClick={() => { setStatusFilter(s); setPage(1) }}
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
            ) : orders.length > 0 ? (
                <>
                    <div className="overflow-x-auto max-w-6xl rounded-md shadow border border-gray-200">
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
                                        <td className="px-4 py-3">{currency} {Number(order.total).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {order.paymentStatus}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={order.status}
                                                onChange={e => {
                                                    if (confirm(`Change order status to "${e.target.value}"?`)) {
                                                        updateStatus(order.id, e.target.value)
                                                    }
                                                }}
                                                className="border border-gray-300 rounded-md text-sm focus:ring focus:ring-blue-200 px-1 py-0.5"
                                            >
                                                {ORDER_STATUSES.filter(Boolean).map(s => (
                                                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={pages} onPageChange={handlePageChange} />
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70 mt-6">
                    <ShoppingBagIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500 text-lg">No orders found</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {search || statusFilter ? 'Try adjusting your filters.' : 'Orders placed by customers will appear here.'}
                    </p>
                </div>
            )}
        </div>
    )
}
