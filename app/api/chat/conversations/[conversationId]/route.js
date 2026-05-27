import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { conversationId } = await params;

        const [participant, isAdmin] = await Promise.all([
            prisma.conversationParticipant.findFirst({
                where: {
                    conversationId,
                    userId
                }
            }),
            authAdmin(userId)
        ]);

        if (!participant && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const conversation = await prisma.conversation.findUnique({
            where: {
                id: conversationId
            }
        });

        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

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

        return NextResponse.json({
            conversation: {
                ...conversation,
                participants: participants.map((participant) => ({
                    ...participant,
                    user: userMap.get(participant.userId) || null
                })),
                store,
                order
            }
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
