'use client'
import { usePathname } from "next/navigation"
import { HomeIcon, LayoutListIcon, MessageCircleIcon, SquarePenIcon, SquarePlusIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"

const StoreSidebar = ({storeInfo}) => {

    const pathname = usePathname()
    const { getToken } = useAuth()
    const [pendingOrders, setPendingOrders] = useState(0)

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/store/counts', {
                    headers: { Authorization: `Bearer ${token}` }
                })
                setPendingOrders(data.pendingOrders || 0)
            } catch {
                // silently ignore — badge is non-critical
            }
        }
        fetchCounts()
    }, [getToken])

    const sidebarLinks = [
        { name: 'Dashboard', href: '/store', icon: HomeIcon },
        { name: 'Add Product', href: '/store/add-product', icon: SquarePlusIcon },
        { name: 'Manage Product', href: '/store/manage-product', icon: SquarePenIcon },
        { name: 'Orders', href: '/store/orders', icon: LayoutListIcon, badge: pendingOrders },
        { name: 'Chats', href: '/store/chat', icon: MessageCircleIcon },
    ]

    return (
        <div className="inline-flex h-full flex-col gap-5 border-r border-slate-200 sm:min-w-60">
            <div className="flex flex-col gap-3 justify-center items-center pt-8 max-sm:hidden">
                <Image className="w-14 h-14 rounded-full shadow-md" src={storeInfo?.logo} alt="" width={80} height={80} />
                <p className="text-slate-700">{storeInfo?.name}</p>
            </div>

            <div className="max-sm:mt-6">
                {
                    sidebarLinks.map((link, index) => (
                        <Link key={index} href={link.href} className={`relative flex items-center gap-3 text-slate-500 hover:bg-slate-50 p-2.5 transition ${pathname === link.href && 'bg-slate-100 sm:text-slate-600'}`}>
                            <link.icon size={18} className="sm:ml-5" />
                            <p className="max-sm:hidden">{link.name}</p>
                            {pathname === link.href && <span className="absolute bg-green-500 right-0 top-1.5 bottom-1.5 w-1 sm:w-1.5 rounded-l"></span>}
                            {link.badge > 0 && (
                                <span className="ml-auto mr-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white max-sm:hidden">
                                    {link.badge}
                                </span>
                            )}
                        </Link>
                    ))
                }
            </div>
        </div>
    )
}

export default StoreSidebar