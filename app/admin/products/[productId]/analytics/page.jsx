"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useParams, useRouter } from "next/navigation"
import axios from "axios"
import toast from "react-hot-toast"
import Link from "next/link"
import Image from "next/image"
import ApprovedProductsChart from "@/components/admin/ApprovedProductsChart"
import { ArrowLeftIcon, StarIcon, PackageCheckIcon, TrendingUpIcon, CalendarIcon } from "lucide-react"

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf'

function MetricCard({ label, value, icon: Icon, tone = 'slate', hint }) {
    const bg = { slate: 'bg-slate-50', green: 'bg-green-50', blue: 'bg-blue-50' }
    const ic = { slate: 'text-slate-500', green: 'text-green-600', blue: 'text-blue-600' }
    return (
        <div className={`rounded-xl border border-slate-200 p-5 ${bg[tone]}`}> 
            <div className={`mb-3 ${ic[tone] || ic.slate}`}><Icon size={22} /></div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
            {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
        </div>
    )
}

export default function ProductAnalyticsPage() {
    const { productId } = useParams()
    const { getToken } = useAuth()
    const router = useRouter()

    const [days, setDays] = useState('30')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetch = async () => {
            setLoading(true)
            try {
                const token = await getToken()
                const params = new URLSearchParams({ days })
                const { data } = await axios.get(`/api/admin/products/performance/${productId}?${params}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setData(data)
            } catch (error) {
                toast.error(error?.response?.data?.error || error.message)
                if (error?.response?.status === 404) router.push('/admin/products')
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [productId, days, getToken, router])

    if (loading) return (
        <div className="flex items-center justify-center h-40">
            <div className="w-9 h-9 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
    )

    if (!data) return null

    const product = data.product

    return (
        <div className="text-slate-700 mb-28 max-w-6xl">
            <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition mb-5">
                <ArrowLeftIcon size={15} /> Back to Products
            </Link>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6 flex items-start gap-4">
                {product.images?.[0] && (
                    <Image src={product.images[0]} alt={product.name} width={72} height={72} className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
                    <p className="text-sm text-slate-500">Category: {product.category || '—'}</p>
                    <p className="text-sm text-slate-500">Listed: {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '—'}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard label="Units Sold" value={Number(product.unitsSold || 0).toLocaleString()} icon={PackageCheckIcon} tone="blue" />
                <MetricCard label="Revenue" value={`${currency} ${Number(product.revenue || 0).toLocaleString()}`} icon={TrendingUpIcon} tone="green" />
                <MetricCard label="Orders" value={Number(product.orderCount || 0).toLocaleString()} icon={CalendarIcon} tone="slate" />
                <MetricCard label="Avg Rating" value={(Number(product.averageRating || 0)).toFixed(1)} icon={StarIcon} tone="slate" hint={`${Number(product.reviewCount || 0)} reviews`} />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-slate-800">Sales Trend</h2>
                    <div className="flex gap-2">
                        {['7','30','90','all'].map(v => (
                            <button key={v} onClick={() => setDays(v)} className={`px-3 py-1.5 rounded-full text-sm border transition ${days===v ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{v==='all'?'All':`${v}d`}</button>
                        ))}
                    </div>
                </div>
                {data.trend?.length > 0 ? (
                    <ApprovedProductsChart trend={data.trend} />
                ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                        <TrendingUpIcon size={34} className="text-slate-300 mb-2" />
                        <p className="text-slate-500 font-medium">No sales in the selected range</p>
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="font-semibold text-slate-800 mb-3">Recent Orders</h2>
                {data.recentOrders?.length === 0 ? (
                    <p className="text-sm text-slate-400">No recent orders for this product.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {data.recentOrders.map(o => (
                            <div key={o.id} className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-slate-700">Order #{o.id}</p>
                                    <p className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleString()} · {o.user?.name || o.user?.email}</p>
                                </div>
                                <div className="text-sm text-slate-700">{currency} {Number(o.total || 0).toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
