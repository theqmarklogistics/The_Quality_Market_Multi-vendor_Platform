'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import Image from "next/image"
import Link from "next/link"
import ApprovedProductsChart from "@/components/admin/ApprovedProductsChart"
import {
    PackageCheckIcon,
    CheckSquareIcon,
    SquareIcon,
    SearchIcon,
    TrendingUpIcon,
    PackageIcon,
    StoreIcon,
    StarIcon,
    ArrowUpDownIcon,
    CalendarIcon,
} from "lucide-react"

const STATUS_BADGE = {
    APPROVED: 'bg-green-100 text-green-700',
    PENDING: 'bg-amber-100 text-amber-700',
    REJECTED: 'bg-red-100 text-red-700',
}

function MetricCard({ label, value, icon: Icon, tone = 'slate', hint }) {
    const bg = {
        slate: 'bg-slate-50',
        green: 'bg-green-50',
        blue: 'bg-blue-50',
        amber: 'bg-amber-50',
        violet: 'bg-violet-50',
    }
    const ic = {
        slate: 'text-slate-500',
        green: 'text-green-600',
        blue: 'text-blue-600',
        amber: 'text-amber-600',
        violet: 'text-violet-600',
    }

    return (
        <div className={`rounded-xl border border-slate-200 p-5 ${bg[tone] || bg.slate}`}>
            <div className={`mb-3 ${ic[tone] || ic.slate}`}><Icon size={22} /></div>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
            {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
        </div>
    )
}

export default function AdminProducts() {
    const { getToken } = useAuth()
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf'

    // ── Pending tab state ──────────────────────────────────────────────────────
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [rejectNotes, setRejectNotes] = useState({})
    const [rejectingId, setRejectingId] = useState(null)
    const [selected, setSelected] = useState(new Set())
    const [bulkRejectNotes, setBulkRejectNotes] = useState('')
    const [bulkMode, setBulkMode] = useState(false)

    // ── Tab & All-products state ───────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('pending')
    const [allProducts, setAllProducts] = useState([])
    const [allLoading, setAllLoading] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')
    const [nameSearch, setNameSearch] = useState('')
    const [nameInput, setNameInput] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const PAGE_SIZE = 20

    const [performanceData, setPerformanceData] = useState(null)
    const [performanceLoading, setPerformanceLoading] = useState(false)
    const [performanceDays, setPerformanceDays] = useState('30')
    const [performanceSortBy, setPerformanceSortBy] = useState('revenue')
    const [performanceSortDir, setPerformanceSortDir] = useState('desc')
    const [performancePage, setPerformancePage] = useState(1)
    const [performancePageSize, setPerformancePageSize] = useState(10)

    // ── Pending tab helpers ────────────────────────────────────────────────────
    const fetchPendingProducts = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/products', {
                headers: { Authorization: `Bearer ${token}` }
            })
            setProducts(data.products || [])
            setSelected(new Set())
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const reviewProduct = async (productId, status, notes) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/products', { productId, status, notes }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setRejectingId(null)
            setRejectNotes(prev => { const n = { ...prev }; delete n[productId]; return n })
            setProducts(prev => prev.filter(p => p.id !== productId))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const bulkReview = async (action) => {
        if (selected.size === 0) return toast.error('No products selected')
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/products/bulk', {
                ids: [...selected],
                action,
                notes: action === 'REJECTED' ? bulkRejectNotes : undefined,
            }, { headers: { Authorization: `Bearer ${token}` } })
            toast.success(data.message)
            setBulkRejectNotes('')
            setBulkMode(false)
            fetchPendingProducts()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        setSelected(prev => prev.size === products.length ? new Set() : new Set(products.map(p => p.id)))
    }

    const submitRejection = (productId) => {
        const notes = rejectNotes[productId]?.trim() || ''
        return reviewProduct(productId, 'REJECTED', notes)
    }

    // ── All-products tab helpers ───────────────────────────────────────────────
    const fetchAllProducts = async () => {
        setAllLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ view: 'all', page: String(page), pageSize: String(PAGE_SIZE) })
            if (statusFilter) params.set('status', statusFilter)
            if (nameSearch) params.set('name', nameSearch)
            const { data } = await axios.get(`/api/admin/products?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setAllProducts(data.products || [])
            setTotal(data.total || 0)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setAllLoading(false)
    }

    const fetchPerformanceProducts = async () => {
        setPerformanceLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({
                days: performanceDays,
                sortBy: performanceSortBy,
                sortDir: performanceSortDir,
                page: String(performancePage),
                pageSize: String(performancePageSize),
            })
            const { data } = await axios.get(`/api/admin/products/performance?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setPerformanceData(data)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setPerformanceLoading(false)
    }

    useEffect(() => { fetchPendingProducts() }, [])

    useEffect(() => {
        if (activeTab === 'all') fetchAllProducts()
    }, [activeTab, page, statusFilter, nameSearch])

    useEffect(() => {
        if (activeTab === 'analytics') fetchPerformanceProducts()
    }, [activeTab, performanceDays, performanceSortBy, performanceSortDir, performancePage, performancePageSize])

    const handleNameSearch = (e) => {
        e.preventDefault()
        setPage(1)
        setNameSearch(nameInput.trim())
    }

    const handlePerformanceFilterChange = (setter, value) => {
        setter(value)
        setPerformancePage(1)
    }

    if (loading) return <p className="text-slate-500">Loading pending products...</p>

    return (
        <div className="text-slate-500 mb-28">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${activeTab === 'pending' ? 'bg-white border border-b-white border-slate-200 text-slate-800 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Pending Approval
                    {products.length > 0 && (
                        <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{products.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('all')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${activeTab === 'all' ? 'bg-white border border-b-white border-slate-200 text-slate-800 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    All Products
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${activeTab === 'analytics' ? 'bg-white border border-b-white border-slate-200 text-slate-800 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Approved Analytics
                </button>
            </div>

            {/* ── Pending Approval Tab ── */}
            {activeTab === 'pending' && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h1 className="text-2xl">Approve <span className="text-slate-800 font-medium">Products</span></h1>
                        {products.length > 0 && (
                            <button onClick={() => { setBulkMode(v => !v); setSelected(new Set()) }}
                                className={`text-sm rounded-full px-3 py-1.5 border transition ${bulkMode ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                {bulkMode ? 'Cancel bulk' : 'Bulk select'}
                            </button>
                        )}
                    </div>

                    {bulkMode && products.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 max-w-5xl">
                            <button onClick={toggleSelectAll} className="text-sm text-slate-600 hover:text-slate-800 inline-flex items-center gap-1.5">
                                {selected.size === products.length
                                    ? <CheckSquareIcon size={16} className="text-slate-800" />
                                    : <SquareIcon size={16} />
                                }
                                {selected.size === products.length ? 'Deselect all' : 'Select all'}
                            </button>
                            <span className="text-xs text-slate-400">{selected.size} selected</span>
                            {selected.size > 0 && (
                                <>
                                    <button onClick={() => toast.promise(bulkReview('APPROVED'), { loading: 'Approving…' })}
                                        className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition">
                                        Approve {selected.size}
                                    </button>
                                    <div className="flex gap-2 items-center flex-wrap">
                                        <input
                                            type="text"
                                            placeholder="Rejection reason (optional)"
                                            value={bulkRejectNotes}
                                            onChange={e => setBulkRejectNotes(e.target.value)}
                                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400 w-52"
                                        />
                                        <button onClick={() => toast.promise(bulkReview('REJECTED'), { loading: 'Rejecting…' })}
                                            className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition">
                                            Reject {selected.size}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {products.length > 0 ? (
                        <div className="flex flex-col gap-4 mt-4 max-w-5xl">
                            {products.map((product) => (
                                <div key={product.id} className={`bg-white border rounded-xl shadow-sm p-5 transition ${bulkMode && selected.has(product.id) ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}>
                                    <div className="flex gap-4">
                                        {bulkMode && (
                                            <button onClick={() => toggleSelect(product.id)} className="mt-1 shrink-0">
                                                {selected.has(product.id)
                                                    ? <CheckSquareIcon size={20} className="text-slate-800" />
                                                    : <SquareIcon size={20} className="text-slate-400" />
                                                }
                                            </button>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            {/* Images row */}
                                            {product.images?.length > 0 && (
                                                <div className="flex gap-2 flex-wrap mb-4">
                                                    {product.images.map((img, idx) => (
                                                        <Image
                                                            key={idx}
                                                            src={img}
                                                            alt={product.name}
                                                            width={80}
                                                            height={80}
                                                            className="h-20 w-20 rounded-lg object-cover border border-slate-200"
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Name + store + meta */}
                                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                <p className="text-slate-800 font-semibold text-lg leading-tight">{product.name}</p>
                                                <span className="text-xs text-slate-400 shrink-0">Listed {new Date(product.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-0.5">
                                                Store:{' '}
                                                {product.store?.id
                                                    ? <Link href={`/admin/stores/${product.store.id}`} className="text-blue-600 hover:underline">{product.store.name}</Link>
                                                    : product.store?.name
                                                }
                                            </p>
                                            <p className="text-sm mb-3">Category: <span className="text-slate-700">{product.category}</span></p>

                                            {/* Description */}
                                            {product.description && (
                                                <p className="text-sm text-slate-600 leading-relaxed mb-3 max-w-2xl">{product.description}</p>
                                            )}

                                            {/* Pricing */}
                                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-2">
                                                <span>MRP: <strong className="text-slate-700">Rwf {product.mrp?.toLocaleString()}</strong></span>
                                                <span>Offer: <strong className="text-slate-700">Rwf {product.price?.toLocaleString()}</strong></span>
                                                {product.wholesalePrice && (
                                                    <span>Wholesale: <strong className="text-slate-700">Rwf {Number(product.wholesalePrice).toLocaleString()}</strong> (min {product.wholesaleMinQty || 1})</span>
                                                )}
                                            </div>

                                            {/* Stock */}
                                            <div className="text-sm flex items-center gap-2 mb-2">
                                                <span>Qty: {product.warehouseQuantity}</span>
                                                {product.warehouseQuantity === 0 && (
                                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">Out of stock</span>
                                                )}
                                            </div>

                                            {/* Shipping & origin */}
                                            {(product.weightKg || product.lengthCm || product.importOrigin) && (
                                                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                                                    {(product.weightKg || product.lengthCm) && (
                                                        <span>
                                                            Shipping:{product.weightKg && ` ${product.weightKg} kg`}
                                                            {product.lengthCm && ` · ${product.lengthCm}×${product.widthCm}×${product.heightCm} cm`}
                                                        </span>
                                                    )}
                                                    {product.importOrigin && (
                                                        <span>Origin: <strong className="text-slate-700">{product.importOrigin}</strong></span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {!bulkMode && (
                                        <div className="mt-4 border-t border-slate-100 pt-4">
                                            {rejectingId === product.id ? (
                                                <div className="space-y-2 max-w-lg">
                                                    <textarea
                                                        rows={3}
                                                        autoFocus
                                                        placeholder="Reason for rejection (shown to seller)…"
                                                        value={rejectNotes[product.id] || ''}
                                                        onChange={e => setRejectNotes(prev => ({ ...prev, [product.id]: e.target.value }))}
                                                        className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm outline-none focus:border-red-300 resize-none"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => toast.promise(submitRejection(product.id), { loading: 'Rejecting…', success: 'Product rejected', error: e => e.message })}
                                                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition"
                                                        >
                                                            Confirm Reject
                                                        </button>
                                                        <button
                                                            onClick={() => setRejectingId(null)}
                                                            className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => toast.promise(reviewProduct(product.id, 'APPROVED'), { loading: 'Approving…', success: 'Product approved', error: e => e.message })}
                                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectingId(product.id)}
                                                        className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition"
                                                    >
                                                        Reject…
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-80">
                            <PackageCheckIcon size={40} className="text-slate-300 mb-3" />
                            <p className="text-2xl text-slate-400 font-medium">No Pending Products</p>
                        </div>
                    )}
                </>
            )}

            {/* ── All Products Tab ── */}
            {activeTab === 'all' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <h1 className="text-2xl flex-1">All <span className="text-slate-800 font-medium">Products</span></h1>
                        {/* Status filter */}
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                            className="border border-slate-200 rounded-full px-4 py-2 text-sm outline-none text-slate-600 bg-white"
                        >
                            <option value="">All statuses</option>
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                        {/* Name search */}
                        <form onSubmit={handleNameSearch} className="flex items-center gap-2 border border-slate-200 rounded-full px-4 py-2 bg-white">
                            <SearchIcon size={14} className="text-slate-400" />
                            <input
                                type="text"
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                placeholder="Search by name…"
                                className="outline-none text-sm text-slate-700 w-40 bg-transparent"
                            />
                        </form>
                    </div>

                    {allLoading ? (
                        <p className="text-slate-400 text-sm py-8">Loading products…</p>
                    ) : allProducts.length === 0 ? (
                        <p className="text-slate-400 text-sm py-8">No products found.</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400 font-medium">
                                            <th className="text-left px-4 py-3">Product</th>
                                            <th className="text-left px-3 py-3">Store</th>
                                            <th className="text-left px-3 py-3">Category</th>
                                            <th className="text-left px-3 py-3">Status</th>
                                            <th className="text-right px-3 py-3">Price (Rwf)</th>
                                            <th className="text-right px-3 py-3">Orders</th>
                                            <th className="text-right px-3 py-3">Reviews</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allProducts.map(p => (
                                            <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {p.images?.[0] && (
                                                            <Image src={p.images[0]} alt={p.name} width={40} height={40} className="h-10 w-10 rounded-md object-cover border border-slate-100 shrink-0" />
                                                        )}
                                                        <Link href={`/admin/products/${p.id}/analytics`} className="font-medium text-slate-700 line-clamp-2 max-w-[200px]">{p.name}</Link>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    {p.store?.id
                                                        ? <Link href={`/admin/stores/${p.store.id}`} className="text-blue-600 hover:underline">{p.store.name}</Link>
                                                        : <span className="text-slate-400">—</span>
                                                    }
                                                </td>
                                                <td className="px-3 py-3 text-slate-500">{p.category || '—'}</td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.approvalStatus] || 'bg-slate-100 text-slate-500'}`}>
                                                        {p.approvalStatus}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right text-slate-700">{p.price?.toLocaleString()}</td>
                                                <td className="px-3 py-3 text-right font-medium text-slate-700">{p._count?.orderItems ?? 0}</td>
                                                <td className="px-3 py-3 text-right text-slate-500">{p._count?.ratings ?? 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
                                <span>{total} product{total !== 1 ? 's' : ''} total</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1.5 border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                    >
                                        Previous
                                    </button>
                                    <span className="px-3 py-1.5">Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
                                    <button
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={page >= Math.ceil(total / PAGE_SIZE)}
                                        className="px-3 py-1.5 border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ── Approved Analytics Tab ── */}
            {activeTab === 'analytics' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <h1 className="text-2xl flex-1">Approved <span className="text-slate-800 font-medium">Analytics</span></h1>
                        <div className="flex flex-wrap gap-2">
                            {['7', '30', '90', 'all'].map((value) => (
                                <button
                                    key={value}
                                    onClick={() => handlePerformanceFilterChange(setPerformanceDays, value)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition ${performanceDays === value ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {value === 'all' ? 'All time' : `${value}d`}
                                </button>
                            ))}
                        </div>
                        <select
                            value={performanceSortBy}
                            onChange={e => handlePerformanceFilterChange(setPerformanceSortBy, e.target.value)}
                            className="border border-slate-200 rounded-full px-4 py-2 text-sm outline-none text-slate-600 bg-white"
                        >
                            <option value="revenue">Sort by revenue</option>
                            <option value="unitsSold">Sort by units sold</option>
                            <option value="orders">Sort by orders</option>
                            <option value="rating">Sort by rating</option>
                            <option value="stock">Sort by stock</option>
                            <option value="age">Sort by approval age</option>
                            <option value="name">Sort by name</option>
                        </select>
                        <button
                            onClick={() => {
                                setPerformanceSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
                                setPerformancePage(1)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
                        >
                            <ArrowUpDownIcon size={15} />
                            {performanceSortDir === 'asc' ? 'Ascending' : 'Descending'}
                        </button>
                    </div>

                    {performanceLoading ? (
                        <p className="text-slate-400 text-sm py-8">Loading approved product analytics…</p>
                    ) : !performanceData ? (
                        <p className="text-slate-400 text-sm py-8">No analytics data available.</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6 max-w-6xl">
                                <MetricCard label="Approved Products" value={performanceData.summary?.approvedProducts ?? 0} icon={PackageIcon} tone="slate" />
                                <MetricCard label="Revenue" value={`${currency} ${Number(performanceData.summary?.totalRevenue || 0).toLocaleString()}`} icon={TrendingUpIcon} tone="green" hint={`Range: ${performanceDays === 'all' ? 'all time' : `${performanceDays} days`}`} />
                                <MetricCard label="Units Sold" value={Number(performanceData.summary?.totalUnitsSold || 0).toLocaleString()} icon={PackageCheckIcon} tone="blue" />
                                <MetricCard label="Orders" value={Number(performanceData.summary?.totalOrders || 0).toLocaleString()} icon={SearchIcon} tone="amber" />
                                <MetricCard label="Average Rating" value={(performanceData.summary?.averageRating || 0).toFixed(1)} icon={StarIcon} tone="violet" hint={`${Number(performanceData.summary?.reviewCount || 0).toLocaleString()} reviews`} />
                                <MetricCard label="Inventory Remaining" value={Number(performanceData.summary?.totalStock || 0).toLocaleString()} icon={CalendarIcon} tone="slate" />
                            </div>

                            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 max-w-6xl shadow-sm">
                                {performanceData.trend?.length > 0 ? (
                                    <ApprovedProductsChart trend={performanceData.trend} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-72 text-center">
                                        <TrendingUpIcon size={34} className="text-slate-300 mb-2" />
                                        <p className="text-slate-500 font-medium">No sales in the selected range</p>
                                        <p className="text-sm text-slate-400 mt-1">The chart will populate once approved products have order activity.</p>
                                    </div>
                                )}
                            </div>

                            {performanceData.products?.length > 0 ? (
                                <>
                                    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-w-6xl">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400 font-medium">
                                                    <th className="text-left px-4 py-3">Product</th>
                                                    <th className="text-left px-3 py-3">Store</th>
                                                    <th className="text-right px-3 py-3">Units</th>
                                                    <th className="text-right px-3 py-3">Revenue</th>
                                                    <th className="text-right px-3 py-3">Orders</th>
                                                    <th className="text-right px-3 py-3">Rating</th>
                                                    <th className="text-right px-3 py-3">Stock</th>
                                                    <th className="text-right px-3 py-3">Approved Age</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {performanceData.products.map(p => (
                                                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                {p.images?.[0] && (
                                                                    <Image src={p.images[0]} alt={p.name} width={40} height={40} className="h-10 w-10 rounded-md object-cover border border-slate-100 shrink-0" />
                                                                )}
                                                                <div className="min-w-0">
                                                                    <Link href={`/admin/products/${p.id}/analytics`} className="font-medium text-slate-700 line-clamp-2 block max-w-[240px]">{p.name}</Link>
                                                                    <span className="text-xs text-slate-400">Rank #{p.rank}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {p.store?.id
                                                                ? <Link href={`/admin/stores/${p.store.id}`} className="text-blue-600 hover:underline">{p.store.name}</Link>
                                                                : <span className="text-slate-400">—</span>
                                                            }
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-slate-700">{Number(p.unitsSold || 0).toLocaleString()}</td>
                                                        <td className="px-3 py-3 text-right font-medium text-slate-700">{currency} {Number(p.revenue || 0).toLocaleString()}</td>
                                                        <td className="px-3 py-3 text-right text-slate-700">{Number(p.orderCount || 0).toLocaleString()}</td>
                                                        <td className="px-3 py-3 text-right text-slate-700">{Number(p.averageRating || 0).toFixed(1)} <span className="text-slate-400 text-xs">({Number(p.reviewCount || 0)})</span></td>
                                                        <td className="px-3 py-3 text-right text-slate-700">{Number(p.warehouseQuantity || 0).toLocaleString()}</td>
                                                        <td className="px-3 py-3 text-right text-slate-400 whitespace-nowrap">{Number(p.approvalAgeDays || 0)} days</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-slate-500 max-w-6xl">
                                        <span>{performanceData.total} approved product{performanceData.total !== 1 ? 's' : ''} total</span>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={performancePageSize}
                                                onChange={e => handlePerformanceFilterChange(setPerformancePageSize, Number(e.target.value))}
                                                className="border border-slate-200 rounded-full px-3 py-1.5 text-sm outline-none text-slate-600 bg-white"
                                            >
                                                <option value={5}>5 / page</option>
                                                <option value={10}>10 / page</option>
                                                <option value={20}>20 / page</option>
                                                <option value={50}>50 / page</option>
                                            </select>
                                            <button
                                                onClick={() => setPerformancePage(p => Math.max(1, p - 1))}
                                                disabled={performanceData.pagination?.page === 1}
                                                className="px-3 py-1.5 border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-3 py-1.5">Page {performanceData.pagination?.page || 1} of {performanceData.pagination?.pages || 1}</span>
                                            <button
                                                onClick={() => setPerformancePage(p => Math.min(performanceData.pagination?.pages || 1, p + 1))}
                                                disabled={(performanceData.pagination?.page || 1) >= (performanceData.pagination?.pages || 1)}
                                                className="px-3 py-1.5 border border-slate-200 rounded-full hover:bg-slate-50 disabled:opacity-40 transition"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-80 bg-white border border-slate-200 rounded-xl max-w-6xl">
                                    <PackageIcon size={40} className="text-slate-300 mb-3" />
                                    <p className="text-2xl text-slate-400 font-medium">No approved products found</p>
                                    <p className="text-sm text-slate-400 mt-1">Approved products will appear here once they are listed and moderated.</p>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
