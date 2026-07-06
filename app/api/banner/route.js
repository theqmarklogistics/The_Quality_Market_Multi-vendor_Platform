import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { cachedJson, withCache } from '@/lib/cache';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

const DEFAULT_BANNER = { isActive: false, text: '', couponCode: null };
const bannerLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

// Banner config — admin-managed, single row. Cached 1h under tag "banner".
export async function GET(request) {
    try {
        const rl = bannerLimiter(`banner:${getClientIp(request)}`);
        if (!rl.success) {
            return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
        }
        const config = await withCache(
            ['banner', 'default'],
            () => prisma.bannerConfig.findUnique({ where: { id: 'default' } }),
            { tags: ['banner'], ttlSeconds: 3600 }
        );
        return cachedJson(config ?? DEFAULT_BANNER);
    } catch (error) {
        console.error('Banner config GET error:', error.message);
        return cachedJson(DEFAULT_BANNER);
    }
}
