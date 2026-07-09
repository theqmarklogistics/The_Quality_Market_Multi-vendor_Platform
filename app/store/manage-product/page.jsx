'use client'
import { useEffect, useState, useCallback } from "react"
import { toast } from "react-hot-toast"
import Image from "next/image"
import Link from "next/link"
import Loading from "@/components/Loading"
import Pagination from "@/components/Pagination"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { Pencil, Trash2, PackagePlusIcon, SearchIcon, XIcon } from "lucide-react"

const APPROVAL_STATUSES = ['', 'PENDING', 'APPROVED', 'REJECTED']

export default function StoreManageProducts() {

    const { getToken } = useAuth()

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf'

    const [loading, setLoading] = useState(true)
    const [products, setProducts] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [search, setSearch] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const fetchProducts = useCallback(async (pg = page, q = search, st = statusFilter) => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg, limit: 20 })
            if (q) params.set('search', q)
            if (st) params.set('status', st)
            const { data } = await axios.get(`/api/store/product?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const list = Array.isArray(data) ? data : (data?.products || [])
            setProducts(list)
            setTotal(data.total || list.length)
            setPage(data.page || pg)
            setPages(data.pages || 1)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }, [getToken, page, search, statusFilter])

    useEffect(() => { fetchProducts(1, search, statusFilter) }, [search, statusFilter])

    const handleSearch = (e) => {
        e.preventDefault()
        setSearch(searchInput.trim())
        setPage(1)
    }

    const clearSearch = () => {
        setSearchInput('')
        setSearch('')
    }

    const handlePageChange = (p) => {
        setPage(p)
        fetchProducts(p, search, statusFilter)
    }

    const handleStatusFilter = (st) => {
        setStatusFilter(st)
        setPage(1)
    }

    const toggleStock = async (productId) => {
        const token = await getToken()
        const { data } = await axios.post('/api/store/stock-toggle', { productId }, {
            headers: { Authorization: `Bearer ${token}` }
        })
        setProducts(products.map(p => p.id === productId ? { ...p, inStock: !p.inStock } : p))
        toast.success(data.message)
    }

    const handleDelete = async (productId, productName) => {
        if (!confirm(`Delete "${productName}"? This cannot be undone.`)) return
        try {
            const token = await getToken()
            await axios.delete(`/api/store/product/${productId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setProducts(products.filter(p => p.id !== productId))
            setTotal(t => t - 1)
            toast.success('Product deleted')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h1 className="text-2xl text-slate-500">Manage <span className="text-slate-800 font-medium">Products</span></h1>
                <Link href="/store/add-product" className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition">
                    <PackagePlusIcon size={15} /> Add Product
                </Link>
            </div>

            {/* Search + Filter bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <form onSubmit={handleSearch} className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-full text-sm w-64">
                    <SearchIcon size={15} className="text-slate-400 shrink-0" />
                    <input
                        className="flex-1 bg-transparent outline-none placeholder-slate-400 text-slate-700"
                        placeholder="Search by name…"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                    {searchInput && <button type="button" onClick={clearSearch}><XIcon size={14} className="text-slate-400 hover:text-slate-600" /></button>}
                </form>

                <div className="flex gap-1.5">
                    {APPROVAL_STATUSES.map(s => (
                        <button
                            key={s}
                            onClick={() => handleStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusFilter === s
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {s || 'All'}
                        </button>
                    ))}
                </div>

                {total > 0 && <span className="text-xs text-slate-400 ml-auto">{total} product{total !== 1 ? 's' : ''}</span>}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
                </div>
            ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70 max-w-md">
                    <PackagePlusIcon size={40} className="text-slate-300 mb-4" />
                    <p className="font-medium text-slate-600 text-lg">No products found</p>
                    <p className="text-sm text-slate-400 mt-1 mb-5">
                        {search || statusFilter ? 'Try clearing your filters.' : 'Add your first product to start selling.'}
                    </p>
                    {!search && !statusFilter && (
                        <Link href="/store/add-product" className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-900 transition">
                            <PackagePlusIcon size={16} /> Add Product
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <table className="w-full max-w-6xl text-left ring ring-slate-200 rounded overflow-hidden text-sm">
                        <thead className="bg-slate-50 text-gray-700 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3 hidden md:table-cell">Description</th>
                                <th className="px-4 py-3 hidden md:table-cell">MRP</th>
                                <th className="px-4 py-3">Price</th>
                                <th className="px-4 py-3 hidden lg:table-cell">Warehouse Qty</th>
                                <th className="px-4 py-3">Approval</th>
                                <th className="px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-700">
                            {products.map((product) => (
                                <tr key={product.id} className="border-t border-gray-200 hover:bg-gray-50 align-top">
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2 items-center">
                                            {product.images?.[0] ? (
                                                <Image width={40} height={40} className="p-1 shadow rounded object-cover" src={product.images[0]} alt={product.name} />
                                            ) : (
                                                <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center text-slate-400 text-xs">—</div>
                                            )}
                                            {product.name}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 w-80 max-w-xs text-slate-600 hidden md:table-cell">
                                        <p className="whitespace-normal break-words leading-relaxed">{product.description}</p>
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell">{currency} {product.mrp?.toLocaleString()}</td>
                                    <td className="px-4 py-3">{currency} {product.price?.toLocaleString()}</td>
                                    <td className="px-4 py-3 hidden lg:table-cell">{product.warehouseQuantity}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full ${product.approvalStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : product.approvalStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {(product.approvalStatus || 'PENDING').toLowerCase()}
                                        </span>
                                        {product.approvalStatus === 'REJECTED' && product.approvalNotes && (
                                            <p className="text-xs text-red-600 mt-1 max-w-[180px]" title={product.approvalNotes}>
                                                {product.approvalNotes.length > 60 ? product.approvalNotes.slice(0, 60) + '…' : product.approvalNotes}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <label className="relative inline-flex items-center cursor-pointer text-gray-900 gap-3">
                                                <input type="checkbox" className="sr-only peer" onChange={() => toast.promise(toggleStock(product.id), { loading: 'Updating...' })} checked={product.inStock} />
                                                <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-green-600 transition-colors duration-200"></div>
                                                <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                            </label>
                                            <Link
                                                href={`/store/edit-product/${product.id}`}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:bg-slate-100 rounded transition"
                                                title="Edit"
                                            >
                                                <Pencil className="size-4" />
                                                <span className="sr-only sm:not-sr-only sm:inline">Edit</span>
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(product.id, product.name)}
                                                className="inline-flex items-center gap-1 px-2 py-1.5 text-red-600 hover:bg-red-50 rounded transition"
                                                title="Delete"
                                            >
                                                <Trash2 className="size-4" />
                                                <span className="sr-only sm:not-sr-only sm:inline">Delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Pagination page={page} totalPages={pages} onPageChange={handlePageChange} />
                </>
            )}
        </>
    )
}
