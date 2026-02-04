'use client'
import Link from "next/link"
import Image from "next/image"
import { assets } from "@/assets/assets"

const StoreNavbar = () => {


    return (
        <div className="flex items-center justify-between px-12 py-3 border-b border-slate-200 transition-all">
            <Link href="/" className="relative flex items-center gap-2">
                <Image src={assets.brandLogo} alt="The Quality Market" width={200} height={56} className="h-12 w-auto object-contain" />
                <p className="absolute -top-1 -right-11 text-xs font-semibold px-3 p-0.5 rounded-full flex items-center gap-2 text-white bg-green-500">
                    Store
                </p>
            </Link>
            <div className="flex items-center gap-3">
                <p>Hi, Seller</p>
            </div>
        </div>
    )
}

export default StoreNavbar