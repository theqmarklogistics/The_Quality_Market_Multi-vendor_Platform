'use client'
import { useEffect, useState } from "react"
import Loading from "../Loading"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import SellerNavbar from "./StoreNavbar"
import SellerSidebar from "./StoreSidebar"
import { dummyStoreData } from "@/assets/assets"
import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"  
import StoreNotificationWatcher from "./StoreNotificationWatcher"

const StoreLayout = ({ children }) => {

    const { getToken } = useAuth();
    const { isLoaded } = useUser();

    const [isSeller, setIsSeller] = useState(false)
    const [loading, setLoading] = useState(true)
    const [storeInfo, setStoreInfo] = useState(null)
    const [denyReason, setDenyReason] = useState(null)

    const fetchIsSeller = async () => {
        try {
            const token = await getToken();
            const {data} = await axios.get('/api/store/is-seller', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            setIsSeller(data.isSeller)
            setStoreInfo(data.storeInfo)
            if (!data.isSeller) setDenyReason(data.reason || 'unauthorized')
        } catch (error) {
            console.error(error);
            setDenyReason('error')
        }
        finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isLoaded) fetchIsSeller();
    }, [isLoaded])

    return loading ? (
        <Loading />
    ) : isSeller ? (
        <div className="flex flex-col h-screen">
            <StoreNotificationWatcher />
            <SellerNavbar />
            <div className="flex flex-1 items-start h-full overflow-y-scroll no-scrollbar">
                <SellerSidebar storeInfo={storeInfo} />
                <div className="flex-1 h-full p-5 lg:pl-12 lg:pt-12 overflow-y-scroll">
                    {children}
                </div>
            </div>
        </div>
    ) : (
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
            {denyReason === 'store_pending' ? (
                <>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-slate-700">Your store is pending approval</h1>
                    <p className="text-slate-400 mt-3 max-w-sm">Our team is reviewing your store application. You'll get access once it's approved.</p>
                </>
            ) : denyReason === 'store_rejected' ? (
                <>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-red-500">Your store application was rejected</h1>
                    <p className="text-slate-400 mt-3 max-w-sm">Please contact support for more information or to re-apply.</p>
                </>
            ) : denyReason === 'store_inactive' ? (
                <>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-slate-700">Your store has been deactivated</h1>
                    <p className="text-slate-400 mt-3 max-w-sm">Your store is currently inactive. Please contact admin to reactivate it.</p>
                </>
            ) : denyReason === 'no_store' ? (
                <>
                    <h1 className="text-2xl sm:text-3xl font-semibold text-slate-700">No store found</h1>
                    <p className="text-slate-400 mt-3 max-w-sm">You haven't applied to open a store yet.</p>
                </>
            ) : (
                <>
                    <h1 className="text-2xl sm:text-4xl font-semibold text-slate-400">You are not authorized to access this page</h1>
                </>
            )}
            <Link href="/" className="bg-slate-700 text-white flex items-center gap-2 mt-8 p-2 px-6 max-sm:text-sm rounded-full">
                Go to home <ArrowRightIcon size={18} />
            </Link>
        </div>
    )
}

export default StoreLayout