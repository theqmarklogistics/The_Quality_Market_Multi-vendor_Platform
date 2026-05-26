import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const DEFAULTS = {
    main: {
        slot: 'main',
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
        slot: 'card1',
        cardTitle: 'Best products',
        accentColor: '#FFAD51',
        linkLabel: 'View more',
        linkHref: '/shop',
        imageUrl: null,
    },
    card2: {
        slot: 'card2',
        cardTitle: '20% discounts',
        accentColor: '#78B2FF',
        linkLabel: 'View more',
        linkHref: '/shop',
        imageUrl: null,
    },
}

export async function GET() {
    try {
        const rows = await prisma.heroConfig.findMany()
        const bySlot = Object.fromEntries(rows.map(r => [r.slot, r]))

        const result = {}
        for (const key of ['main', 'card1', 'card2']) {
            result[key] = { ...DEFAULTS[key], ...(bySlot[key] || {}) }
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error('Hero config GET error:', error.message)
        return NextResponse.json(DEFAULTS)
    }
}
