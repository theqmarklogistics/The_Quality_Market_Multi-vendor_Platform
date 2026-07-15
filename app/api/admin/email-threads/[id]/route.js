import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { sendInThread } from "@/lib/emailThreads";

// GET — one thread with its full message history (marks inbound mail read).
export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const thread = await prisma.emailThread.findUnique({
            where: { id },
            include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

        prisma.emailMessage
            .updateMany({ where: { threadId: id, direction: "INBOUND", isRead: false }, data: { isRead: true } })
            .catch(() => {});

        return NextResponse.json({ thread });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}

// POST { body } — reply inside this thread.
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const thread = await prisma.emailThread.findUnique({ where: { id } });
        if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

        const body = await request.json();
        const text = String(body?.body || "").trim();
        if (!text) return NextResponse.json({ error: "Message body is required" }, { status: 400 });

        const bodyHtml = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
        const { message } = await sendInThread({
            thread,
            to: thread.customerEmail,
            subject: `Re: ${thread.subject}`,
            bodyHtml,
            bodyText: text,
            sentById: userId,
        });

        return NextResponse.json({ message });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 500 });
    }
}
