import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const getAdminEmails = () =>
    (process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

// GET /api/admin/conversations
// Returns all STORE-type conversations for admin oversight
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Verify admin
        const adminEmails = getAdminEmails();
        const requester = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!adminEmails.includes((requester?.email || "").toLowerCase())) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where: { targetType: "STORE" },
                include: {
                    participants: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
                    messages: { orderBy: { createdAt: "desc" }, take: 1 },
                    store: { select: { id: true, name: true, logo: true } },
                    _count: {
                        select: { messages: true }
                    },
                },
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.conversation.count({ where: { targetType: "STORE" } }),
        ]);

        return NextResponse.json({ conversations, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
