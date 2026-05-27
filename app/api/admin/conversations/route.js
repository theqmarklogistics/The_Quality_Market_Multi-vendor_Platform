import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

// GET /api/admin/conversations
// Returns all STORE-type conversations for admin oversight
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const isAdmin = await authAdmin(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));

        const [rawConversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where: { targetType: "STORE" },
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.conversation.count({ where: { targetType: "STORE" } }),
        ]);

        if (!rawConversations.length) {
            return NextResponse.json({ conversations: [], total, page, pages: Math.ceil(total / limit) });
        }

        const conversationIds = rawConversations.map((conv) => conv.id);
        const storeIds = rawConversations.map((conv) => conv.storeId).filter(Boolean);

        const [participants, lastMessages, unreadCounts, stores] = await Promise.all([
            prisma.conversationParticipant.findMany({
                where: { conversationId: { in: conversationIds } }
            }),
            Promise.all(
                conversationIds.map((id) =>
                    prisma.message.findFirst({
                        where: { conversationId: id },
                        orderBy: { createdAt: "desc" }
                    })
                )
            ),
            Promise.all(
                conversationIds.map((id) =>
                    prisma.message.count({
                        where: { conversationId: id, isRead: false, senderId: { not: userId } }
                    })
                )
            ),
            storeIds.length
                ? prisma.store.findMany({
                    where: { id: { in: storeIds } },
                    select: { id: true, name: true, logo: true, userId: true }
                })
                : Promise.resolve([])
        ]);

        const participantUserIds = [...new Set(participants.map((p) => p.userId))];
        const users = participantUserIds.length
            ? await prisma.user.findMany({
                where: { id: { in: participantUserIds } },
                select: { id: true, name: true, email: true, image: true }
            })
            : [];
        const userMap = new Map(users.map((user) => [user.id, user]));
        const storeMap = new Map(stores.map((store) => [store.id, store]));

        const conversations = rawConversations.map((conv, index) => ({
            ...conv,
            participants: participants
                .filter((participant) => participant.conversationId === conv.id)
                .map((participant) => ({
                    ...participant,
                    user: userMap.get(participant.userId) || null
                })),
            messages: lastMessages[index] ? [lastMessages[index]] : [],
            store: conv.storeId ? storeMap.get(conv.storeId) || null : null,
            _count: { messages: unreadCounts[index] }
        }));

        return NextResponse.json({ conversations, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
