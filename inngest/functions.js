import { inngest } from "./client";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

//Inngest function to save data to a database
export const syncUserCreation = inngest.createFunction(
    {id: "sync-user-create"},
    {event: 'clerk/user.created'},
    async ({event}) => {
        
        const { data } = event;
        const roleFromMetadata = data?.public_metadata?.role;
        const allowedRoles = ['LOGISTICS_MANAGER', 'FINANCIAL_OPERATIONAL', 'WAREHOUSE_KEEPER'];
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

// Kigali Pooled Delivery — 11:01 AM daily batching engine
// Runs at 09:01 UTC = 11:01 AM CAT (UTC+2)
export const kigaliPoolBatchingEngine = inngest.createFunction(
    { id: "kigali-pool-batching-engine" },
    { cron: "1 9 * * *" },
    async ({ step }) => {
        await step.run("batch-and-assign-corridors", async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch all KIGALI_POOL orders placed today that are still awaiting intake
            const orders = await prisma.order.findMany({
                where: {
                    deliveryType: "KIGALI_POOL",
                    deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] },
                    createdAt: { gte: today }
                },
                include: { address: true }
            });

            if (!orders.length) return { batched: 0, corridors: 0 };

            // Group orders by Kigali sector (or district as fallback)
            const corridorMap = new Map();
            for (const order of orders) {
                const key = order.address?.sector || order.address?.district || "DEFAULT";
                if (!corridorMap.has(key)) corridorMap.set(key, []);
                corridorMap.get(key).push(order);
            }

            const BASE_ROUTE_COST = 10000; // 10,000 RWF per corridor
            const runDate = new Date();

            for (const [corridorKey, groupOrders] of corridorMap.entries()) {
                const corridorId = "cor_" + randomBytes(8).toString("hex");

                // Create the corridor as CLOSED (ready for dispatch). Logistics staff assign a
                // rider and dispatch it, which flips the corridor + its orders to IN_TRANSIT.
                await prisma.$executeRaw`
                    INSERT INTO "DeliveryCorridor" (id, name, "runDate", "baseRouteCost", status, "createdAt", "updatedAt")
                    VALUES (
                        ${corridorId},
                        ${"Hub → " + corridorKey},
                        ${runDate},
                        ${BASE_ROUTE_COST},
                        'CLOSED'::"CorridorStatus",
                        NOW(),
                        NOW()
                    )
                `;

                // Leg-based proportional costing:
                // Stop index 1 = closest (cheapest), stop N = furthest (most expensive)
                // Each stop's share = stopIndex / triangularNumber(N) * BASE_ROUTE_COST
                // triangularNumber(N) = N*(N+1)/2
                const n = groupOrders.length;
                const triangularSum = (n * (n + 1)) / 2;

                for (let i = 0; i < groupOrders.length; i++) {
                    const order = groupOrders[i];
                    const stopIndex = i + 1;
                    const feeShare = parseFloat(((stopIndex / triangularSum) * BASE_ROUTE_COST).toFixed(2));

                    // Persist the stop position; set status to SORTING (arrived at hub, batched).
                    // Dispatch by logistics later advances it to IN_TRANSIT.
                    await prisma.$executeRaw`
                        UPDATE "Order"
                        SET "corridorId"       = ${corridorId},
                            "deliveryStatus"   = 'SORTING'::"PoolDeliveryStatus",
                            "deliveryFeeShare" = ${feeShare},
                            "stopSequence"     = ${stopIndex},
                            "updatedAt"        = NOW()
                        WHERE id = ${order.id}
                    `;
                }
            }

            return { batched: orders.length, corridors: corridorMap.size };
        });
    }
);