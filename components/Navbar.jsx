'use client'
import { MessageCircleIcon, PackageIcon, Search, ShoppingCart, User, TruckIcon, ChevronDownIcon, LayoutGridIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useAuth, useClerk, useUser, UserButton } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { assets } from "@/assets/assets";
import { XIcon } from "lucide-react";

const Navbar = () => {

    const { user } = useUser();
    const { openSignIn } = useClerk();
    const { getToken } = useAuth();

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('')
    const [categories, setCategories] = useState([])
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [isSeller, setIsSeller] = useState(false)
    const [staffRole, setStaffRole] = useState(null) // RIDER | LOGISTICS_MANAGER | ...
    const [loadingAccess, setLoadingAccess] = useState(false)
    const [unreadChats, setUnreadChats] = useState(0)
    const [workspacesOpen, setWorkspacesOpen] = useState(false)
    const workspacesRef = useRef(null)
    const cartCount = useSelector(state => state.cart.total)

    useEffect(() => {
        setSearch(searchParams.get('search') || '')
        setSelectedCategory(searchParams.get('category') || '')
    }, [searchParams])

    useEffect(() => {
        fetch('/api/categories')
            .then(r => r.json())
            .then(d => setCategories((d.categories || []).map(c => c.name)))
            .catch(() => {})
    }, [])

    useEffect(() => {
        let mounted = true

        const fetchAccess = async () => {
            if (!user) {
                setIsAdmin(false)
                setIsSeller(false)
                return
            }

            const cacheKey = `access_${user.id}`
            const cached = sessionStorage.getItem(cacheKey)
            if (cached) {
                try {
                    const { isAdmin: a, isSeller: s, ts } = JSON.parse(cached)
                    if (Date.now() - ts < 5 * 60 * 1000) {
                        setIsAdmin(a)
                        setIsSeller(s)
                        return
                    }
                } catch (_) {}
            }

            setLoadingAccess(true)

            try {
                const token = await getToken()

                const [adminResponse, sellerResponse] = await Promise.all([
                    axios.get('/api/admin/is-admin', {
                        headers: { Authorization: `Bearer ${token}` },
                        validateStatus: () => true
                    }),
                    axios.get('/api/store/is-seller', {
                        headers: { Authorization: `Bearer ${token}` },
                        validateStatus: () => true
                    })
                ])

                if (!mounted) return

                const a = adminResponse.status === 200 && Boolean(adminResponse.data?.isAdmin)
                const s = sellerResponse.status === 200 && Boolean(sellerResponse.data?.isSeller)
                setIsAdmin(a)
                setIsSeller(s)
                sessionStorage.setItem(cacheKey, JSON.stringify({ isAdmin: a, isSeller: s, ts: Date.now() }))
            } catch (error) {
                if (!mounted) return
                toast.error(error?.response?.data?.error || error.message)
                setIsAdmin(false)
                setIsSeller(false)
            } finally {
                if (mounted) {
                    setLoadingAccess(false)
                }
            }
        }

        fetchAccess()

        return () => {
            mounted = false
        }
    }, [user, getToken])

    // Detect rider / logistics roles to surface their dashboard shortcuts.
    useEffect(() => {
        let mounted = true
        if (!user) { setStaffRole(null); return }
        const run = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/me/role', {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: () => true,
                })
                if (mounted) setStaffRole(data?.role ?? null)
            } catch (_) {
                if (mounted) setStaffRole(null)
            }
        }
        run()
        return () => { mounted = false }
    }, [user, getToken])

    // Fetch unread message count when user is present; re-fetches whenever pathname
    // changes so the badge updates after the user visits a chat room.
    useEffect(() => {
        if (!user) { setUnreadChats(0); return }
        let mounted = true
        const fetchUnread = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/chat/conversations', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (!mounted) return
                const total = (data.conversations || []).reduce(
                    (acc, c) => acc + (c._count?.messages || 0), 0
                )
                setUnreadChats(total)
            } catch (_) {}
        }
        fetchUnread()
        return () => { mounted = false }
    }, [user, pathname, getToken])

    const handleSearch = (e) => {
        e.preventDefault()
        const query = search.trim()
        const params = new URLSearchParams(searchParams.toString())
        if (query) params.set('search', query)
        else params.delete('search')
        if (selectedCategory) params.set('category', selectedCategory)
        else params.delete('category')
        router.push(`/shop${params.toString() ? `?${params.toString()}` : ''}`)
    }

    const clearSearch = () => {
        setSearch('')
        if (pathname === '/shop' || pathname.startsWith('/shop')) {
            const params = new URLSearchParams(searchParams.toString())
            params.delete('search')
            router.push(`/shop${params.toString() ? `?${params.toString()}` : ''}`)
        }
    }

    const openAdminConversation = async () => {
        if (!user) {
            openSignIn()
            return
        }

        try {
            const token = await getToken()
            const { data } = await axios.post('/api/chat/conversations', { targetType: 'ADMIN' }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            const conversationId = data?.conversation?.id || data?.conversation?.conversationId || data?.id
            if (!conversationId) {
                toast.error('Unable to open admin chat')
                return
            }

            router.push(`/store/chat/${conversationId}`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const canShowAccessActions = user && !loadingAccess

    // Role-based dashboard shortcuts. Grouped so the nav footprint stays fixed
    // no matter how many roles a user holds — a single role renders as a direct
    // pill, multiple roles collapse into one "Workspaces" dropdown.
    const dashboards = []
    if (canShowAccessActions && isAdmin) dashboards.push({ href: '/admin', label: 'Admin Dashboard', color: 'bg-slate-50 text-slate-800 hover:bg-slate-100' })
    if (canShowAccessActions && isSeller) dashboards.push({ href: '/store', label: 'Store Dashboard', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' })
    if (staffRole === 'RIDER') dashboards.push({ href: '/rider', label: 'Rider Console', color: 'bg-green-50 text-green-700 hover:bg-green-100' })
    if (staffRole === 'LOGISTICS_MANAGER' || isAdmin) dashboards.push({ href: '/logistics', label: 'Dispatch', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' })
    if (staffRole === 'EXTERNAL_SELLER') dashboards.push({ href: '/external', label: 'My Deliveries', color: 'bg-green-50 text-green-700 hover:bg-green-100' })

    // Close the workspaces dropdown on outside click or route change.
    useEffect(() => {
        if (!workspacesOpen) return
        const onClick = (e) => {
            if (workspacesRef.current && !workspacesRef.current.contains(e.target)) {
                setWorkspacesOpen(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [workspacesOpen])

    useEffect(() => { setWorkspacesOpen(false) }, [pathname])

    return (
        <nav className="relative bg-white">
            <div className="mx-6">
                <div className="flex items-center justify-between max-w-7xl mx-auto py-4  transition-all">

                    <Link href="/" className="relative flex items-center gap-2">
                        <Image src={assets.brandLogo} alt="The Quality Market" width={200} height={56} className="h-14 w-auto object-contain" priority />
                        <div className="hidden lg:flex flex-col leading-tight">
                            <span className="font-bold text-sm" style={{ color: '#4f6bcb' }}>The Quality Market</span>
                            <span className="text-xs italic" style={{ color: '#79cc4f' }}>Quality is our Culture</span>
                        </div>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden sm:flex items-center gap-4 lg:gap-8 text-slate-600">
                        <Link href="/">Home</Link>
                        <Link href="/shop">Shop</Link>
                        <Link href="/about">About</Link>
                        <Link href="/contact">Contact</Link>

                        <form onSubmit={handleSearch} className="hidden xl:flex items-center text-sm bg-slate-100 rounded-full overflow-hidden">
                            <select
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                                className="bg-slate-100 text-slate-500 text-xs pl-4 pr-2 py-3 border-r border-slate-300 outline-none cursor-pointer max-w-[130px]"
                            >
                                <option value="">Category</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            <div className="flex items-center gap-2 px-3 py-3 flex-1">
                                <Search size={16} className="text-slate-600 shrink-0" />
                                <input className="bg-transparent outline-none placeholder-slate-600 w-36" type="text" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
                                {search && (
                                    <button type="button" onClick={clearSearch} className="text-slate-400 hover:text-slate-600 transition">
                                        <XIcon size={16} />
                                    </button>
                                )}
                            </div>
                        </form>

                        <Link href="/cart" className="relative flex items-center gap-2 text-slate-600" aria-label="View cart">
                            <ShoppingCart size={18} />
                            Cart
                            <span className="absolute -top-1 left-3 flex items-center justify-center text-[8px] text-white bg-slate-600 size-3.5 rounded-full">{cartCount}</span>
                        </Link>

                        {user && (
                            <Link href="/chat" className="relative flex items-center gap-2 text-slate-600" aria-label="View chats">
                                <MessageCircleIcon size={18} />
                                Chats
                                {unreadChats > 0 && (
                                    <span className="absolute -top-1 left-3 flex items-center justify-center text-[8px] text-white bg-indigo-500 size-3.5 rounded-full">
                                        {unreadChats > 9 ? '9+' : unreadChats}
                                    </span>
                                )}
                            </Link>
                        )}

                        {/* Public invite for off-platform sellers to use our delivery service.
                            Hidden once they already hold the role (they get "My Deliveries"). */}
                        {staffRole !== 'EXTERNAL_SELLER' && (
                            <Link href="/external" className="flex items-center gap-1.5 px-3 py-1 bg-green-600 text-white rounded-full text-sm hover:bg-green-700 transition">
                                <TruckIcon size={14} /> Deliver with us
                            </Link>
                        )}

                        {/* Role dashboard shortcuts — a lone role shows as a direct pill,
                            multiple roles collapse into one dropdown so the nav never overflows. */}
                        {dashboards.length === 1 && (
                            <Link href={dashboards[0].href} className={`whitespace-nowrap px-3 py-1 rounded-full text-sm ${dashboards[0].color}`}>
                                {dashboards[0].label}
                            </Link>
                        )}
                        {dashboards.length > 1 && (
                            <div className="relative" ref={workspacesRef}>
                                <button
                                    type="button"
                                    onClick={() => setWorkspacesOpen(v => !v)}
                                    aria-haspopup="menu"
                                    aria-expanded={workspacesOpen}
                                    className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1 bg-slate-50 text-slate-800 rounded-full text-sm hover:bg-slate-100 transition"
                                >
                                    <LayoutGridIcon size={14} /> Workspaces
                                    <ChevronDownIcon size={14} className={`transition-transform ${workspacesOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {workspacesOpen && (
                                    <div role="menu" className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
                                        {dashboards.map(d => (
                                            <Link
                                                key={d.href}
                                                href={d.href}
                                                role="menuitem"
                                                onClick={() => setWorkspacesOpen(false)}
                                                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                            >
                                                {d.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        { !user ? (
                            <button onClick={openSignIn} className="px-8 py-2 bg-indigo-500 hover:bg-indigo-600 transition text-white rounded-full">
                                Login
                            </button>
                        ) : (
                            <UserButton>
                                <UserButton.MenuItems>
                                    {canShowAccessActions && isAdmin && (
                                        <UserButton.Action labelIcon={<User size={16} />} label="Admin Dashboard" onClick={() => router.push('/admin')} />
                                    )}
                                    {canShowAccessActions && isSeller && (
                                        <>
                                            <UserButton.Action labelIcon={<User size={16} />} label="Store Dashboard" onClick={() => router.push('/store')} />
                                            <UserButton.Action labelIcon={<MessageCircleIcon size={16} />} label="Contact Admin" onClick={openAdminConversation} />
                                        </>
                                    )}
                                    {staffRole === 'RIDER' && (
                                        <UserButton.Action labelIcon={<TruckIcon size={16} />} label="Rider Console" onClick={() => router.push('/rider')} />
                                    )}
                                    {(staffRole === 'LOGISTICS_MANAGER' || isAdmin) && (
                                        <UserButton.Action labelIcon={<TruckIcon size={16} />} label="Dispatch Board" onClick={() => router.push('/logistics')} />
                                    )}
                                    {staffRole === 'EXTERNAL_SELLER' && (
                                        <UserButton.Action labelIcon={<PackageIcon size={16} />} label="My Deliveries" onClick={() => router.push('/external')} />
                                    )}
                                    <UserButton.Action labelIcon = {<PackageIcon size={16}/>} label="My Orders" onClick={()=> router.push('/orders')}/>
                                    <UserButton.Action labelIcon = {<MessageCircleIcon size={16}/>} label="My Chats" onClick={()=> router.push('/chat')}/>
                                </UserButton.MenuItems>
                            </UserButton>
                        )

                    }

                    </div>

                    {/* Mobile: search icon + cart + user */}
                    <div className="sm:hidden flex items-center gap-3">
                        <button
                            aria-label="Search products"
                            onClick={() => setMobileSearchOpen(v => !v)}
                            className="text-slate-600 hover:text-slate-800 transition"
                        >
                            {mobileSearchOpen ? <XIcon size={20} /> : <Search size={20} />}
                        </button>

                        <Link href="/cart" className="relative text-slate-600" aria-label="View cart">
                            <ShoppingCart size={20} />
                            <span className="absolute -top-1 -right-1 flex items-center justify-center text-[8px] text-white bg-slate-600 size-3.5 rounded-full">{cartCount}</span>
                        </Link>

                        {user && (
                            <Link href="/chat" className="relative text-slate-600" aria-label="View chats">
                                <MessageCircleIcon size={20} />
                                {unreadChats > 0 && (
                                    <span className="absolute -top-1 -right-1 flex items-center justify-center text-[8px] text-white bg-indigo-500 size-3.5 rounded-full">
                                        {unreadChats > 9 ? '9+' : unreadChats}
                                    </span>
                                )}
                            </Link>
                        )}

                        {user ? (
                            <UserButton>
                                <UserButton.MenuItems>
                                    {canShowAccessActions && isAdmin && (
                                        <UserButton.Action labelIcon={<User size={16} />} label="Admin Dashboard" onClick={() => router.push('/admin')} />
                                    )}
                                    {canShowAccessActions && isSeller && (
                                        <>
                                            <UserButton.Action labelIcon={<User size={16} />} label="Store Dashboard" onClick={() => router.push('/store')} />
                                            <UserButton.Action labelIcon={<MessageCircleIcon size={16} />} label="Contact Admin" onClick={openAdminConversation} />
                                        </>
                                    )}
                                    <UserButton.Action labelIcon={<PackageIcon size={16} />} label="My Orders" onClick={() => router.push('/orders')} />
                                    <UserButton.Action labelIcon={<MessageCircleIcon size={16} />} label="My Chats" onClick={() => router.push('/chat')} />
                                </UserButton.MenuItems>
                            </UserButton>
                        ) : (
                            <button onClick={openSignIn} className="px-5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-sm transition text-white rounded-full">
                                Login
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {/* Mobile search bar — slides in below the nav row */}
            {mobileSearchOpen && (
                <div className="sm:hidden px-4 pb-3">
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="mb-2 w-full rounded-full border border-slate-200 bg-slate-50 text-sm px-4 py-2 outline-none text-slate-600"
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>

                    <form onSubmit={(e) => { handleSearch(e); setMobileSearchOpen(false) }} className="flex items-center gap-2 bg-slate-100 px-4 py-2.5 rounded-full text-sm">
                        <Search size={16} className="text-slate-500 shrink-0" />
                        <input
                            autoFocus
                            className="flex-1 bg-transparent outline-none placeholder-slate-500 text-slate-700"
                            type="text"
                            placeholder="Search products…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button type="button" onClick={clearSearch} className="text-slate-400 hover:text-slate-600 transition">
                                <XIcon size={15} />
                            </button>
                        )}
                    </form>
                </div>
            )}
            <hr className="border-gray-300" />
        </nav>
    )
}

export default Navbar