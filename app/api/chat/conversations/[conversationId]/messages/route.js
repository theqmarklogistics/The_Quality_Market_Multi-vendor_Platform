import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSocketServer } from "@/lib/socketServer";
import { inngest } from "@/inngest/client";
import authAdmin from "@/middlewares/authAdmin";

const getAdminEmails = () =>
    (process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const ensureParticipantAccess = async (conversationId, userId) => {
    const participant = await prisma.$queryRaw`
        SELECT 1
        FROM "ConversationParticipant"
        WHERE "conversationId" = ${conversationId} AND "userId" = ${userId}
        LIMIT 1
    `;
    return Array.isArray(participant) && participant.length > 0;
};

const markConversationAsRead = async (conversationId, userId) => {
    const unreadMessageIds = await prisma.$queryRaw`
        SELECT id
        FROM "Message"
        WHERE "conversationId" = ${conversationId}
          AND "isRead" = false
          AND "senderId" <> ${userId}
    `;
    const ids = Array.isArray(unreadMessageIds) ? unreadMessageIds.map((row) => row.id) : [];

    if (!ids.length) {
        return { updatedCount: 0 };
    }

    await prisma.$executeRaw`
        UPDATE "Message"
        SET "isRead" = true
        WHERE id IN (${Prisma.join(ids)})
    `;

    return {
        updatedCount: ids.length,
        messageIds: ids
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

        const rawMessages = await prisma.$queryRaw`
            SELECT *
            FROM "Message"
            WHERE "conversationId" = ${conversationId}
            ORDER BY "createdAt" ASC
        `;
        const senderIds = [...new Set(rawMessages.map(m => m.senderId).filter(Boolean))];
        const senders = senderIds.length
            ? await prisma.$queryRaw`
                SELECT *
                FROM "User"
                WHERE id IN (${Prisma.join(senderIds)})
            `
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

        const conversationRows = await prisma.$queryRaw`
            SELECT "targetType"
            FROM "Conversation"
            WHERE id = ${conversationId}
            LIMIT 1
        `;
        const conversation = conversationRows?.[0] || null;

        // Generate ID for message (cuid-like format)
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const now = new Date();

        // Raw single-statement INSERT — no implicit transaction wrapping.
        // Message schema has no updatedAt column — only createdAt.
        await prisma.$executeRaw`
            INSERT INTO "Message" (id, "conversationId", "senderId", content, "isRead", "createdAt")
            VALUES (${messageId}, ${conversationId}, ${userId}, ${String(content).trim()}, false, ${now})
        `;

        const createdMessage = {
            id: messageId,
            conversationId,
            senderId: userId,
            content: String(content).trim(),
            isRead: false,
            createdAt: now
        };

        const senderRows = await prisma.$queryRaw`
            SELECT *
            FROM "User"
            WHERE id = ${userId}
            LIMIT 1
        `;
        const sender = senderRows?.[0] || null;
        const message = { ...createdMessage, sender: sender || null };

        prisma.$executeRaw`
            UPDATE "Conversation"
            SET "updatedAt" = NOW()
            WHERE id = ${conversationId}
        `.catch(err => console.error('conversation timestamp update failed:', err.message));

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
