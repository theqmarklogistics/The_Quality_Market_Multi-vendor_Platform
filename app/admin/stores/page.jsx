'use client'
import StoreInfo from "@/components/admin/StoreInfo"
import Loading from "@/components/Loading"
import Pagination from "@/components/Pagination"
import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import { MessageCircleIcon, SearchIcon, XIcon, StoreIcon, BarChart2Icon } from "lucide-react"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import toast from "react-hot-toast"

export default function AdminStores() {
    const { user } = useUser()
    const { getToken } = useAuth()
    const router = useRouter()

    const [stores, setStores] = useState([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')

    const fetchStores = useCallback(async (pg = 1, q = '') => {
        setLoading(true)
        try {
            const token = await getToken()
            const params = new URLSearchParams({ page: pg, limit: 20 })
            if (q) params.set('search', q)
            const { data } = await axios.get(`/api/admin/stores?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setStores(data.stores || [])
            setTotal(data.total || 0)
            setPage(data.page || pg)
            setPages(data.pages || 1)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }, [getToken])

    useEffect(() => {
        if (user) fetchStores(1, search)
    }, [user, search])

    const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput.trim()) }
    const clearSearch = () => { setSearchInput(''); setSearch('') }
    const handlePageChange = (p) => { fetchStores(p, search) }

    const toggleIsActive = async (storeId) => {
        const token = await getToken()
        const { data } = await axios.post('/api/admin/toggle-store', { storeId }, {
            headers: { Authorization: `Bearer ${token}` }
        })
        setStores(prev => prev.map(s => s.id === storeId ? { ...s, isActive: !s.isActive } : s))
        toast.success(data.message)
    }

    const startStoreChat = async (storeId) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/chat/conversations', { targetType: 'STORE', storeId }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            router.push(`/admin/chat/${data.conversation.id}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    if (loading && stores.length === 0) return <Loading />

    return (
        <div className="text-slate-500 mb-28">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl">Live <span className="text-slate-800 font-medium">Stores</span></h1>
                {total > 0 && <span className="text-xs text-slate-400">{total} store{total !== 1 ? 's' : ''}</span>}
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-full text-sm w-64 mb-5">
                <SearchIcon size={15} className="text-slate-400 shrink-0" />
                <input
                    className="flex-1 bg-transparent outline-none placeholder-slate-400 text-slate-700"
                    placeholder="Search by store name…"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                />
                {searchInput && <button type="button" onClick={clearSearch}><XIcon size={14} className="text-slate-400 hover:text-slate-600" /></button>}
            </form>

            {stores.length > 0 ? (
                <>
                    <div className="flex flex-col gap-4">
                        {stores.map((store) => (
                            <div key={store.id} className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 flex max-md:flex-col gap-4 md:items-end max-w-4xl">
                                <StoreInfo store={store} />
                                <div className="flex items-center gap-3 pt-2 flex-wrap">
                                    <Link
                                        href={`/admin/stores/${store.id}`}
                                        className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900 transition"
                                    >
                                        <BarChart2Icon size={15} /> View
                                    </Link>
                                    <p>Active</p>
                                    <label className="relative inline-flex items-center cursor-pointer text-gray-900">
                                        <input type="checkbox" className="sr-only peer" onChange={() => toast.promise(toggleIsActive(store.id), { loading: 'Updating…' })} checked={store.isActive} />
                                        <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-green-600 transition-colors duration-200"></div>
                                        <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => toast.promise(startStoreChat(store.id), { loading: 'Opening chat…' })}
                                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
                                    >
                                        <MessageCircleIcon size={16} /> Chat Store
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Pagination page={page} totalPages={pages} onPageChange={handlePageChange} />
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <StoreIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500 text-lg">No stores found</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {search ? 'Try a different search term.' : 'Approved stores will appear here.'}
                    </p>
                </div>
            )}
        </div>
    )
}
