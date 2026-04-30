'use client'
import { assets } from '@/assets/assets'
import { ArrowRightIcon, ChevronRightIcon, ShoppingBagIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'
import CategoriesMarquee from './CategoriesMarquee'

const Hero = () => {
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    return (
        <div className='mx-6'>
            <div className='flex max-xl:flex-col gap-8 max-w-7xl mx-auto my-10'>
                <div className='relative flex-1 flex flex-col rounded-3xl xl:min-h-100 group overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] border border-green-100/60 shadow-[0_20px_80px_rgba(15,23,42,0.08)]'>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(132,204,22,0.14),_transparent_32%)] pointer-events-none' />
                    <div className='relative p-5 sm:p-16'>
                        <div className='inline-flex items-center gap-3 bg-white/80 backdrop-blur text-green-700 pr-4 p-1 rounded-full text-xs sm:text-sm shadow-sm border border-green-100'>
                            <span className='bg-green-600 px-3 py-1 max-sm:ml-1 rounded-full text-white text-xs'>NEWS</span>
                            Free Shipping on Orders Above $50!
                            <ChevronRightIcon className='group-hover:ml-2 transition-all' size={16} />
                        </div>
                        <h2 className='text-3xl sm:text-5xl leading-[1.15] my-4 font-semibold bg-gradient-to-r from-slate-800 via-slate-700 to-green-700 bg-clip-text text-transparent max-w-xs sm:max-w-md'>
                            Gadgets you'll love. Prices you'll trust.
                        </h2>
                        <p className='max-w-md text-slate-600 text-sm sm:text-base leading-7'>
                            Discover hand-picked electronics, practical accessories, and store-approved finds built for everyday use and long-term value.
                        </p>
                        <div className='text-slate-800 text-sm font-medium mt-5 sm:mt-8'>
                            <p className='text-slate-500'>Starts from</p>
                            <p className='text-3xl font-semibold'>{currency}4.9K</p>
                        </div>
                        <div className='flex flex-wrap items-center gap-3 mt-5 sm:mt-10'>
                            <Link href='/shop' className='inline-flex items-center gap-2 bg-slate-800 text-white text-sm py-2.5 px-6 sm:py-4 sm:px-10 rounded-full hover:bg-slate-900 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-slate-800/20'>
                                Shop now <ShoppingBagIcon size={16} />
                            </Link>
                            <Link href='/create-store' className='inline-flex items-center gap-2 bg-white/80 backdrop-blur text-slate-800 text-sm py-2.5 px-6 sm:py-4 sm:px-10 rounded-full border border-slate-200 hover:bg-white hover:-translate-y-0.5 active:scale-95 transition'>
                                Open a store <ArrowRightIcon size={16} />
                            </Link>
                        </div>
                    </div>
                    <Image className='relative sm:absolute bottom-0 right-0 md:right-10 w-full sm:max-w-sm drop-shadow-[0_20px_40px_rgba(15,23,42,0.18)]' src={assets.hero_model_img} alt='Featured product collage' />
                </div>

                <div className='flex flex-col md:flex-row xl:flex-col gap-5 w-full xl:max-w-sm text-sm text-slate-600'>
                    <div className='flex-1 flex items-center justify-between w-full bg-white rounded-3xl p-6 px-8 group border border-orange-100 shadow-[0_10px_30px_rgba(251,146,60,0.10)]'>
                        <div>
                            <p className='text-3xl font-semibold bg-gradient-to-r from-slate-800 to-[#FFAD51] bg-clip-text text-transparent max-w-40'>Best products</p>
                            <p className='flex items-center gap-1 mt-4 text-slate-500'>View more <ArrowRightIcon className='group-hover:ml-2 transition-all' size={18} /></p>
                        </div>
                        <Image className='w-35' src={assets.hero_product_img1} alt='Best products' />
                    </div>

                    <div className='flex-1 flex items-center justify-between w-full bg-white rounded-3xl p-6 px-8 group border border-blue-100 shadow-[0_10px_30px_rgba(59,130,246,0.10)]'>
                        <div>
                            <p className='text-3xl font-semibold bg-gradient-to-r from-slate-800 to-[#78B2FF] bg-clip-text text-transparent max-w-40'>20% discounts</p>
                            <p className='flex items-center gap-1 mt-4 text-slate-500'>View more <ArrowRightIcon className='group-hover:ml-2 transition-all' size={18} /></p>
                        </div>
                        <Image className='w-35' src={assets.hero_product_img2} alt='Discounted products' />
                    </div>
                </div>
            </div>
            <CategoriesMarquee />
        </div>
    )
}

export default Hero
