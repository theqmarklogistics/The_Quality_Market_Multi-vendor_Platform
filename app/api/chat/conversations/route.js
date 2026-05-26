import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

const conversationLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });

export async function GET(request) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: {
                        userId
                    }
                }
            },
            include: {
                participants: {
                    include: {
                        user: true
                    }
                },
                messages: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 1
                },
                _count: {
                    select: {
                        messages: {
                            where: {
                                isRead: false,
                                senderId: {
                                    not: userId
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: "desc"
            }
        });

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

                targetStoreId = order.store.id;
                targetUserId = order.store.userId;
            }
        }

        if (targetType === "ADMIN") {
            const firstAdminEmail = process.env.ADMIN_EMAIL?.split(",")?.[0]?.trim();
            if (!firstAdminEmail) {
                return NextResponse.json({ error: "Admin email is not configured" }, { status: 500 });
            }

            const adminUser = await prisma.user.findFirst({
                where: {
                    email: firstAdminEmail
                },
                select: {
                    id: true
                }
            });

            if (!adminUser) {
                return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
            }

            targetUserId = adminUser.id;
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
            },
            include: {
                participants: true
            }
        });

        if (existingConversation && existingConversation.participants.length === 2) {
            return NextResponse.json({ conversation: existingConversation });
        }

        const conversation = await prisma.conversation.create({
            data: {
                targetType,
                orderId: orderId || null,
                storeId: targetStoreId,
                createdById: userId,
                participants: {
                    create: [
                        { userId },
                        { userId: targetUserId }
                    ]
                }
            },
            include: {
                participants: {
                    include: {
                        user: true
                    }
                }
            }
        });

        return NextResponse.json({ conversation });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
