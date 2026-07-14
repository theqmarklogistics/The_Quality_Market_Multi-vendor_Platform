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
        startingPrice: '4.9K',
        cta1Label: 'Shop now',
        cta1Href: '/shop',
        cta2Label: 'Delivery service',
        cta2Href: '/external',
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
};

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
        // Shipping is never free — scrub any stale admin-saved free-shipping copy.
        if (/free\s*(shipping|delivery)/i.test(result.main.badgeText || '')) {
            result.main.badgeText = DEFAULTS.main.badgeText;
        }

        return cachedJson(result);
    } catch (error) {
        console.error('Hero config GET error:', error.message);
        return cachedJson(DEFAULTS);
    }
}
