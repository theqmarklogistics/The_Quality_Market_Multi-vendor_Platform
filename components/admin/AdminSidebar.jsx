'use client'

import { usePathname } from "next/navigation"
import { BarChart3Icon, BikeIcon, ClipboardListIcon, CircleDollarSignIcon, CreditCardIcon, FileTextIcon, HomeIcon, LayoutPanelTopIcon, MailIcon, MegaphoneIcon, MessageCircleIcon, PackageCheckIcon, PercentIcon, RotateCcwIcon, RouteIcon, ShieldCheckIcon, StoreIcon, TagIcon, TagsIcon, TicketPercentIcon, TruckIcon, UsersIcon, WarehouseIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { useEffect, useState } from "react"

const AdminSidebar = () => {

    const {user} = useUser()

    const pathname = usePathname()
    const [counts, setCounts] = useState({
        pendingStores: 0,
        pendingProducts: 0,
        pendingPaymentProofs: 0,
        newOrders: 0,
        unreadChatMessages: 0,
        pendingInvoiceRequests: 0,
    })

    const sidebarLinks = [
        { name: 'Dashboard', href: '/admin', icon: HomeIcon },
        { name: 'Reports', href: '/admin/reports', icon: BarChart3Icon },
        { name: 'Stores', href: '/admin/stores', icon: StoreIcon },
        { name: 'Approve Store', href: '/admin/approve', icon: ShieldCheckIcon, badge: counts.pendingStores },
        { name: 'Approve Products', href: '/admin/products', icon: PackageCheckIcon, badge: counts.pendingProducts },
        { name: 'Orders', href: '/admin/orders', icon: TagsIcon, badge: counts.newOrders },
        { name: 'Payments', href: '/admin/payments', icon: TicketPercentIcon, badge: counts.pendingPaymentProofs },
        { name: 'Chats', href: '/admin/chat', icon: MessageCircleIcon, badge: counts.unreadChatMessages },
        { name: 'Email Inbox', href: '/admin/inbox', icon: MailIcon },
        { name: 'Coupons', href: '/admin/coupons', icon: TicketPercentIcon },
        { name: 'Returns', href: '/admin/returns', icon: RotateCcwIcon },
        { name: 'Payouts', href: '/admin/payouts', icon: CircleDollarSignIcon },
        { name: 'Invoices', href: '/admin/invoices', icon: FileTextIcon, badge: counts.pendingInvoiceRequests },
        { name: 'Users', href: '/admin/users', icon: UsersIcon },
        { name: 'Riders', href: '/admin/riders', icon: BikeIcon },
        { name: 'Hubs & Corridors', href: '/admin/hubs', icon: WarehouseIcon },
        { name: 'Logistics', href: '/logistics', icon: RouteIcon },
        { name: 'Payment Config', href: '/admin/payment-config', icon: CreditCardIcon },
        { name: 'Audit Log', href: '/admin/audit', icon: ClipboardListIcon },
        { name: 'Hero Banners', href: '/admin/hero', icon: LayoutPanelTopIcon },
        { name: 'Banner', href: '/admin/banner', icon: MegaphoneIcon },
        { name: 'Newsletter', href: '/admin/newsletter', icon: MailIcon },
        { name: 'Categories', href: '/admin/categories', icon: TagIcon },
        { name: 'Commissions', href: '/admin/commissions', icon: PercentIcon },
        { name: 'Shipping', href: '/admin/shipping', icon: TruckIcon },
    ]

    useEffect(() => {
        const onCountsUpdated = (event) => {
            const detail = event?.detail || {}
            setCounts({
                pendingStores: detail.pendingStores || 0,
                pendingProducts: detail.pendingProducts || 0,
                pendingPaymentProofs: detail.pendingPaymentProofs || 0,
                newOrders: detail.newOrders || 0,
                unreadChatMessages: detail.unreadChatMessages || 0,
                pendingInvoiceRequests: detail.pendingInvoiceRequests || 0,
            })
        }

        window.addEventListener('admin:counts-updated', onCountsUpdated)
        return () => {
            window.removeEventListener('admin:counts-updated', onCountsUpdated)
        }
    }, [])

    return user && (
        <div className="inline-flex h-full flex-col gap-5 border-r border-slate-200 sm:min-w-60">
            <div className="flex flex-col gap-3 justify-center items-center pt-8 max-sm:hidden">
                <Image className="w-14 h-14 object-contain" src={user?.imageUrl} alt="The Quality Market" width={80} height={80}/>
                <p className="text-slate-700">Hi, {user?.fullName}</p>
                
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

export default AdminSidebar