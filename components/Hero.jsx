'use client'
import { assets } from '@/assets/assets'
import { ArrowRightIcon, ShoppingBagIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import CategoriesMarquee from './CategoriesMarquee'

const DEFAULTS = {
    main: {
        badgeText: 'Free Shipping on Orders Above RWF 50K!',
        headline: "Gadgets you'll love. Prices you'll trust.",
        description: 'Discover hand-picked electronics, practical accessories, and store-approved finds built for everyday use and long-term value.',
        startingPrice: '4.9K',
        cta1Label: 'Shop now',
        cta1Href: '/shop',
        cta2Label: 'Open a store',
        cta2Href: '/create-store',
        imageUrl: null,
    },
    card1: {
        cardTitle: 'Best products',
        accentColor: '#FFAD51',
        linkLabel: 'View more',
        linkHref: '/shop',
        imageUrl: null,
    },
    card2: {
        cardTitle: '20% discounts',
        accentColor: '#78B2FF',
        linkLabel: 'View more',
        linkHref: '/shop',
        imageUrl: null,
    },
}

const Hero = () => {
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'
    const [config, setConfig] = useState(DEFAULTS)

    useEffect(() => {
        fetch('/api/hero')
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setConfig(data) })
            .catch(() => {})
    }, [])

    const main = config.main
    const card1 = config.card1
    const card2 = config.card2

    return (
        <div className='mx-6'>
            <div className='flex max-xl:flex-col gap-8 max-w-7xl mx-auto my-10'>
                {/* Main banner */}
                <div className='relative flex-1 flex flex-col rounded-3xl xl:min-h-100 group overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] border border-green-100/60 shadow-[0_20px_80px_rgba(15,23,42,0.08)]'>
                    <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(132,204,22,0.14),_transparent_32%)] pointer-events-none' />
                    <div className='relative p-5 sm:p-16'>
                        <h2 className='text-3xl sm:text-5xl leading-[1.15] my-4 font-semibold bg-gradient-to-r from-slate-800 via-slate-700 to-green-700 bg-clip-text text-transparent max-w-xs sm:max-w-md'>
                            {main.headline}
                        </h2>
                        <p className='max-w-md text-slate-600 text-sm sm:text-base leading-7'>
                            {main.description}
                        </p>
                        {main.startingPrice && (
                            <div className='text-slate-800 text-sm font-medium mt-5 sm:mt-8'>
                                <p className='text-slate-500'>Starts from</p>
                                <p className='text-3xl font-semibold'>{currency}{main.startingPrice}</p>
                            </div>
                        )}
                        <div className='flex flex-wrap items-center gap-3 mt-5 sm:mt-10'>
                            {main.cta1Label && main.cta1Href && (
                                <Link href={main.cta1Href} className='inline-flex items-center gap-2 bg-slate-800 text-white text-sm py-2.5 px-6 sm:py-4 sm:px-10 rounded-full hover:bg-slate-900 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-slate-800/20'>
                                    {main.cta1Label} <ShoppingBagIcon size={16} />
                                </Link>
                            )}
                            {main.cta2Label && main.cta2Href && (
                                <Link href={main.cta2Href} className='inline-flex items-center gap-2 bg-white/80 backdrop-blur text-slate-800 text-sm py-2.5 px-6 sm:py-4 sm:px-10 rounded-full border border-slate-200 hover:bg-white hover:-translate-y-0.5 active:scale-95 transition'>
                                    {main.cta2Label} <ArrowRightIcon size={16} />
                                </Link>
                            )}
                        </div>
                    </div>
                    <Image
                        className='relative sm:absolute bottom-0 right-0 md:right-10 w-full sm:max-w-sm drop-shadow-[0_20px_40px_rgba(15,23,42,0.18)]'
                        src={main.imageUrl || assets.hero_model_img}
                        alt='Featured product'
                        width={500}
                        height={500}
                        priority
                    />
                </div>

                {/* Side cards */}
                <div className='flex flex-col md:flex-row xl:flex-col gap-5 w-full xl:max-w-sm text-sm text-slate-600'>
                    <HeroCard config={card1} fallbackImage={assets.hero_product_img1} />
                    <HeroCard config={card2} fallbackImage={assets.hero_product_img2} />
                </div>
            </div>
            <CategoriesMarquee />
        </div>
    )
}

function HeroCard({ config, fallbackImage }) {
    const accent = config.accentColor || '#FFAD51'
    return (
        <Link href={config.linkHref || '/shop'} className='flex-1 flex items-center justify-between w-full bg-white rounded-3xl p-6 px-8 group border shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-md transition-shadow'
            style={{ borderColor: `${accent}30` }}>
            <div>
                <p className='text-3xl font-semibold max-w-40' style={{
                    backgroundImage: `linear-gradient(to right, #1e293b, ${accent})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                }}>
                    {config.cardTitle}
                </p>
                <p className='flex items-center gap-1 mt-4 text-slate-500'>
                    {config.linkLabel || 'View more'} <ArrowRightIcon className='group-hover:ml-2 transition-all' size={18} />
                </p>
            </div>
            <Image
                className='w-35'
                src={config.imageUrl || fallbackImage}
                alt={config.cardTitle || ''}
                width={140}
                height={140}
            />
        </Link>
    )
}

export default Hero
