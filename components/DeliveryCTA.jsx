'use client'
import Link from 'next/link'
import { ArrowRightIcon, TruckIcon, MapPinIcon, BadgeCheckIcon } from 'lucide-react'

// Public call-to-action inviting off-platform ("external") sellers to use The
// Quality Market's delivery service. Lives on the home page; the buttons point
// at /external, where existing partners reach their dashboard and prospects are
// invited to request access.
const PERKS = [
    { icon: MapPinIcon, label: 'Shared Kigali routes' },
    { icon: BadgeCheckIcon, label: 'Pay by MoMo, track live' },
]

const DeliveryCTA = () => {
    return (
        <div className='px-6 my-20 max-w-7xl mx-auto'>
            <div className='relative overflow-hidden rounded-3xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] shadow-[0_20px_80px_rgba(15,23,42,0.08)]'>
                <div className='absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(132,204,22,0.14),_transparent_35%)] pointer-events-none' />
                <div className='relative flex flex-col lg:flex-row lg:items-center justify-between gap-8 p-8 sm:p-12'>
                    <div className='max-w-xl'>
                        <span className='inline-flex items-center gap-1.5 rounded-full bg-green-600/10 text-green-700 text-xs font-semibold px-3 py-1'>
                            <TruckIcon size={14} /> For external sellers
                        </span>
                        <h2 className='text-3xl sm:text-4xl leading-[1.15] mt-4 font-semibold bg-gradient-to-r from-slate-800 via-slate-700 to-green-700 bg-clip-text text-transparent'>
                            Sell off-platform? We&apos;ll deliver it.
                        </h2>
                        <p className='text-slate-600 text-sm sm:text-base leading-7 mt-3'>
                            Book a rider for your own packages on our shared Kigali routes, pay the fee by MoMo, and track every drop live — no storefront required.
                        </p>
                        <div className='flex flex-wrap items-center gap-x-6 gap-y-2 mt-5'>
                            {PERKS.map((perk) => (
                                <span key={perk.label} className='inline-flex items-center gap-1.5 text-sm text-slate-500'>
                                    <perk.icon size={16} className='text-green-600' /> {perk.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className='flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0'>
                        <Link
                            href='/external'
                            className='inline-flex items-center justify-center gap-2 bg-green-600 text-white text-sm py-3.5 px-8 rounded-full hover:bg-green-700 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-green-600/20'
                        >
                            Get delivery access <ArrowRightIcon size={16} />
                        </Link>
                        <Link
                            href='/external/new'
                            className='inline-flex items-center justify-center gap-2 bg-white/80 backdrop-blur text-slate-800 text-sm py-3.5 px-8 rounded-full border border-slate-200 hover:bg-white hover:-translate-y-0.5 active:scale-95 transition'
                        >
                            Book a delivery <TruckIcon size={16} />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DeliveryCTA
