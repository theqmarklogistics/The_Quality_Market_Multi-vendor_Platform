'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2Icon, PackageIcon, MessageCircleIcon, ArrowRightIcon, FileTextIcon, CheckIcon } from 'lucide-react'
import Loading from '@/components/Loading'
import toast from 'react-hot-toast'

function ConfirmationContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [paymentConfig, setPaymentConfig] = useState(null)
    const [requestedIds, setRequestedIds] = useState(new Set())
    const [requesting, setRequesting] = useState(new Set())

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$'

    useEffect(() => {
        const rawIds = searchParams.get('ids')
        if (!rawIds) {
            router.replace('/orders')
            return
        }

        const ids = rawIds.split(',').filter(Boolean)

        const init = async () => {
            try {
                const token = await getToken()
                const [ordersRes, configRes] = await Promise.allSettled([
                    axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get('/api/payment-config'),
                ])
                if (ordersRes.status === 'fulfilled') {
                    const matched = (ordersRes.value.data.orders || []).filter(o => ids.includes(o.id))
                    setOrders(matched)
                } else {
                    toast.error('Could not load order details. Redirecting…')
                    router.replace('/orders')
                }
                if (configRes.status === 'fulfilled') {
                    setPaymentConfig(configRes.value.data)
                }
            } finally {
                setLoading(false)
            }
        }

        init()
    }, [searchParams, getToken, router])

    const requestInvoice = async (orderId) => {
        setRequesting(prev => new Set(prev).add(orderId))
        try {
            const token = await getToken()
            await axios.post(`/api/orders/${orderId}/request-invoice`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setRequestedIds(prev => new Set(prev).add(orderId))
            toast.success('Invoice requested — admin will send it to your email shortly.')
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to request invoice')
        } finally {
            setRequesting(prev => { const s = new Set(prev); s.delete(orderId); return s })
        }
    }

    if (loading) return <Loading />

    if (orders.length === 0) {
        router.replace('/orders')
        return null
    }

    const totalPaid = orders.reduce((sum, o) => sum + Number(o.total), 0)
    const paymentMethodUsed = orders[0]?.paymentMethod
    const isMomo = paymentMethodUsed === 'MTN_MOMO'
    const isBankTransfer = paymentMethodUsed === 'BANK_TRANSFER'

    return (
        <div className="min-h-[80vh] mx-6 py-16">
            <div className="max-w-2xl mx-auto">

                {/* Success header */}
                <div className="text-center mb-10">
                    <CheckCircle2Icon size={56} className="mx-auto text-green-500 mb-4" />
                    <h1 className="text-3xl font-semibold text-slate-800">Order Placed!</h1>
                    <p className="text-slate-500 mt-2">
                        Thank you for your purchase. Your {orders.length > 1 ? `${orders.length} orders have` : 'order has'} been received and {orders.length > 1 ? 'are' : 'is'} awaiting payment confirmation.
                    </p>
                </div>

                {/* Order cards */}
                <div className="space-y-4 mb-8">
                    {orders.map(order => (
                        <div key={order.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Order</span>
                                <span className="text-xs text-slate-500 font-mono">{order.id.slice(0, 8)}…</span>
                            </div>

                            {/* Items */}
                            <div className="p-5 space-y-4">
                                {order.orderItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                            {item.product?.images?.[0] && (
                                                <Image src={item.product.images[0]} alt={item.product.name} width={48} height={48} className="object-contain h-12 w-auto" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-700 truncate">{item.product?.name}</p>
                                            <p className="text-sm text-slate-500">{currency}{Number(item.price).toLocaleString()} × {item.quantity}</p>
                                        </div>
                                        <p className="font-semibold text-slate-800 whitespace-nowrap">{currency}{Number(item.price * item.quantity).toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                                <span className="text-sm text-slate-500">Store total</span>
                                <span className="font-semibold text-slate-800">{currency}{Number(order.total).toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Grand total */}
                {orders.length > 1 && (
                    <div className="flex justify-between items-center px-5 py-4 rounded-2xl bg-slate-900 text-white mb-8">
                        <span className="font-medium">Grand Total</span>
                        <span className="text-lg font-semibold">{currency}{totalPaid.toLocaleString()}</span>
                    </div>
                )}

                {/* Payment instructions — MoMo */}
                {isMomo && (
                    <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 mb-6">
                        <p className="font-semibold text-yellow-800 mb-3">Pay with MTN MoMo</p>
                        {paymentConfig?.momoConfigured ? (
                            <div className="space-y-1.5 text-sm text-yellow-900">
                                <p>Dial the code below or use MoMo app to complete payment:</p>
                                <div className="mt-2 rounded-xl bg-yellow-100 border border-yellow-200 px-4 py-3 font-mono text-base font-semibold tracking-wide text-yellow-800">
                                    {paymentConfig.momoPayCode}
                                </div>
                                {paymentConfig.momoAccountName && (
                                    <p className="text-xs text-yellow-700 mt-1">Account Name: <span className="font-medium">{paymentConfig.momoAccountName}</span></p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-yellow-700">Payment details will be provided by admin. Please check your email or contact support.</p>
                        )}
                        <div className="mt-4 pt-4 border-t border-yellow-200">
                            <p className="text-xs text-yellow-700 mb-3">Invoice is optional for MoMo. Request one for your records:</p>
                            <div className="space-y-2">
                                {orders.map(order => {
                                    const requested = requestedIds.has(order.id) || order.invoiceRequested
                                    return (
                                        <div key={order.id} className="flex items-center justify-between gap-3">
                                            <span className="text-xs text-yellow-800 font-mono">#{order.id.slice(0, 8)}</span>
                                            {requested ? (
                                                <span className="inline-flex items-center gap-1.5 text-green-700 text-xs font-medium">
                                                    <CheckIcon size={13} /> Invoice Requested
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => requestInvoice(order.id)}
                                                    disabled={requesting.has(order.id)}
                                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-800 border border-yellow-300 bg-white hover:bg-yellow-50 px-3 py-1.5 rounded-lg transition disabled:opacity-60"
                                                >
                                                    <FileTextIcon size={12} />
                                                    {requesting.has(order.id) ? 'Requesting...' : 'Request Invoice'}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Payment instructions — Bank Transfer */}
                {isBankTransfer && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 mb-6">
                        <p className="font-semibold text-blue-800 mb-1">Bank Transfer Payment</p>
                        <p className="text-sm text-blue-700 mb-4">Request your payment invoice to receive full bank account details by email. An invoice is required to complete a bank transfer.</p>
                        <div className="space-y-2">
                            {orders.map(order => {
                                const requested = requestedIds.has(order.id) || order.invoiceRequested
                                return (
                                    <div key={order.id} className="rounded-xl bg-white border border-blue-100 px-4 py-3 flex items-center justify-between gap-3">
                                        <div>
                                            <span className="text-xs text-slate-500 font-mono">#{order.id.slice(0, 8)}</span>
                                            <span className="ml-3 text-sm font-semibold text-slate-700">{currency}{Number(order.total).toLocaleString()}</span>
                                        </div>
                                        {requested ? (
                                            <span className="inline-flex items-center gap-1.5 text-green-700 text-xs font-medium">
                                                <CheckIcon size={13} /> Invoice Requested — Admin will send it shortly
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => requestInvoice(order.id)}
                                                disabled={requesting.has(order.id)}
                                                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                                            >
                                                <FileTextIcon size={13} />
                                                {requesting.has(order.id) ? 'Requesting...' : 'Request Invoice'}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <p className="text-xs text-blue-500 mt-3">Bank account details are included in the invoice for security. Keep it safe.</p>
                    </div>
                )}

                {/* Upload proof reminder */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 mb-8">
                    <p className="font-medium text-slate-700 mb-1">After payment</p>
                    <p>Upload your payment screenshot from <strong>My Orders</strong> so the admin can verify and approve your order faster.</p>
                </div>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/orders" className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900 transition">
                        <PackageIcon size={16} /> View My Orders
                    </Link>
                    <Link href="/shop" className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                        Continue Shopping <ArrowRightIcon size={16} />
                    </Link>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Need help?{' '}
                    <Link href="/chat" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                        <MessageCircleIcon size={12} /> Chat with admin
                    </Link>
                </p>
            </div>
        </div>
    )
}

export default function OrderConfirmation() {
    return (
        <Suspense fallback={<Loading />}>
            <ConfirmationContent />
        </Suspense>
    )
}
