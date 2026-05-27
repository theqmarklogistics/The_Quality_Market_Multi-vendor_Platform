import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";
import { inngest } from "@/inngest/client";

const getAdminEmails = () =>
    (process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

const ensureParticipantAccess = async (conversationId, userId) => {
    const participant = await prisma.conversationParticipant.findFirst({
        where: {
            conversationId,
            userId
        }
    });
    return !!participant;
};

const markConversationAsRead = async (conversationId, userId) => {
    const unreadMessageIds = await prisma.message.findMany({
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

    await prisma.message.updateMany({
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
    const adminEmails = getAdminEmails();
    if (!adminEmails.length) return false;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return adminEmails.includes((user?.email || "").toLowerCase());
};

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { conversationId } = await params;
        const hasAccess = await ensureParticipantAccess(conversationId, userId);

        // Admins can read any conversation for oversight purposes
        if (!hasAccess && !(await isAdminUser(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const readResult = await markConversationAsRead(conversationId, userId);

        const messages = await prisma.message.findMany({
            where: {
                conversationId
            },
            include: {
                sender: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });

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
        const hasAccess = await ensureParticipantAccess(conversationId, userId);

        // Admins can send messages into any conversation (oversight / support intervention)
        if (!hasAccess && !(await isAdminUser(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { content } = await request.json();

        if (!content || String(content).trim() === "") {
            return NextResponse.json({ error: "Message content is required" }, { status: 400 });
        }

        const conversation = await prisma.conversation.findUnique({
            where: {
                id: conversationId
            },
            select: {
                targetType: true
            }
        });

        const [message] = await prisma.$transaction([
            prisma.message.create({
                data: {
                    conversationId,
                    senderId: userId,
                    content: String(content).trim(),
                    isRead: false
                },
                include: {
                    sender: true
                }
            }),
            prisma.conversation.update({
                where: {
                    id: conversationId
                },
                data: {
                    updatedAt: new Date()
                }
            })
        ]);

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
        const hasAccess = await ensureParticipantAccess(conversationId, userId);

        if (!hasAccess) {
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
