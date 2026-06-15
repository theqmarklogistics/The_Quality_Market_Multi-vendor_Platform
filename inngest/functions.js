import { inngest } from "./client";
import prisma from "@/lib/prisma";
import { runPoolBatching } from "@/lib/poolBatching";

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

            const expiredOrders = await prisma.order.findMany({
                where: {
                    paymentStatus: "PENDING",
                    isPaid: false,
                    paymentExpiresAt: { lte: now }
                },
                include: { orderItems: true }
            });

            if (expiredOrders.length === 0) return 0;

            await prisma.$transaction(async (tx) => {
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

            return expiredOrders.length;
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

// Kigali Pooled Delivery — automatic batching waves.
// Two daily runs in Africa/Kigali (UTC+2): 11:00 AM (09:00 UTC) and 3:00 PM (13:00 UTC).
// Orders sorted after the morning wave are swept by the afternoon wave; any order
// still un-corridored on a later day is picked up too (the engine sweeps by
// corridorId IS NULL, not by date). Logistics can also trigger a run on demand.
export const kigaliPoolBatchingEngine = inngest.createFunction(
    { id: "kigali-pool-batching-engine" },
    [{ cron: "0 9 * * *" }, { cron: "0 13 * * *" }],
    async ({ step }) => {
        return await step.run("batch-and-assign-corridors", () => runPoolBatching());
    }
);