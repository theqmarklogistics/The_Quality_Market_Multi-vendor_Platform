"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"
import toast from "react-hot-toast"
import Image from "next/image"
import Link from "next/link"
import {
    ArrowLeftIcon,
    StarIcon,
    ShoppingBagIcon,
    PackageIcon,
    TrendingUpIcon,
    BadgeCheckIcon,
    ClockIcon,
    TruckIcon,
    CheckCircle2Icon,
    BanknoteIcon,
    AlertCircleIcon,
    BoxIcon,
} from "lucide-react"

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "Rwf"

const MODEL_LABELS = {
    FULL_MANAGED: "Full Managed",
    LOCAL_SELLER: "Local Seller",
}
const MODEL_COLORS = {
    FULL_MANAGED: "bg-blue-100 text-blue-700",
    LOCAL_SELLER: "bg-green-100 text-green-700",
}

const STATUS_LABELS = {
    ORDER_PLACED: "Placed",
    PROCESSING: "Processing",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
}
const STATUS_COLORS = {
    ORDER_PLACED: "bg-yellow-100 text-yellow-700",
    PROCESSING: "bg-blue-100 text-blue-700",
    SHIPPED: "bg-purple-100 text-purple-700",
    DELIVERED: "bg-green-100 text-green-700",
}

function KpiCard({ label, value, icon: Icon, tone = "slate" }) {
    const bg = { slate: "bg-slate-50", green: "bg-green-50", blue: "bg-blue-50", orange: "bg-orange-50" }
    const ic = { slate: "text-slate-500", green: "text-green-600", blue: "text-blue-600", orange: "text-orange-500" }
    return (
        <div className={`rounded-xl border border-slate-200 p-5 ${bg[tone]}`}>
            <div className={`mb-3 ${ic[tone]}`}><Icon size={22} /></div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        </div>
    )
}

function StatusPill({ label, count, color }) {
    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
            <span>{label}</span>
            <span className="font-bold">{count}</span>
        </div>
    )
}

export default function StorePerformancePage() {
    const { storeId } = useParams()
    const { getToken } = useAuth()
    const router = useRouter()

    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = await getToken()
                const { data: res } = await axios.get(`/api/admin/stores/${storeId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setData(res)
            } catch (error) {
                toast.error(error?.response?.data?.error || error.message)
                if (error?.response?.status === 404) router.push("/admin/stores")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [storeId, getToken, router])

    if (loading) return (
        <div className="flex items-center justify-center h-60">
            <div className="w-9 h-9 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
    )

    if (!data) return null

    const { store, metrics, recentOrders } = data
    const m = metrics

    const stars = Array.from({ length: 5 }, (_, i) => i < Math.round(m.avgRating))

    return (
        <div className="text-slate-700 mb-28 max-w-5xl">
            {/* Back */}
            <Link href="/admin/stores" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition mb-5">
                <ArrowLeftIcon size={15} /> Back to Stores
            </Link>

            {/* Store header */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6 flex flex-wrap gap-4 items-start">
                {store.logo && (
                    <Image src={store.logo} alt={store.name} width={72} height={72} className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h1 className="text-xl font-bold text-slate-900">{store.name}</h1>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODEL_COLORS[store.sellerModel] || "bg-slate-100 text-slate-600"}`}>
                            {MODEL_LABELS[store.sellerModel] || store.sellerModel}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${store.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {store.isActive ? "Active" : "Inactive"}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500">@{store.username}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-500">
                        <span>{store.email}</span>
                        <span>{store.contact}</span>
                        <span>{store.address}</span>
                    </div>
                    {store.rejectionNotes && (
                        <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">Rejection notes: {store.rejectionNotes}</p>
                    )}
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Total Revenue" value={`${currency} ${m.totalRevenue.toLocaleString()}`} icon={TrendingUpIcon} tone="green" />
                <KpiCard label="Total Orders" value={m.totalOrders} icon={ShoppingBagIcon} tone="blue" />
                <KpiCard label="Total Products" value={m.totalProducts} icon={PackageIcon} tone="slate" />
                <KpiCard label="Platform Commission" value={`${currency} ${m.totalCommission.toLocaleString()}`} icon={BanknoteIcon} tone="orange" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Orders breakdown */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h2 className="font-semibold text-slate-800 mb-3">Orders by Status</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                            <StatusPill key={key} label={label} count={m.ordersByStatus[key] || 0} color={STATUS_COLORS[key]} />
                        ))}
                    </div>
                    <div className="flex gap-4 text-sm text-slate-600 border-t border-slate-100 pt-3">
                        <span className="flex items-center gap-1"><CheckCircle2Icon size={14} className="text-green-600" /> {m.paidOrders} paid</span>
                        <span className="flex items-center gap-1"><ClockIcon size={14} className="text-yellow-500" /> {m.totalOrders - m.paidOrders} unpaid</span>
                        {m.pendingPaymentProofs > 0 && (
                            <span className="flex items-center gap-1"><AlertCircleIcon size={14} className="text-orange-500" /> {m.pendingPaymentProofs} proof pending</span>
                        )}
                    </div>
                </div>

                {/* Products & Ratings */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h2 className="font-semibold text-slate-800 mb-3">Products</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                        <StatusPill label="Approved" count={m.productsByStatus.APPROVED} color="bg-green-100 text-green-700" />
                        <StatusPill label="Pending" count={m.productsByStatus.PENDING} color="bg-yellow-100 text-yellow-700" />
                        <StatusPill label="Rejected" count={m.productsByStatus.REJECTED} color="bg-red-100 text-red-600" />
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                        <h2 className="font-semibold text-slate-800 mb-2">Ratings</h2>
                        {m.totalRatings === 0 ? (
                            <p className="text-sm text-slate-400">No reviews yet</p>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="flex">
                                    {stars.map((filled, i) => (
                                        <StarIcon key={i} size={16} className={filled ? "text-yellow-400 fill-yellow-400" : "text-slate-300"} />
                                    ))}
                                </div>
                                <span className="text-sm font-medium text-slate-700">{m.avgRating}</span>
                                <span className="text-xs text-slate-400">({m.totalRatings} review{m.totalRatings !== 1 ? "s" : ""})</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent orders */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">Recent Orders <span className="text-slate-400 font-normal text-sm">(last {recentOrders.length})</span></h2>
                </div>
                {recentOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <BoxIcon size={32} className="text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400">No orders yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <tr>
                                    {["#", "Customer", "Items", "Total", "Payment", "Status", "Date"].map(h => (
                                        <th key={h} className="px-4 py-3">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {recentOrders.map((order, i) => (
                                    <tr key={order.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-green-600 font-medium">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-800">{order.user?.name}</p>
                                            <p className="text-xs text-slate-400">{order.user?.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{order.orderItems.length} item{order.orderItems.length !== 1 ? "s" : ""}</td>
                                        <td className="px-4 py-3 font-medium text-slate-800">{currency} {Number(order.total).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${order.isPaid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                                {order.paymentStatus || (order.isPaid ? "PAID" : "PENDING")}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || "bg-slate-100 text-slate-600"}`}>
                                                {STATUS_LABELS[order.status] || order.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(order.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}