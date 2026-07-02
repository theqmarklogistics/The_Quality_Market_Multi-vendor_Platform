import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";
import authAdmin from "@/middlewares/authAdmin";

const conversationLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const getAdminEmails = () =>
    (process.env.ADMIN_EMAIL || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

const hydrateConversation = async (conversationId) => {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
    });
    if (!conversation) return null;

    const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId }
    });
    const participantUserIds = [...new Set(participants.map((p) => p.userId))];
    const users = participantUserIds.length
        ? await prisma.user.findMany({ where: { id: { in: participantUserIds } } })
        : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const [store, order] = await Promise.all([
        conversation.storeId
            ? prisma.store.findUnique({ where: { id: conversation.storeId } })
            : Promise.resolve(null),
        conversation.orderId
            ? prisma.order.findUnique({ where: { id: conversation.orderId } })
            : Promise.resolve(null)
    ]);

    return {
        ...conversation,
        participants: participants.map((participant) => ({
            ...participant,
            user: userMap.get(participant.userId) || null
        })),
        store,
        order
    };
};

export async function GET(request) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch each piece separately and merge in JS instead of one findMany+include.
        // Keeps each query independent and avoids a multi-SELECT transaction.

        const isAdmin = await authAdmin(userId);
        const conversationFilter = isAdmin
            ? {
                OR: [
                    { participants: { some: { userId } } },
                    { targetType: "ADMIN" }
                ]
            }
            : { participants: { some: { userId } } };

        const rawConversations = await prisma.conversation.findMany({
            where: conversationFilter,
            orderBy: { updatedAt: "desc" }
        });

        if (!rawConversations.length) {
            return NextResponse.json({ conversations: [] });
        }

        const conversationIds = rawConversations.map(c => c.id);

        // Parallel: participants list, last message per conv, unread count per conv
        const [participants, lastMessages, unreadCounts] = await Promise.all([
            prisma.conversationParticipant.findMany({
                where: { conversationId: { in: conversationIds } }
            }),
            Promise.all(
                conversationIds.map(id =>
                    prisma.message.findFirst({
                        where: { conversationId: id },
                        orderBy: { createdAt: "desc" }
                    })
                )
            ),
            Promise.all(
                conversationIds.map(id =>
                    prisma.message.count({
                        where: { conversationId: id, isRead: false, senderId: { not: userId } }
                    })
                )
            )
        ]);

        // Batch-fetch all participant users in one query
        const participantUserIds = [...new Set(participants.map(p => p.userId))];
        const users = participantUserIds.length
            ? await prisma.user.findMany({ where: { id: { in: participantUserIds } } })
            : [];
        const userMap = new Map(users.map(u => [u.id, u]));

        // Merge into the shape the frontend expects
        const conversations = rawConversations.map((conv, i) => ({
            ...conv,
            participants: participants
                .filter(p => p.conversationId === conv.id)
                .map(p => ({ ...p, user: userMap.get(p.userId) || null })),
            messages: lastMessages[i] ? [lastMessages[i]] : [],
            _count: { messages: unreadCounts[i] }
        }));

        return NextResponse.json({ conversations });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request) {
    const rl = conversationLimiter(`chat:${getClientIp(request)}`);
    if (!rl.success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { targetType, orderId, storeId } = await request.json();

        if (!targetType || !["ADMIN", "STORE"].includes(targetType)) {
            return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
        }

        let targetUserId = null;
        let targetStoreId = null;

        if (targetType === "STORE") {
            if (!orderId && !storeId) {
                return NextResponse.json({ error: "Order or store is required to chat with store owner" }, { status: 400 });
            }

            if (storeId) {
                const store = await prisma.store.findFirst({
                    where: {
                        id: storeId
                    },
                    select: {
                        id: true,
                        userId: true
                    }
                });

                if (!store) {
                    return NextResponse.json({ error: "Store not found" }, { status: 404 });
                }

                targetStoreId = store.id;
                targetUserId = store.userId;
            } else {
                const order = await prisma.order.findFirst({
                    where: {
                        id: orderId,
                        userId
                    },
                    include: {
                        store: {
                            select: {
                                id: true,
                                userId: true
                            }
                        }
                    }
                });

                if (!order) {
                    return NextResponse.json({ error: "Order not found" }, { status: 404 });
                }
                if (!order.store) {
                    return NextResponse.json({ error: "This order has no store to message" }, { status: 400 });
                }

                targetStoreId = order.store.id;
                targetUserId = order.store.userId;
            }
        }

        if (targetType === "ADMIN") {
            const adminEmails = getAdminEmails();
            if (!adminEmails.length) {
                return NextResponse.json({ error: "Admin email is not configured" }, { status: 500 });
            }

            const adminUsers = await prisma.user.findMany({
                where: {
                    email: { in: adminEmails }
                },
                select: {
                    id: true
                }
            });

            if (!adminUsers.length) {
                return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
            }

            targetUserId = adminUsers[0].id;
            const adminIds = adminUsers.map((admin) => admin.id);
            const adminParticipants = [...new Set(adminIds)];

            const existingConversation = await prisma.conversation.findFirst({
                where: {
                    targetType,
                    orderId: orderId || null,
                    storeId: targetStoreId,
                    AND: [
                        {
                            participants: {
                                some: {
                                    userId
                                }
                            }
                        },
                        {
                            participants: {
                                some: {
                                    userId: { in: adminParticipants }
                                }
                            }
                        }
                    ]
                }
            });

            if (existingConversation) {
                let conversation = await hydrateConversation(existingConversation.id);
                if (conversation) {
                    const existingIds = new Set(conversation.participants.map((p) => p.userId));
                    const missingAdminIds = adminParticipants.filter((adminId) => !existingIds.has(adminId));
                    for (const adminId of missingAdminIds) {
                        await prisma.conversationParticipant.create({
                            data: { conversationId: existingConversation.id, userId: adminId }
                        });
                    }
                    if (missingAdminIds.length) {
                        conversation = await hydrateConversation(existingConversation.id);
                    }
                }
                return NextResponse.json({ conversation });
            }

            const newConversation = await prisma.conversation.create({
                data: {
                    targetType,
                    orderId: orderId || null,
                    storeId: targetStoreId,
                    createdById: userId,
                }
            });

            await prisma.conversationParticipant.create({
                data: { conversationId: newConversation.id, userId }
            });

            for (const adminId of adminParticipants) {
                if (adminId === userId) continue;
                await prisma.conversationParticipant.create({
                    data: { conversationId: newConversation.id, userId: adminId }
                });
            }

            const conversation = await hydrateConversation(newConversation.id);
            return NextResponse.json({ conversation });
        }

        if (!targetUserId) {
            return NextResponse.json({ error: "Unable to resolve chat target" }, { status: 400 });
        }

        const existingConversation = await prisma.conversation.findFirst({
            where: {
                targetType,
                orderId: orderId || null,
                storeId: targetStoreId,
                AND: [
                    {
                        participants: {
                            some: {
                                userId
                            }
                        }
                    },
                    {
                        participants: {
                            some: {
                                userId: targetUserId
                            }
                        }
                    }
                ]
            }
        });

        if (existingConversation) {
            const conversation = await hydrateConversation(existingConversation.id);
            return NextResponse.json({ conversation });
        }

        // Create conversation + participants as separate statements (no nested write).
        //
        // Steps:
        //  1. Flat conversation create (single INSERT — no implicit transaction)
        //  2. Add both participants
        //  3. Re-fetch with participants for the response shape callers expect
        const newConversation = await prisma.conversation.create({
            data: {
                targetType,
                orderId: orderId || null,
                storeId: targetStoreId,
                createdById: userId,
            }
        });

        // Two sequential creates are safe here — if the second fails, the conversation
        // has no participants and is invisible to both users (all queries filter by
        // participants.some.userId). Next attempt will create a fresh conversation.
        await prisma.conversationParticipant.create({
            data: { conversationId: newConversation.id, userId }
        });
        await prisma.conversationParticipant.create({
            data: { conversationId: newConversation.id, userId: targetUserId }
        });

        const conversation = await hydrateConversation(newConversation.id);
        return NextResponse.json({ conversation });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
