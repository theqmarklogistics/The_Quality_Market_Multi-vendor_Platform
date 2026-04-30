'use client'

import Loading from "@/components/Loading"
import OrdersAreaChart from "@/components/OrdersAreaChart"
import { useAuth } from "@clerk/nextjs"
import {
    BellIcon,
    CircleDollarSignIcon,
    PackageCheckIcon,
    ShoppingBasketIcon,
    StoreIcon,
    TagsIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"

export default function AdminDashboard() {
    const { getToken } = useAuth()
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf'

    const [loading, setLoading] = useState(true)
    const [dashboardData, setDashboardData] = useState({
        products: 0,
        revenue: 0,
        orders: 0,
        newOrders: 0,
        stores: 0,
        pendingStores: 0,
        pendingProducts: 0,
        pendingPaymentProofs: 0,
        unreadChatMessages: 0,
        allOrders: [],
    })

    const fetchDashboardData = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/dashboard', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            setDashboardData({
                products: 0,
                revenue: 0,
                orders: 0,
                newOrders: 0,
                stores: 0,
                pendingStores: 0,
                pendingProducts: 0,
                pendingPaymentProofs: 0,
                unreadChatMessages: 0,
                allOrders: [],
                ...data,
            })
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDashboardData()
    }, [])

    useEffect(() => {
        const onCountsUpdated = (event) => {
            const detail = event?.detail || {}
            setDashboardData((prev) => ({
                ...prev,
                pendingStores: detail.pendingStores || 0,
                pendingProducts: detail.pendingProducts || 0,
                pendingPaymentProofs: detail.pendingPaymentProofs || 0,
                newOrders: detail.newOrders || 0,
                unreadChatMessages: detail.unreadChatMessages || 0,
            }))
        }

        window.addEventListener('admin:counts-updated', onCountsUpdated)
        return () => window.removeEventListener('admin:counts-updated', onCountsUpdated)
    }, [])

    if (loading) return <Loading />

    const summaryCards = [
        { title: 'Total Products', value: dashboardData.products, icon: ShoppingBasketIcon },
        { title: 'Total Revenue', value: `${currency}${dashboardData.revenue}`, icon: CircleDollarSignIcon },
        { title: 'Total Orders', value: dashboardData.orders, icon: TagsIcon },
        { title: 'Total Stores', value: dashboardData.stores, icon: StoreIcon },
        { title: 'Pending Products', value: dashboardData.pendingProducts, icon: PackageCheckIcon },
        { title: 'Pending Proofs', value: dashboardData.pendingPaymentProofs, icon: PackageCheckIcon },
    ]

    const notificationCards = [
        { title: 'New Orders', value: dashboardData.newOrders, icon: TagsIcon, tone: 'text-blue-600 bg-blue-50 border-blue-100' },
        { title: 'Pending Stores', value: dashboardData.pendingStores, icon: StoreIcon, tone: 'text-amber-600 bg-amber-50 border-amber-100' },
        { title: 'Pending Products', value: dashboardData.pendingProducts, icon: PackageCheckIcon, tone: 'text-violet-600 bg-violet-50 border-violet-100' },
        { title: 'Pending Payments', value: dashboardData.pendingPaymentProofs, icon: PackageCheckIcon, tone: 'text-rose-600 bg-rose-50 border-rose-100' },
        { title: 'Unread Chats', value: dashboardData.unreadChatMessages, icon: BellIcon, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    ]

    return (
        <div className="text-slate-500">
            <h1 className="text-2xl">Admin <span className="text-slate-800 font-medium">Dashboard</span></h1>

            <div className="flex flex-wrap gap-5 my-10 mt-4">
                {summaryCards.map((card, index) => (
                    <div key={index} className="flex items-center gap-10 border border-slate-200 p-3 px-6 rounded-lg">
                        <div className="flex flex-col gap-3 text-xs">
                            <p>{card.title}</p>
                            <b className="text-2xl font-medium text-slate-700">{card.value}</b>
                        </div>
                        <card.icon size={50} className="w-11 h-11 p-2.5 text-slate-400 bg-slate-100 rounded-full" />
                    </div>
                ))}
            </div>

            <div className="mt-10">
                <h2 className="text-lg font-medium text-slate-700 mb-4">Notifications</h2>
                <div className="flex flex-wrap gap-4">
                    {notificationCards.map((card, index) => (
                        <div key={index} className={`flex items-center gap-4 border p-3 px-5 rounded-lg ${card.tone}`}>
                            <div className="flex flex-col gap-1 text-xs min-w-28">
                                <p>{card.title}</p>
                                <b className="text-2xl font-medium">{card.value}</b>
                            </div>
                            <card.icon size={42} className="w-10 h-10 p-2 rounded-full bg-white/80" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-12">
                <OrdersAreaChart allOrders={dashboardData.allOrders} />
            </div>
        </div>
    )
}
