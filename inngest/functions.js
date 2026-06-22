import { inngest } from "./client";
import prisma, { prismaWs } from "@/lib/prisma";

//Inngest function to save data to a database
export const syncUserCreation = inngest.createFunction(
    {id: "sync-user-create"},
    {event: 'clerk/user.created'},
    async ({event}) => {
        
        const { data } = event;
        const roleFromMetadata = data?.public_metadata?.role;
        const allowedRoles = ['LOGISTICS_MANAGER', 'FINANCIAL_OPERATIONAL', 'WAREHOUSE_KEEPER', 'RIDER'];
        const role = allowedRoles.includes(roleFromMetadata) ? roleFromMetadata : undefined;
        await prisma.user.create({
            data: {
                id: data.id,
                email: data.email_addresses[0].email_address,
                name: `${data.first_name} ${data.last_name}`,
                image: data.image_url,
                ...(role ? { role } : {})
            }
    })

        // Riders get a profile row up-front so dispatch can manage them immediately.
        // Separate statement — nested writes run in a transaction, unsupported on the Neon HTTP client.
        if (role === 'RIDER') {
            await prisma.riderProfile.create({ data: { userId: data.id } });
        }
}
)

//Inngest function to update data in a database
export const syncUserUpdate = inngest.createFunction(
    {id: "sync-user-update"},
    {event: 'clerk/user.updated'},
    async ({event}) => {

        const { data } = event;
        await prisma.user.update({
            where: {
                id: data.id
            },
            data: {
                email: data.email_addresses[0].email_address,
                name: `${data.first_name} ${data.last_name}`,
                image: data.image_url
            }
    })
    }
)


//Inngest function to delete data from a database
export const syncUserDeletion = inngest.createFunction(
    {id: "sync-user-delete"},
    {event: 'clerk/user.deleted'},
    async ({event}) => {

        const { data } = event;
        await prisma.user.delete({
            where: {
                id: data.id
            }
    })
    }
)


// Inngest function to delete coupon on expiry

export const deleteCouponOnExpiry = inngest.createFunction(
    {id: "delete-coupon-on-expiry"},
    {event: 'cron/delete-coupon-on-expiry'},
    async ({event, step}) => {

        const {data} = event;
        const expiryDate = new Date(data.expiresAt);
        await step.sleepUntil('wait-for-expiry', expiryDate);

        await step.run('delete-coupon', async () => {
            await prisma.coupon.delete({
                where: {
                    code: data.code
                }
            })
        })
    
    }
)

// Inngest cron to expire unpaid pending orders after timeout and restore stock
export const expirePendingOrders = inngest.createFunction(
    { id: "expire-pending-orders" },
    { cron: "*/10 * * * *" },
    async ({ step }) => {
        await step.run("mark-expired-orders", async () => {
            const now = new Date();

            // ── Platform orders: restore stock, then expire. ─────────────────
            const expiredOrders = await prisma.order.findMany({
                where: {
                    paymentStatus: "PENDING",
                    isPaid: false,
                    paymentExpiresAt: { lte: now },
                    isExternalDelivery: false
                },
                include: { orderItems: true }
            });

            if (expiredOrders.length > 0) {
                // Restoring stock and expiring the orders must be atomic. Interactive
                // transactions aren't supported on the HTTP adapter, so use the WebSocket
                // client (prismaWs) — the default HTTP `prisma` would throw here.
                await prismaWs.$transaction(async (tx) => {
                    for (const order of expiredOrders) {
                        for (const item of order.orderItems) {
                            await tx.product.update({
                                where: { id: item.productId },
                                data: {
                                    warehouseQuantity: { increment: item.quantity },
                                    inStock: true
                                }
                            });
                        }
                    }

                    await tx.order.updateMany({
                        where: { id: { in: expiredOrders.map(o => o.id) } },
                        data: { paymentStatus: "EXPIRED" }
                    });
                });
            }

            // ── External delivery-only bookings: no stock to restore. Cancel only
            // the truly abandoned ones — the partner never submitted payment proof.
            // Submitted/under-review (or rejected) bookings are left for staff.
            const abandonedExternal = await prisma.order.findMany({
                where: {
                    isExternalDelivery: true,
                    isPaid: false,
                    paymentStatus: "PENDING",
                    paymentProofStatus: "NOT_SUBMITTED",
                    paymentExpiresAt: { lte: now }
                },
                select: { id: true }
            });

            if (abandonedExternal.length > 0) {
                await prisma.order.updateMany({
                    where: { id: { in: abandonedExternal.map(o => o.id) } },
                    data: {
                        paymentStatus: "EXPIRED",
                        deliveryStatus: "FAILED",
                        failureReason: "Booking expired — payment not received within 24 hours"
                    }
                });
            }

            return expiredOrders.length + abandonedExternal.length;
        });
    }
);

// Chat notification event hook (for analytics/notification fanout)
export const onChatMessageCreated = inngest.createFunction(
    { id: "on-chat-message-created" },
    { event: "chat/message.created" },
    async ({ event, step }) => {
        await step.run("record-chat-message-event", async () => {
            const { conversationId, senderId, messageId } = event.data;
            console.log("Chat message event:", { conversationId, senderId, messageId });
        });
    }
);

// Payment proof notification event hook
export const onPaymentProofSubmitted = inngest.createFunction(
    { id: "on-payment-proof-submitted" },
    { event: "payment/proof.submitted" },
    async ({ event, step }) => {
        await step.run("record-payment-proof-event", async () => {
            const { orderId, userId } = event.data;
            console.log("Payment proof submitted:", { orderId, userId });
        });
    }
);

// Product moderation notification event hook
export const onProductModerationUpdated = inngest.createFunction(
    { id: "on-product-moderation-updated" },
    { event: "product/moderation.updated" },
    async ({ event, step }) => {
        await step.run("record-product-moderation-event", async () => {
            const { productId, status, moderatedBy } = event.data;
            console.log("Product moderation update:", { productId, status, moderatedBy });
        });
    }
);

// Payment proof review notification event hook
export const onPaymentProofReviewed = inngest.createFunction(
    { id: "on-payment-proof-reviewed" },
    { event: "payment/proof.reviewed" },
    async ({ event, step }) => {
        await step.run("record-payment-proof-review-event", async () => {
            const { orderId, status, reviewedBy } = event.data;
            console.log("Payment proof reviewed:", { orderId, status, reviewedBy });
        });
    }
);

// Kigali Pooled Delivery — batching is manual only.
// Logistics staff create routes on demand from the dispatch board, either with
// "Batch now" (sweep all sorted orders into per-sector corridors) or "Schedule
// route" (hand-build a corridor for a chosen date). There is no automatic cron.