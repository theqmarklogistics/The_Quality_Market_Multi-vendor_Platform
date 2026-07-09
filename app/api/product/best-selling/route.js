import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

const bestSellingLimiter = createRateLimiter({ max: 60, windowMs: 60_000 });

// Storefront product shape — mirrors /api/product so <ProductCard> renders it.
const PRODUCT_SELECT = {
    id: true, name: true, description: true,
    mrp: true, price: true, wholesalePrice: true, wholesaleMinQty: true, images: true,
    category: true, inStock: true, createdAt: true,
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

const AVAILABLE = { inStock: true, approvalStatus: 'APPROVED', store: { isActive: true } };

// Public "Best Selling" ranking. Ranks currently-available products by the
// number of units sold across PAID orders. When there aren't enough products
// with sales yet (e.g. a fresh catalogue), the remaining slots are filled with
// the newest available products so the storefront section is never empty.
export async function GET(request) {
    try {
        const ip = getClientIp(request);
        const rl = bestSellingLimiter(`best-selling:${ip}`);
        if (!rl.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please slow down.' },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
            );
        }

        const { searchParams } = new URL(request.url);
        const limit = Math.min(24, Math.max(1, parseInt(searchParams.get('limit') || '8', 10)));

        // 1) Units sold per product across paid orders, most sold first.
        const grouped = await prisma.orderItem.groupBy({
            by: ['productId'],
            where: { order: { isPaid: true } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: limit * 3, // over-fetch: some may now be unavailable
        });

        const soldOrder = grouped.map(g => g.productId).filter(Boolean);

        // 2) Hydrate the sold products, keeping only those still available.
        let ranked = [];
        if (soldOrder.length) {
            const soldProducts = await prisma.product.findMany({
                where: { id: { in: soldOrder }, ...AVAILABLE },
                select: PRODUCT_SELECT,
            });
            const byId = new Map(soldProducts.map(p => [p.id, p]));
            ranked = soldOrder.map(id => byId.get(id)).filter(Boolean).slice(0, limit);
        }

        // 3) Fill any remaining slots with the newest available products.
        if (ranked.length < limit) {
            const excludeIds = ranked.map(p => p.id);
            const fillers = await prisma.product.findMany({
                where: { ...AVAILABLE, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) },
                select: PRODUCT_SELECT,
                orderBy: { createdAt: 'desc' },
                take: limit - ranked.length,
            });
            ranked = [...ranked, ...fillers];
        }

        return NextResponse.json({ products: ranked });
    } catch (error) {
        console.error('Best-selling GET error:', error.message);
        return NextResponse.json({ products: [] });
    }
}
