'use client'
import { categories } from "@/assets/assets"
import Link from "next/link"

const CategoriesMarquee = () => {
    return (
        <div className="overflow-hidden w-full relative max-w-7xl mx-auto select-none group sm:my-20 py-2">
            <div className="absolute left-0 top-0 h-full w-16 sm:w-24 z-10 pointer-events-none bg-gradient-to-r from-white via-white/90 to-transparent" />
            <div className="flex min-w-[200%] animate-[marqueeScroll_10s_linear_infinite] sm:animate-[marqueeScroll_40s_linear_infinite] group-hover:[animation-play-state:paused] gap-3 sm:gap-4" >
                {[...categories, ...categories, ...categories, ...categories].map((cat, index) => (
                    <Link key={`${cat}-${index}`} href={`/shop?category=${encodeURIComponent(cat)}`} className="px-4 sm:px-5 py-2 rounded-full border border-slate-200 bg-white/90 text-slate-600 text-xs sm:text-sm shadow-sm hover:border-green-200 hover:bg-green-50 hover:text-green-700 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 whitespace-nowrap backdrop-blur">
                        {cat}
                    </Link>
                ))}
            </div>
            <div className="absolute right-0 top-0 h-full w-16 sm:w-24 md:w-40 z-10 pointer-events-none bg-gradient-to-l from-white via-white/90 to-transparent" />
        </div>
    )
}

export default CategoriesMarquee