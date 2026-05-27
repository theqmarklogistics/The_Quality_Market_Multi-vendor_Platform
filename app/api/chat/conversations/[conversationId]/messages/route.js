import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prismaWs } from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";
import { inngest } from "@/inngest/client";
import authAdmin from "@/middlewares/authAdmin";

const getAdminEmails = () =>
    (process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const db = prismaWs;

const ensureParticipantAccess = async (conversationId, userId) => {
    const participant = await db.conversationParticipant.findFirst({
        where: {
            conversationId,
            userId
        }
    });
    return !!participant;
};

const markConversationAsRead = async (conversationId, userId) => {
    const unreadMessageIds = await db.message.findMany({
        where: {
            conversationId,
            isRead: false,
            senderId: {
                not: userId
            }
        },
        select: {
            id: true
        }
    });

    if (!unreadMessageIds.length) {
        return { updatedCount: 0 };
    }

    await db.message.updateMany({
        where: {
            id: {
                in: unreadMessageIds.map((message) => message.id)
            }
        },
        data: {
            isRead: true
        }
    });

    return {
        updatedCount: unreadMessageIds.length,
        messageIds: unreadMessageIds.map((message) => message.id)
    };
};

const isAdminUser = async (userId) => {
    return authAdmin(userId);
};

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { conversationId } = await params;
        const [hasAccess, isAdmin] = await Promise.all([
            ensureParticipantAccess(conversationId, userId),
            isAdminUser(userId)
        ]);

        // Admins can read any conversation for oversight purposes
        if (!hasAccess && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const readResult = await markConversationAsRead(conversationId, userId);

        // With driverAdapters (JS engine), findMany+include runs two SELECT queries
        // and wraps them in a transaction that PrismaNeonHttp rejects.
        // Fetch messages and senders separately then merge to avoid any transaction.
        const rawMessages = await db.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: "asc" }
        });
        const senderIds = [...new Set(rawMessages.map(m => m.senderId).filter(Boolean))];
        const senders = senderIds.length
            ? await db.user.findMany({ where: { id: { in: senderIds } } })
            : [];
        const senderMap = new Map(senders.map(u => [u.id, u]));
        const messages = rawMessages.map(m => ({ ...m, sender: senderMap.get(m.senderId) || null }));

        if (readResult.updatedCount > 0) {
            try {
                const io = getSocketServer();
                io.to(`conversation-${conversationId}`).emit("messages-read", {
                    conversationId,
                    readerId: userId,
                    messageIds: readResult.messageIds
                });
            } catch (socketError) {
                console.error("Socket.IO read update error:", socketError.message);
            }
        }

        return NextResponse.json({ messages });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { conversationId } = await params;
        const [hasAccess, isAdmin] = await Promise.all([
            ensureParticipantAccess(conversationId, userId),
            isAdminUser(userId)
        ]);

        // Admins can send messages into any conversation (oversight / support intervention)
        if (!hasAccess && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { content } = await request.json();

        if (!content || String(content).trim() === "") {
            return NextResponse.json({ error: "Message content is required" }, { status: 400 });
        }

        const conversation = await db.conversation.findUnique({
            where: {
                id: conversationId
            },
            select: {
                targetType: true
            }
        });

        // PrismaNeonHttp does not support $transaction in any form, and the JS engine
        // (driverAdapters) wraps any create/findX with `include` in an implicit
        // transaction. Use flat create + plain user lookup to avoid all transactions.
        const createdMessage = await db.message.create({
            data: {
                conversationId,
                senderId: userId,
                content: String(content).trim(),
                isRead: false
            }
        });
        const sender = await db.user.findUnique({ where: { id: userId } });
        const message = { ...createdMessage, sender: sender || null };

        db.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() }
        }).catch(err => console.error('conversation timestamp update failed:', err.message));

        try {
            const io = getSocketServer();
            io.to(`conversation-${conversationId}`).emit('new-message', { message });

            const adminEmails = getAdminEmails();
            const senderEmail = String(message?.sender?.email || '').toLowerCase();
            const senderIsAdmin = adminEmails.includes(senderEmail);

            if (conversation?.targetType === 'ADMIN' && !senderIsAdmin) {
                io.to('admin-room').emit('admin-notification', {
                    key: 'unreadChatMessages',
                    message: 'New message in admin chat'
                });
            }
        } catch (socketError) {
            console.error('Socket.IO emit error:', socketError.message);
            // Continue even if Socket.IO fails (message still saved in DB)
        }

        try {
            await inngest.send({
                name: "chat/message.created",
                data: {
                    conversationId,
                    senderId: userId,
                    messageId: message.id
                }
            });
        } catch (inngestError) {
            console.error("Inngest chat event error:", inngestError.message);
        }

        return NextResponse.json({ message });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function PUT(request, { params }) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { conversationId } = await params;
        const [hasAccess, isAdmin] = await Promise.all([
            ensureParticipantAccess(conversationId, userId),
            isAdminUser(userId)
        ]);

        if (!hasAccess && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const readResult = await markConversationAsRead(conversationId, userId);

        if (readResult.updatedCount > 0) {
            try {
                const io = getSocketServer();
                io.to(`conversation-${conversationId}`).emit("messages-read", {
                    conversationId,
                    readerId: userId,
                    messageIds: readResult.messageIds
                });
            } catch (socketError) {
                console.error("Socket.IO read update error:", socketError.message);
            }
        }

        return NextResponse.json({
            message: "Conversation marked as read",
            updatedCount: readResult.updatedCount
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
