import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createRateLimiter, getClientIp } from '@/lib/rateLimit';

// Public storefront endpoint. The category list rarely changes (admin only),
// so we serve it from unstable_cache (tag = "categories"). A category POST/PATCH
// invalidates the cache via `revalidateTag("categories")` from the admin routes.
//
// The cachedFetch memoizes the result per-process for 1h, or until the tag is
// invalidated — whichever is sooner. This drops the per-home-page-load DB hit
// for categories to ~0 once warm.
import { cachedJson, withCache } from '@/lib/cache';

const categoriesLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

export async function GET(request) {
    try {
        const rl = categoriesLimiter(`categories:${getClientIp(request)}`);
        if (!rl.success) {
            return NextResponse.json(
                { error: 'Too many requests.' },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
            );
        }
        // Flat list including parentId — consumers build the (max 3-level) tree
        // client-side with lib/categoryTree helpers.
        const categories = await withCache(
            ['categories', 'active'],
            () =>
                prisma.category.findMany({
                    where: { isActive: true },
                    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    select: { id: true, name: true, commissionPercent: true, parentId: true },
                }),
            { tags: ['categories'], ttlSeconds: 3600 }
        );
        return cachedJson({ categories });
    } catch (error) {
        console.error('Categories GET error:', error.message);
        return cachedJson({ categories: [] });
    }
}

// Local helper — exported for use by the admin POST/PATCH handlers below.
export function invalidateCategoriesCache() {
    revalidateTag('categories');
}
