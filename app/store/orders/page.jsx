'use client'
import { useEffect, useState, useCallback } from "react"
import Loading from "@/components/Loading"
import Pagination from "@/components/Pagination"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import toast from "react-hot-toast"
import { PrinterIcon, SearchIcon, XIcon, ShoppingBagIcon, TruckIcon } from "lucide-react"

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
    const [shippingInput, setShippingInput] = useState('')
    const [shippingNoteInput, setShippingNoteInput] = useState('')
    const [settingShipping, setSettingShipping] = useState(false)

    const openModal = (order) => { setSelectedOrder(order); setShippingInput(''); setShippingNoteInput(order?.publicStatusNote || '') }
    const closeModal = () => { setSelectedOrder(null); setShippingInput(''); setShippingNoteInput('') }

    const updateOrderStatus = async (orderId, status, extra = {}) => {
        setUpdatingStatus(true)
        try {
            const token = await getToken()
            await axios.patch(`/api/store/orders/${orderId}`, { status, ...extra }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const updated = { ...selectedOrder, status, ...extra }
            setSelectedOrder(updated)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, ...extra } : o))
            toast.success(`Order marked as ${status.toLowerCase()}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setUpdatingStatus(false)
        }
    }

    const setShippingFee = async (orderId) => {
        const fee = parseFloat(shippingInput)
        if (isNaN(fee) || fee < 0) {
            toast.error('Enter a valid shipping fee (0 or more)')
            return
        }
        setSettingShipping(true)
        try {
            const token = await getToken()
            const { data } = await axios.patch(`/api/store/orders/${orderId}`, { shippingCost: fee }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const updated = { ...selectedOrder, shippingCost: data.shippingCost, total: data.total, shippingQuoted: true }
            setSelectedOrder(updated)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, shippingCost: data.shippingCost, total: data.total, shippingQuoted: true } : o))
            toast.success('Shipping fee set')
            setShippingInput('')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setSettingShipping(false)
        }
    }

    const submitShippedUpdate = async () => {
        await updateOrderStatus(selectedOrder.id, 'SHIPPED', {
            publicStatusNote: shippingNoteInput.trim() || null
        })
    }

    const [settingIntake, setSettingIntake] = useState(false)

    const handleSetIntakeMethod = async (orderId, method) => {
        setSettingIntake(true)
        try {
            const token = await getToken()
            const { data } = await axios.patch(`/api/store/orders/${orderId}`, { intakeMethod: method }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const updated = { ...selectedOrder, intakeMethod: method, total: data.total, shippingCost: data.shippingCost }
            setSelectedOrder(updated)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, intakeMethod: method, total: data.total } : o))
            toast.success(`Intake method set to ${method === 'HUB_DROP_OFF' ? 'Hub Drop-Off' : 'Driver Sweep'}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setSettingIntake(false)
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
                                        <td className="px-4 py-3 font-medium text-slate-800">
                            {currency} {Number(order.total).toLocaleString()}
                            {!order.shippingQuoted && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold align-middle">+shipping</span>
                            )}
                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {order.paymentStatus || (order.isPaid ? 'PAID' : 'PENDING')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                                                {STATUS_LABELS[order.status] || order.customStatusLabel || order.status}
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
                            <p><span className="text-green-700">Email:</span> {(selectedOrder.user?.email || selectedOrder.address?.email) ? <a className="text-blue-600 hover:underline" href={`mailto:${selectedOrder.user?.email || selectedOrder.address?.email}`}>{selectedOrder.user?.email || selectedOrder.address?.email}</a> : '—'}</p>
                            <p><span className="text-green-700">Phone:</span> {(selectedOrder.contactPhone || selectedOrder.address?.phone) ? <a className="text-blue-600 hover:underline" href={`tel:${selectedOrder.contactPhone || selectedOrder.address?.phone}`}>{selectedOrder.contactPhone || selectedOrder.address?.phone}</a> : '—'}</p>
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
                            <p><span className="text-green-700">Status:</span> {STATUS_LABELS[selectedOrder.status] || selectedOrder.customStatusLabel || selectedOrder.status}</p>
                            <p><span className="text-green-700">Payment:</span> {selectedOrder.paymentStatus || (selectedOrder.isPaid ? 'PAID' : 'PENDING')}</p>
                            {selectedOrder.publicStatusNote && (
                                <p><span className="text-green-700">Public note:</span> {selectedOrder.publicStatusNote}</p>
                            )}
                            <p>
                                <span className="text-green-700">Shipping:</span>{' '}
                                {selectedOrder.shippingQuoted
                                    ? `${currency} ${Number(selectedOrder.shippingCost ?? 0).toLocaleString()}`
                                    : <span className="text-amber-600 font-medium">Pending — set below</span>
                                }
                            </p>
                            <p><span className="text-green-700">Total:</span> {currency} {Number(selectedOrder.total).toLocaleString()}</p>
                            <p><span className="text-green-700">Date:</span> {new Date(selectedOrder.createdAt).toLocaleString()}</p>
                        </div>

                        {/* ── Shipping fee quote (LOCAL_SELLER only) ── */}
                        {!selectedOrder.shippingQuoted && (
                            <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
                                <div className="flex items-center gap-2 mb-2">
                                    <TruckIcon size={16} className="text-amber-600" />
                                    <p className="text-sm font-semibold text-amber-800">Set Shipping Fee</p>
                                </div>
                                <p className="text-xs text-amber-700 mb-3">
                                    Check the customer's address above, then enter the delivery fee you will charge.
                                </p>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center border border-slate-200 rounded overflow-hidden bg-white">
                                        <span className="px-3 py-2 text-sm text-slate-500 bg-slate-50 border-r border-slate-200">{currency}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            placeholder="0"
                                            value={shippingInput}
                                            onChange={e => setShippingInput(e.target.value)}
                                            className="w-32 px-3 py-2 text-sm outline-none text-slate-800"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setShippingFee(selectedOrder.id)}
                                        disabled={settingShipping}
                                        className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition disabled:opacity-60"
                                    >
                                        {settingShipping ? 'Saving…' : 'Confirm Fee'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Kigali Pooled Delivery Intake ── */}
                        {selectedOrder.deliveryType === 'KIGALI_POOL' && (
                            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-1">Pooled Delivery Intake</p>
                                {selectedOrder.landmarkAddress && (
                                    <p className="text-xs text-slate-500 mb-3">Customer landmark: <span className="text-slate-700 font-medium">{selectedOrder.landmarkAddress}</span></p>
                                )}
                                <div className="space-y-2">
                                    <label className={`flex gap-3 items-start rounded-xl border px-4 py-3 cursor-pointer transition ${selectedOrder.intakeMethod === 'HUB_DROP_OFF' ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}>
                                        <input
                                            type="radio"
                                            name={`intake-${selectedOrder.id}`}
                                            value="HUB_DROP_OFF"
                                            checked={selectedOrder.intakeMethod === 'HUB_DROP_OFF'}
                                            onChange={() => handleSetIntakeMethod(selectedOrder.id, 'HUB_DROP_OFF')}
                                            disabled={settingIntake}
                                            className="mt-1 accent-green-600"
                                        />
                                        <div>
                                            <span className="block font-medium text-slate-800 text-sm">Drop off at Central Hub</span>
                                            <span className="block text-xs text-slate-500">0 RWF — Downtown / CHIC Hub</span>
                                        </div>
                                    </label>
                                    <label className={`flex gap-3 items-start rounded-xl border px-4 py-3 cursor-pointer transition ${selectedOrder.intakeMethod === 'DRIVER_SWEEP' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                                        <input
                                            type="radio"
                                            name={`intake-${selectedOrder.id}`}
                                            value="DRIVER_SWEEP"
                                            checked={selectedOrder.intakeMethod === 'DRIVER_SWEEP'}
                                            onChange={() => handleSetIntakeMethod(selectedOrder.id, 'DRIVER_SWEEP')}
                                            disabled={settingIntake}
                                            className="mt-1 accent-amber-600"
                                        />
                                        <div>
                                            <span className="block font-medium text-slate-800 text-sm">Request Driver Sweep Pickup</span>
                                            <span className="block text-xs text-slate-500">+1,000 RWF — We collect from your location</span>
                                        </div>
                                    </label>
                                </div>
                                <button
                                    onClick={() => window.open(`/store/orders/label/${selectedOrder.id}`, '_blank')}
                                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                                >
                                    <PrinterIcon size={15} /> Print Package Label
                                </button>
                            </div>
                        )}

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
                                    <div className="w-full space-y-2">
                                        <textarea
                                            rows={3}
                                            value={shippingNoteInput}
                                            onChange={e => setShippingNoteInput(e.target.value)}
                                            placeholder="Add a delivery location or public note for the customer"
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                                        />
                                        <button
                                            onClick={submitShippedUpdate}
                                            disabled={updatingStatus}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition disabled:opacity-60"
                                        >
                                            {updatingStatus ? 'Updating…' : 'Mark as Shipped'}
                                        </button>
                                    </div>
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
