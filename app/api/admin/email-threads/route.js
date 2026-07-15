import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { logAdminAction } from "@/lib/auditLog";
import { sendInThread, isInboundEmailConfigured } from "@/lib/emailThreads";

// GET — thread list for the admin inbox, newest activity first.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const threads = await prisma.emailThread.findMany({
            orderBy: { lastMessageAt: "desc" },
            take: 100,
            include: {
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { direction: true, bodyText: true, subject: true, createdAt: true, isRead: true },
                },
            },
        });

        // Unread inbound counts per thread (single grouped query).
        const unread = await prisma.emailMessage.groupBy({
            by: ["threadId"],
            where: { direction: "INBOUND", isRead: false },
            _count: { _all: true },
        });
        const unreadMap = new Map(unread.map((u) => [u.threadId, u._count._all]));

        return NextResponse.json({
            threads: threads.map((t) => ({
                id: t.id,
                subject: t.subject,
                customerEmail: t.customerEmail,
                orderId: t.orderId,
                lastMessageAt: t.lastMessageAt,
                lastMessage: t.messages[0] || null,
                unreadCount: unreadMap.get(t.id) || 0,
            })),
            inboundConfigured: isInboundEmailConfigured(),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}

// POST { to, subject, body, orderId? } — start a new thread with a customer.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const to = String(body?.to || "").trim().toLowerCase();
        const subject = String(body?.subject || "").trim();
        const text = String(body?.body || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "A valid customer email is required" }, { status: 400 });
        if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
        if (!text) return NextResponse.json({ error: "Message body is required" }, { status: 400 });

        // Link the customer account when one exists for this email.
        const customer = await prisma.user.findFirst({ where: { email: { equals: to, mode: "insensitive" } }, select: { id: true } });

        const bodyHtml = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
        const { thread } = await sendInThread({
            thread: null,
            to,
            subject,
            bodyHtml,
            bodyText: text,
            orderId: body?.orderId || null,
            userId: customer?.id || null,
            sentById: userId,
        });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || "", action: "EMAIL_SENT", targetType: "EmailThread", targetId: thread.id, notes: `To ${to}: ${subject}` });

        return NextResponse.json({ threadId: thread.id, message: "Email sent" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}
