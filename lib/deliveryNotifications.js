import { sendDeliveryStatusEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thequalitymarket.com";

// SMS is opt-in. Email is the default channel; flip DELIVERY_SMS_ENABLED=true
// (and configure a provider in lib/sms.js) to also send text messages.
const SMS_ENABLED = process.env.DELIVERY_SMS_ENABLED === "true";

// Short, friendly SMS copy per delivery event. Kept under ~160 chars.
const SMS_COPY = {
    IN_TRANSIT: (id, link) => `The Quality Market: your order ${id} is on the way! Track your rider live: ${link}`,
    ARRIVING: (id, link) => `The Quality Market: your rider is arriving! Have your delivery code ready. ${link}`,
    DELIVERED: (id) => `The Quality Market: order ${id} delivered. Thank you for shopping with us!`,
    FAILED: (id, link) => `The Quality Market: we couldn't complete delivery of order ${id}. We'll be in touch. ${link}`,
};

// Events we notify on (also gates which statuses produce a customer message).
const NOTIFY_EVENTS = new Set(["IN_TRANSIT", "ARRIVING", "DELIVERED", "FAILED"]);

/**
 * Fire the customer-facing notification for a pooled-delivery status change.
 * Email always sends; SMS only when DELIVERY_SMS_ENABLED is on.
 * Best-effort and never throws — safe to await inside an API route without a guard.
 *
 * @param {object} order  must include id, deliveryStatus, failureReason?, and an
 *                        `address` with { email, phone } (and optional name).
 * @param {string} status one of IN_TRANSIT | ARRIVING | DELIVERED | FAILED
 */
export async function notifyDeliveryEvent(order, status) {
    if (!order || !NOTIFY_EVENTS.has(status)) return;
    const shortId = order.id?.slice(0, 12) || "your order";
    // External recipients have no platform login — their link carries the public
    // tracking token. Platform customers get the plain (login-gated) link.
    const trackLink = order.trackingToken
        ? `${APP_URL}/track/${order.id}?t=${order.trackingToken}`
        : `${APP_URL}/track/${order.id}`;
    const email = order.address?.email;
    const phone = order.address?.phone;

    const tasks = [];
    if (email) {
        tasks.push(
            sendDeliveryStatusEmail({
                to: email,
                orderId: order.id,
                status,
                failureReason: order.failureReason,
            }).catch((e) => console.error("[deliveryNotify] email failed:", e.message))
        );
    }
    if (SMS_ENABLED && phone && SMS_COPY[status]) {
        const message = SMS_COPY[status](shortId, trackLink);
        tasks.push(sendSms({ to: phone, message }));
    }
    await Promise.allSettled(tasks);
}

/**
 * Notify every customer on a corridor that their order has been dispatched.
 * `orders` each carry id + address; runs in parallel, best-effort.
 */
export async function notifyCorridorDispatched(orders) {
    if (!Array.isArray(orders) || orders.length === 0) return;
    await Promise.allSettled(orders.map((o) => notifyDeliveryEvent(o, "IN_TRANSIT")));
}
