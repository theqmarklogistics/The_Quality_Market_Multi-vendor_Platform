'use client'

import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { CheckCircleIcon, SendIcon } from "lucide-react"

const AdminInvoicesPage = () => {
    const { getToken } = useAuth()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(new Set())
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    useEffect(() => {
        const load = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/admin/invoices', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setOrders(data.orders || [])
            } catch {
                toast.error('Failed to load invoice requests')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const sendInvoice = async (orderId) => {
        setSending(prev => new Set(prev).add(orderId))
        try {
            const token = await getToken()
            await axios.post(`/api/admin/invoices/${orderId}/send`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success('Invoice sent successfully')
            setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, invoiceStatus: 'SENT', invoiceSentAt: new Date().toISOString() } : o
            ))
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to send invoice')
        } finally {
            setSending(prev => { const s = new Set(prev); s.delete(orderId); return s })
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const pending = orders.filter(o => !o.invoiceStatus)
    const sent = orders.filter(o => o.invoiceStatus === 'SENT')

    return (
        <div className="p-6 max-w-5xl">
            <h1 className="text-2xl font-semibold text-slate-800 mb-1">Invoice Requests</h1>
            <p className="text-sm text-slate-500 mb-6">Customers who have requested a payment invoice for their order.</p>

            {orders.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400">
                    No invoice requests yet.
                </div>
            )}

            {pending.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Pending ({pending.length})</h2>
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Invoice / Order</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Customer</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Method</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Requested</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pending.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                            {order.invoice?.paymentReference && <div className="font-semibold text-slate-800">{order.invoice.paymentReference}</div>}
                                            #{order.id.slice(0, 16)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <div>{order.user?.name || '—'}</div>
                                            <div className="text-xs text-slate-400">{order.user?.email}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${order.paymentMethod === 'MTN_MOMO' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {order.paymentMethod === 'MTN_MOMO' ? 'MoMo' : 'Bank Transfer'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{currency} {Number(order.total).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            {order.invoiceRequestedAt ? new Date(order.invoiceRequestedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => sendInvoice(order.id)}
                                                disabled={sending.has(order.id)}
                                                className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
                                            >
                                                <SendIcon size={13} />
                                                {sending.has(order.id) ? 'Sending...' : 'Send Invoice'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {sent.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Sent ({sent.length})</h2>
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Invoice / Order</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Customer</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Method</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Amount</th>
                                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Sent At</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sent.map(order => (
                                    <tr key={order.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                            {order.invoice?.paymentReference && <div className="font-semibold text-slate-800">{order.invoice.paymentReference}</div>}
                                            #{order.id.slice(0, 16)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <div>{order.user?.name || '—'}</div>
                                            <div className="text-xs text-slate-400">{order.user?.email}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${order.paymentMethod === 'MTN_MOMO' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {order.paymentMethod === 'MTN_MOMO' ? 'MoMo' : 'Bank Transfer'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{currency} {Number(order.total).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            {order.invoiceSentAt ? new Date(order.invoiceSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center gap-1.5 text-green-600 text-xs font-medium">
                                                <CheckCircleIcon size={14} />
                                                Sent
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminInvoicesPage
