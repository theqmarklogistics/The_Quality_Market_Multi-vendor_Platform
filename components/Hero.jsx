'use client'
import { assets } from '@/assets/assets'
import { ArrowRightIcon, BikeIcon, ShoppingBagIcon, StoreIcon, TruckIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import CategoriesMarquee from './CategoriesMarquee'

const DEFAULTS = {
    main: {
        badgeText: 'Fast, Trackable Delivery Across Kigali!',
        headline: 'Anything you need. Anyone can sell.',
        description: 'Shop products of every kind from verified stores across Rwanda — and get them delivered to your door by our own riders, tracked live.',
        cta1Label: 'Shop now',
        cta1Href: '/shop',
        imageUrl: null,
    },
    card1: {
        cardTitle: 'Fast, tracked delivery',
        accentColor: '#16A34A',
        linkLabel: 'Book a delivery',
        linkHref: '/external',
        imageUrl: null,
    },
    card2: {
        cardTitle: 'Open your own store',
        accentColor: '#FFAD51',
        linkLabel: 'Start selling',
        linkHref: '/create-store',
        imageUrl: null,
    },
}

const Hero = () => {
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
                        <div className='flex flex-wrap items-start gap-x-4 gap-y-3 mt-5 sm:mt-10'>
                            {main.cta1Label && main.cta1Href && (
                                <Link href={main.cta1Href} className='inline-flex items-center justify-center gap-2 bg-slate-800 text-white text-sm py-2.5 px-6 sm:py-4 sm:px-10 rounded-full hover:bg-slate-900 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-slate-800/20'>
                                    {main.cta1Label} <ShoppingBagIcon size={16} />
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

                {/* Side cards: service CTAs — book a delivery / open a store */}
                <div className='flex flex-col md:flex-row xl:flex-col gap-5 w-full xl:max-w-sm text-sm text-slate-600'>
                    <HeroCard config={card1} fallbackGraphic={<DeliveryGraphic accent={card1.accentColor || DEFAULTS.card1.accentColor} />} />
                    <HeroCard config={card2} fallbackGraphic={<StoreGraphic accent={card2.accentColor || DEFAULTS.card2.accentColor} />} />
                </div>
            </div>
            <CategoriesMarquee />
        </div>
    )
}

function HeroCard({ config, fallbackGraphic }) {
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
            {config.imageUrl ? (
                <Image
                    className='w-35'
                    src={config.imageUrl}
                    alt={config.cardTitle || ''}
                    width={140}
                    height={140}
                />
            ) : fallbackGraphic}
        </Link>
    )
}

// Truck + motorcycle composition for the delivery-service CTA card.
function DeliveryGraphic({ accent }) {
    return (
        <div className='relative w-28 h-28 shrink-0' aria-hidden='true'>
            <div className='absolute inset-0 rounded-full' style={{ backgroundColor: `${accent}1A` }} />
            <TruckIcon className='absolute top-4 left-3 group-hover:-translate-y-0.5 transition-transform' size={58} strokeWidth={1.5} style={{ color: accent }} />
            <div className='absolute bottom-1 right-0 rounded-full bg-white border p-2 shadow-sm' style={{ borderColor: `${accent}40` }}>
                <BikeIcon size={30} strokeWidth={1.5} className='text-slate-700' />
            </div>
        </div>
    )
}

// Storefront graphic for the open-your-store CTA card.
function StoreGraphic({ accent }) {
    return (
        <div className='relative w-28 h-28 shrink-0' aria-hidden='true'>
            <div className='absolute inset-0 rounded-full' style={{ backgroundColor: `${accent}1A` }} />
            <StoreIcon className='absolute inset-0 m-auto group-hover:-translate-y-0.5 transition-transform' size={62} strokeWidth={1.5} style={{ color: accent }} />
        </div>
    )
}

export default Hero
