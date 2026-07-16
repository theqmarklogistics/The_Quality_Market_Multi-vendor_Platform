import { inngest } from "./client";
import prisma from "@/lib/prisma";
import resend from "@/configs/resend";

const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@thequalitymarket.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thequalitymarket.com';

// Brand header injected at the top of every email so all outgoing mail carries
// the company logo.
const BRAND_HEADER = `
    <div style="text-align: center; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 2px solid #16a34a;">
        <img src="${APP_URL}/the-quality-market-logo.png" alt="The Quality Market" width="56" height="56" style="display: inline-block; object-fit: contain;" />
        <p style="color: #0f172a; font-size: 15px; font-weight: 700; margin: 6px 0 0;">The Quality Market</p>
    </div>
`;

// Send an email via Resend, swallowing the daily-cap / rate-limit error.
// Inngest retries failed steps, but a 429 from Resend is unlikely to recover
// within the same day, so we log and move on rather than retry-burn steps.
async function safeSend(payload) {
    try {
        return await resend.emails.send(payload);
    } catch (err) {
        console.error('[inngest] email send failed:', err?.message || err);
        return null;
    }
}

//Inngest function to save data to a database
export const syncUserCreation = inngest.createFunction(
    {id: "sync-user-create"},
    {event: 'clerk/user.created'},
    async ({event}) => {

        const { data } = event;
        const roleFromMetadata = data?.public_metadata?.role;
        const allowedRoles = ['LOGISTICS_MANAGER', 'FINANCIAL_OPERATIONAL', 'WAREHOUSE_KEEPER', 'RIDER', 'EXTERNAL_SELLER', 'AGENT'];
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
        // Kept as a separate statement (no nested write) — a simple, portable pattern.
        if (role === 'RIDER') {
            await prisma.riderProfile.create({ data: { userId: data.id } });
        }

        // Agents / logistics managers get a StaffProfile up-front so the admin can
        // record their public phone + location for the delivery-network page.
        if (role === 'AGENT' || role === 'LOGISTICS_MANAGER') {
            await prisma.staffProfile.create({ data: { userId: data.id } });
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

// NOTE: Order expiry is no longer a cron. The old every-10-minute cron kept the database
// compute busy around the clock (burning quota), so it was replaced by
// lazy expiry on read paths — see lib/expireOrders.js (sweepExpiredOrders /
// maybeSweepExpiredOrders), invoked from the storefront + order routes.

// ─── Chat message created → notify other participants by email ───────────────
//
// Triggered from app/api/chat/conversations/[conversationId]/messages POST
// after each new message is persisted + socket-broadcast. We fetch the
// conversation participants + the latest message from the DB and email
// everyone EXCEPT the sender.
export const onChatMessageCreated = inngest.createFunction(
    { id: "on-chat-message-created" },
    { event: "chat/message.created" },
    async ({ event, step }) => {
        const { conversationId, senderId, messageId } = event.data;
        if (!conversationId || !senderId) return;

        const participants = await step.run('fetch-participants', async () => {
            return prisma.conversationParticipant.findMany({
                where: { conversationId, userId: { not: senderId } },
                include: { user: { select: { email: true, name: true } } },
            });
        });

        const sender = await step.run('fetch-sender', async () => {
            return prisma.user.findUnique({
                where: { id: senderId },
                select: { name: true },
            });
        });

        const message = await step.run('fetch-message', async () => {
            return prisma.message.findUnique({
                where: { id: messageId },
                select: { content: true, createdAt: true },
            });
        });

        if (!message || !participants.length) return;

        const senderName = sender?.name || 'Someone';

        await step.run('send-emails', async () => {
            const recipients = participants
                .map(p => p.user?.email)
                .filter(Boolean);
            if (!recipients.length) return;

            const subject = `${senderName} sent you a message — The Quality Market`;
            const html = `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${BRAND_HEADER}
                    <h2 style="color: #1e293b;">${senderName} sent you a message</h2>
                    <p style="color: #64748b;">${String(message.content || '').slice(0, 280)}</p>
                    <a href="${APP_URL}/chat?c=${conversationId}"
                       style="display: inline-block; background: #1e293b; color: #fff;
                              text-decoration: none; padding: 12px 24px; border-radius: 100px;
                              font-weight: 600;">Open conversation</a>
                </div>`;

            // Resend supports up to 50 bcc recipients in a single send — batch them.
            // If we exceed that, split.
            const CHUNK = 50;
            for (let i = 0; i < recipients.length; i += CHUNK) {
                const chunk = recipients.slice(i, i + CHUNK);
                await safeSend({
                    from: FROM,
                    to: chunk[0],
                    bcc: chunk.slice(1),
                    subject,
                    html,
                });
            }
        });
    }
);

// ─── Payment proof submitted → email admin approvers ─────────────────────────
//
// Triggered from app/api/orders/payment-proof POST. Notifies admin emails that
// a buyer has uploaded a proof for manual review.
export const onPaymentProofSubmitted = inngest.createFunction(
    { id: "on-payment-proof-submitted" },
    { event: "payment/proof.submitted" },
    async ({ event, step }) => {
        const { orderId, userId } = event.data;
        if (!orderId) return;

        const [order, buyer] = await step.run('fetch-order', async () => {
            return Promise.all([
                prisma.order.findUnique({
                    where: { id: orderId },
                    select: { id: true, total: true, paymentMethod: true },
                }),
                prisma.user.findUnique({
                    where: { id: userId || '' },
                    select: { name: true, email: true },
                }),
            ]);
        });

        if (!order) return;

        const adminEmails = (process.env.ADMIN_EMAIL || '')
            .split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);
        if (!adminEmails.length) return;

        await step.run('send-admin-email', async () => {
            const subject = `New payment proof uploaded — order #${order.id.slice(0, 8)}`;
            const html = `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${BRAND_HEADER}
                    <h2 style="color: #1e293b;">Payment proof needs review</h2>
                    <p style="color: #64748b;">Order <strong>#${order.id.slice(0, 8)}</strong> — RWF ${Number(order.total || 0).toLocaleString()}</p>
                    <p style="color: #64748b;">Buyer: ${buyer?.name || 'Unknown'} (${buyer?.email || 'n/a'})</p>
                    <p style="color: #64748b;">Method: ${order.paymentMethod}</p>
                    <a href="${APP_URL}/admin/orders"
                       style="display: inline-block; background: #1e293b; color: #fff;
                              text-decoration: none; padding: 12px 24px; border-radius: 100px;
                              font-weight: 600;">Review in admin</a>
                </div>`;
            await safeSend({
                from: FROM,
                to: adminEmails[0],
                bcc: adminEmails.slice(1),
                subject,
                html,
            });
        });
    }
);

// ─── Product moderation updated → email the seller ───────────────────────────
//
// Triggered from app/api/admin/products POST. Notifies the seller when their
// product is APPROVED or REJECTED.
export const onProductModerationUpdated = inngest.createFunction(
    { id: "on-product-moderation-updated" },
    { event: "product/moderation.updated" },
    async ({ event, step }) => {
        const { productId, status } = event.data;
        if (!productId || !status) return;

        const product = await step.run('fetch-product', async () => {
            return prisma.product.findUnique({
                where: { id: productId },
                select: {
                    name: true,
                    approvalNotes: true,
                    store: { select: { email: true, name: true } },
                },
            });
        });
        if (!product?.store?.email) return;

        await step.run('send-seller-email', async () => {
            const isApproved = status === 'APPROVED';
            const subject = isApproved
                ? `Your product "${product.name}" was approved`
                : `Your product "${product.name}" was rejected`;
            const html = `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${BRAND_HEADER}
                    <h2 style="color: ${isApproved ? '#16a34a' : '#ef4444'};">
                        ${isApproved ? 'Product approved' : 'Product rejected'}
                    </h2>
                    <p style="color: #64748b;">Product: <strong>${product.name}</strong></p>
                    ${!isApproved && product.approvalNotes ? `
                        <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;">
                            <p style="color:#7f1d19;margin:0;"><strong>Reason:</strong> ${product.approvalNotes}</p>
                        </div>` : ''}
                    <a href="${APP_URL}/store/products"
                       style="display: inline-block; background: #1e293b; color: #fff;
                              text-decoration: none; padding: 12px 24px; border-radius: 100px;
                              font-weight: 600;">View your products</a>
                </div>`;
            await safeSend({
                from: FROM,
                to: product.store.email,
                subject,
                html,
            });
        });
    }
);

// ─── Payment proof reviewed → email the buyer ────────────────────────────────
//
// Triggered from app/api/admin/payments POST. Notifies the buyer when their
// uploaded payment proof was APPROVED or REJECTED by an admin.
export const onPaymentProofReviewed = inngest.createFunction(
    { id: "on-payment-proof-reviewed" },
    { event: "payment/proof.reviewed" },
    async ({ event, step }) => {
        const { orderId, status } = event.data;
        if (!orderId || !status) return;

        const order = await step.run('fetch-order', async () => {
            return prisma.order.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    total: true,
                    paymentProofNotes: true,
                    user: { select: { email: true, name: true } },
                },
            });
        });
        if (!order?.user?.email) return;

        await step.run('send-buyer-email', async () => {
            const isApproved = status === 'APPROVED';
            const subject = isApproved
                ? `Payment confirmed — order #${order.id.slice(0, 8)}`
                : `Payment proof needs attention — order #${order.id.slice(0, 8)}`;
            const html = `
                <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                    ${BRAND_HEADER}
                    <h2 style="color: ${isApproved ? '#16a34a' : '#ef4444'};">
                        ${isApproved ? 'Payment confirmed ✅' : 'Payment rejected ⚠️'}
                    </h2>
                    <p style="color: #64748b;">Order <strong>#${order.id.slice(0, 8)}</strong> — RWF ${Number(order.total || 0).toLocaleString()}</p>
                    ${!isApproved && order.paymentProofNotes ? `
                        <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;">
                            <p style="color:#7f1d19;margin:0;"><strong>Note from admin:</strong> ${order.paymentProofNotes}</p>
                        </div>` : ''}
                    <a href="${APP_URL}/orders"
                       style="display: inline-block; background: #1e293b; color: #fff;
                              text-decoration: none; padding: 12px 24px; border-radius: 100px;
                              font-weight: 600;">View your orders</a>
                </div>`;
            await safeSend({
                from: FROM,
                to: order.user.email,
                subject,
                html,
            });
        });
    }
);

// Kigali Pooled Delivery — batching is manual only.
// Logistics staff create routes on demand from the dispatch board, either with
// "Batch now" (sweep all sorted orders into per-sector corridors) or "Schedule
// route" (hand-build a corridor for a chosen date). There is no automatic cron.
