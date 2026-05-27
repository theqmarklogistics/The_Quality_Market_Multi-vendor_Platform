import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";


// Get all approved stores

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if(!isAdmin) {
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
        const search = searchParams.get('search')?.trim() || '';

        const where = { status: { in: ['approved'] } };
        if (search) where.name = { contains: search, mode: 'insensitive' };

        const [rawStores, total] = await Promise.all([
            prisma.store.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.store.count({ where })
        ]);

        // Hydrate users separately (no include — avoids driverAdapters transaction)
        const userIds = [...new Set(rawStores.map(s => s.userId).filter(Boolean))];
        const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } } }) : [];
        const userMap = new Map(users.map(u => [u.id, u]));
        const stores = rawStores.map(s => ({ ...s, user: userMap.get(s.userId) || null }));

        return NextResponse.json({ stores, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}