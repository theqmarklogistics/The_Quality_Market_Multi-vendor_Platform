'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2Icon, PackageIcon, MessageCircleIcon, ArrowRightIcon } from 'lucide-react'
import Loading from '@/components/Loading'
import toast from 'react-hot-toast'

function ConfirmationContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { getToken } = useAuth()

    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$'

    useEffect(() => {
        const rawIds = searchParams.get('ids')
        if (!rawIds) {
            router.replace('/orders')
            return
        }

        const ids = rawIds.split(',').filter(Boolean)

        const fetchConfirmedOrders = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/orders', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                const matched = (data.orders || []).filter(o => ids.includes(o.id))
                setOrders(matched)
            } catch {
                toast.error('Could not load order details. Redirecting…')
                router.replace('/orders')
            } finally {
                setLoading(false)
            }
        }

        fetchConfirmedOrders()
    }, [searchParams, getToken, router])

    if (loading) return <Loading />

    if (orders.length === 0) {
        toast.error('Order not found. Redirecting…')
        router.replace('/orders')
        return null
    }

    const totalPaid = orders.reduce((sum, o) => sum + Number(o.total), 0)

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

                {/* Payment reminder */}
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-800 mb-8">
                    <p className="font-semibold mb-1">Next step: upload payment proof</p>
                    <p>Transfer the total amount and upload your payment screenshot from <strong>My Orders</strong> so the admin can approve your order faster.</p>
                    <p className="mt-2 text-xs text-amber-600">Bank Name: {process.env.NEXT_PUBLIC_ADMIN_BANK_NAME || 'Contact admin'} &nbsp;|&nbsp; MoMo: {process.env.NEXT_PUBLIC_ADMIN_MOMO_NUMBER || 'Contact admin'}</p>
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
