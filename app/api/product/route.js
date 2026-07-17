import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { maybeSweepExpiredOrders } from "@/lib/expireOrders";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";
import { withCache } from "@/lib/cache";
import { categoryNamesWithDescendants } from "@/lib/categoryTree";

const PAGE_SIZE = 20;

// 60 storefront product-listing requests per minute per IP — generous for a
// browsing human, hostile to scrapers/LLM-training bots.
const productListLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });

export async function GET(request) {
    try {
        const ip = getClientIp(request);
        const rl = productListLimiter(`product:${ip}`);
        if (!rl.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please slow down.' },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
            );
        }

        // Lazy order expiry (throttled, best-effort): the storefront is the most
        // frequented route, so this reliably cleans up expired orders + restores
        // stock whenever the shop is in use — without a timer-based cron.
        maybeSweepExpiredOrders();

        const { searchParams } = new URL(request.url);

        const page     = Math.max(1, parseInt(searchParams.get('page')  || '1', 10));
        const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10)));
        const search   = searchParams.get('search')   || '';
        const category = searchParams.get('category') || '';
        const priceMin = parseFloat(searchParams.get('priceMin') || '0') || 0;
        const priceMax = parseFloat(searchParams.get('priceMax') || '0') || 0;
        const sort     = searchParams.get('sort') || 'newest';

        // Selecting a category also matches its whole subtree (max 3 levels):
        // picking "Electronics" shows products filed under "Phones" and
        // "Smartphones" too. The category rows are tiny and shared via the same
        // "categories" cache tag the admin routes invalidate.
        let categoryNames = null;
        if (category) {
            const rows = await withCache(
                ['categories', 'tree-rows'],
                () => prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
                { tags: ['categories'], ttlSeconds: 3600 }
            );
            categoryNames = categoryNamesWithDescendants(category, rows);
        }

        const where = {
            inStock: true,
            approvalStatus: 'APPROVED',
            store: { isActive: true },
            ...(search   && { name: { contains: search, mode: 'insensitive' } }),
            ...(categoryNames && { category: categoryNames.length > 1 ? { in: categoryNames } : category }),
            ...(priceMin && { price: { gte: priceMin } }),
            ...(priceMax && { price: { ...(priceMin ? { gte: priceMin } : {}), lte: priceMax } }),
        };

        const orderBy =
            sort === 'price-low'  ? { price: 'asc' }  :
            sort === 'price-high' ? { price: 'desc' } :
            { createdAt: 'desc' };

        const select = {
            id: true, name: true, description: true,
            mrp: true, price: true, wholesalePrice: true, wholesaleMinQty: true, images: true,
            category: true, inStock: true, createdAt: true,
            weightKg: true, lengthCm: true, widthCm: true, heightCm: true, importOrigin: true,
            rating: {
                select: {
                    createdAt: true, rating: true, review: true,
                    user: { select: { name: true, image: true } }
                }
            },
            store: {
                select: { id: true, name: true, username: true, logo: true, isActive: true }
            }
        };

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                select,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.product.count({ where }),
        ]);

        // Top-rated sort requires in-memory sort after fetch (rating is a relation)
        if (sort === 'rating') {
            products.sort((a, b) => {
                const avg = (p) => p.rating.length
                    ? p.rating.reduce((s, r) => s + r.rating, 0) / p.rating.length
                    : 0;
                return avg(b) - avg(a);
            });
        }

        return NextResponse.json({
            products,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
