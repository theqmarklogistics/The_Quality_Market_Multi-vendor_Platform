import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

const PAGE_SIZE = 20;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        const page     = Math.max(1, parseInt(searchParams.get('page')  || '1', 10));
        const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || String(PAGE_SIZE), 10)));
        const search   = searchParams.get('search')   || '';
        const category = searchParams.get('category') || '';
        const priceMin = parseFloat(searchParams.get('priceMin') || '0') || 0;
        const priceMax = parseFloat(searchParams.get('priceMax') || '0') || 0;
        const sort     = searchParams.get('sort') || 'newest';

        const where = {
            inStock: true,
            approvalStatus: 'APPROVED',
            store: { isActive: true },
            ...(search   && { name: { contains: search, mode: 'insensitive' } }),
            ...(category && { category }),
            ...(priceMin && { price: { gte: priceMin } }),
            ...(priceMax && { price: { ...(priceMin ? { gte: priceMin } : {}), lte: priceMax } }),
        };

        const orderBy =
            sort === 'price-low'  ? { price: 'asc' }  :
            sort === 'price-high' ? { price: 'desc' } :
            { createdAt: 'desc' };

        const select = {
            id: true, name: true, description: true,
            mrp: true, price: true, images: true,
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
