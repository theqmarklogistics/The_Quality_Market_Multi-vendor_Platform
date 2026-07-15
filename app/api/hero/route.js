import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { cachedJson, withCache } from '@/lib/cache';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

const heroLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

const DEFAULTS = {
    main: {
        slot: 'main',
        badgeText: 'Fast, Tracked Delivery Across Kigali!',
        headline: 'Anything you need. Anyone can sell.',
        description: 'Shop products of every kind from verified stores across Rwanda — and get them delivered to your door by our own riders, tracked live.',
        cta1Label: 'Shop now',
        cta1Href: '/shop',
        cta2Label: 'Delivery service',
        cta2Href: '/external',
        imageUrl: null,
    },
    card1: {
        slot: 'card1',
        cardTitle: 'Fast, tracked delivery',
        accentColor: '#16A34A',
        linkLabel: 'Book a delivery',
        linkHref: '/external',
        imageUrl: null,
    },
    card2: {
        slot: 'card2',
        cardTitle: 'Open your own store',
        accentColor: '#FFAD51',
        linkLabel: 'Start selling',
        linkHref: '/create-store',
        imageUrl: null,
    },
};

// The side cards became service CTAs (delivery / open a store). Admin rows saved
// under the old ad campaigns are migrated to the new defaults on read.
const LEGACY_CARD_TITLES = { card1: /best\s*products?/i, card2: /20%\s*discounts?/i };

// The hero config is admin-managed and changes rarely — cached for 1h under
// tag "hero". The admin POST that mutates it invalidates via revalidateTag.
export async function GET(request) {
    try {
        const rl = heroLimiter(`hero:${getClientIp(request)}`);
        if (!rl.success) {
            return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
        }
        const rows = await withCache(
            ['hero', 'all'],
            () => prisma.heroConfig.findMany(),
            { tags: ['hero'], ttlSeconds: 3600 }
        );
        const bySlot = Object.fromEntries(rows.map(r => [r.slot, r]));

        const result = {};
        for (const key of ['main', 'card1', 'card2']) {
            result[key] = { ...DEFAULTS[key], ...(bySlot[key] || {}) };
        }
        // The "Starts from <price>" hero badge was retired — never surface it,
        // even from a stale admin-saved row (web + mobile read this endpoint).
        result.main.startingPrice = null;
        for (const slot of ['card1', 'card2']) {
            if (LEGACY_CARD_TITLES[slot].test(result[slot].cardTitle || '')) {
                result[slot] = { ...DEFAULTS[slot] };
            }
        }

        return cachedJson(result);
    } catch (error) {
        console.error('Hero config GET error:', error.message);
        return cachedJson(DEFAULTS);
    }
}
