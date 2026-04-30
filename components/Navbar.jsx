'use client'
import { MessageCircleIcon, PackageIcon, Search, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
    const [isAdmin, setIsAdmin] = useState(false)
    const [isSeller, setIsSeller] = useState(false)
    const [loadingAccess, setLoadingAccess] = useState(false)
    const cartCount = useSelector(state => state.cart.total)

    useEffect(() => {
        setSearch(searchParams.get('search') || '')
    }, [searchParams])

    useEffect(() => {
        let mounted = true

        const fetchAccess = async () => {
            if (!user) {
                setIsAdmin(false)
                setIsSeller(false)
                return
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

                setIsAdmin(adminResponse.status === 200 && Boolean(adminResponse.data?.isAdmin))
                setIsSeller(sellerResponse.status === 200 && Boolean(sellerResponse.data?.isSeller))
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

    const handleSearch = (e) => {
        e.preventDefault()
        const query = search.trim()
        const params = new URLSearchParams(searchParams.toString())
        if (query) params.set('search', query)
        else params.delete('search')
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

    return (
        <nav className="relative bg-white">
            <div className="mx-6">
                <div className="flex items-center justify-between max-w-7xl mx-auto py-4  transition-all">

                    <Link href="/" className="relative flex items-center gap-2">
                        <Image src={assets.brandLogo} alt="The Quality Market" width={200} height={56} className="h-12 w-auto object-contain" priority />
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden sm:flex items-center gap-4 lg:gap-8 text-slate-600">
                        <Link href="/">Home</Link>
                        <Link href="/shop">Shop</Link>
                        <Link href="/">About</Link>
                        <Link href="/">Contact</Link>

                        <form onSubmit={handleSearch} className="hidden xl:flex items-center w-xs text-sm gap-2 bg-slate-100 px-4 py-3 rounded-full">
                            <Search size={18} className="text-slate-600" />
                            <input className="w-full bg-transparent outline-none placeholder-slate-600" type="text" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
                            {search && (
                                <button type="button" onClick={clearSearch} className="text-slate-400 hover:text-slate-600 transition">
                                    <XIcon size={16} />
                                </button>
                            )}
                        </form>

                        <Link href="/cart" className="relative flex items-center gap-2 text-slate-600" aria-label="View cart">
                            <ShoppingCart size={18} />
                            Cart
                            <span className="absolute -top-1 left-3 flex items-center justify-center text-[8px] text-white bg-slate-600 size-3.5 rounded-full">{cartCount}</span>
                        </Link>

                        {/* Visible dashboard shortcuts for quick access */}
                        {canShowAccessActions && isSeller && (
                            <Link href="/store" className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm hover:bg-emerald-100">
                                Store Dashboard
                            </Link>
                        )}
                        {canShowAccessActions && isAdmin && (
                            <Link href="/admin" className="px-3 py-1 bg-slate-50 text-slate-800 rounded-full text-sm hover:bg-slate-100">
                                Admin Dashboard
                            </Link>
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
                                    <UserButton.Action labelIcon = {<PackageIcon size={16}/>} label="My Orders" onClick={()=> router.push('/orders')}/>
                                    <UserButton.Action labelIcon = {<MessageCircleIcon size={16}/>} label="My Chats" onClick={()=> router.push('/chat')}/>
                                </UserButton.MenuItems>
                            </UserButton>
                        )

                    }

                    </div>

                    {/* Mobile User Button  */}
                    <div  className="sm:hidden">

                        {
                            user ? (
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
                                        <UserButton.Action labelIcon = {<ShoppingCart size={16}/>} label="Cart" onClick={()=> router.push('/cart')}/>
                                        <UserButton.Action labelIcon = {<PackageIcon size={16}/>} label="My Orders" onClick={()=> router.push('/orders')}/>
                                        <UserButton.Action labelIcon = {<MessageCircleIcon size={16}/>} label="My Chats" onClick={()=> router.push('/chat')}/>
                                    </UserButton.MenuItems>
                                </UserButton>
                            ) : (
                                <button onClick={openSignIn} className="px-7 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-sm transition text-white rounded-full">
                                    Login
                                </button>
                            )
                        }
                        
                    </div>
                </div>
            </div>
            <hr className="border-gray-300" />
        </nav>
    )
}

export default Navbar