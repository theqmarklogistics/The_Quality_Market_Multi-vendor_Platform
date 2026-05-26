import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || '';
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = 20;

        const where = status ? { status } : {};

        const [returns, total] = await Promise.all([
            prisma.return.findMany({
                where,
                include: {
                    user: { select: { name: true, email: true, image: true } },
                    order: {
                        select: {
                            id: true, total: true, status: true,
                            orderItems: {
                                include: { product: { select: { name: true, images: true } } }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.return.count({ where }),
        ]);

        return NextResponse.json({ returns, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
