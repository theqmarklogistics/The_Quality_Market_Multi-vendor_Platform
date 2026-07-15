// Admin ↔ customer email threading helpers: reply-to plus-addressing, outbound
// send+log, inbound webhook parsing/matching, and Svix signature verification
// (Resend signs webhooks with the Svix scheme — verified here with node:crypto,
// no extra dependency).
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "./prisma.js";
import { sendThreadEmail } from "./email.js";

// Subdomain configured for Resend inbound (MX record) — e.g. "inbound.thequalitymarket.com".
export const INBOUND_EMAIL_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";

export function isInboundEmailConfigured() {
    return Boolean(INBOUND_EMAIL_DOMAIN && process.env.RESEND_WEBHOOK_SECRET);
}

/** Reply-To address carrying the thread token: inbox+<token>@<domain>. */
export function threadReplyAddress(token) {
    if (!INBOUND_EMAIL_DOMAIN) return null;
    return `inbox+${token}@${INBOUND_EMAIL_DOMAIN}`;
}

/** Extract the thread token from a delivered-to address (plus-addressing). */
export function tokenFromAddress(address) {
    const m = /^inbox\+([A-Za-z0-9_-]+)@/i.exec(String(address || "").trim());
    return m ? m[1] : null;
}

/** "Jane Doe <jane@x.com>" → "jane@x.com" (lowercased). */
export function bareEmail(value) {
    const s = String(value || "").trim();
    const m = /<([^<>\s]+@[^<>\s]+)>/.exec(s);
    const email = (m ? m[1] : s).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * Send an email inside a thread (creating the thread when `thread` is null)
 * and log it as an OUTBOUND EmailMessage. Returns { thread, message }.
 */
export async function sendInThread({ thread, to, subject, bodyHtml, bodyText, orderId = null, userId = null, sentById }) {
    let t = thread;
    if (!t) {
        t = await prisma.emailThread.create({
            data: { subject: subject || "(no subject)", customerEmail: to.toLowerCase(), orderId, userId },
        });
    }

    const replyTo = threadReplyAddress(t.token);
    const providerMessageId = await sendThreadEmail({
        to,
        subject: subject || `Re: ${t.subject}`,
        bodyHtml,
        replyTo,
    });

    const message = await prisma.emailMessage.create({
        data: {
            threadId: t.id,
            direction: "OUTBOUND",
            fromEmail: process.env.RESEND_FROM_EMAIL || "noreply@thequalitymarket.com",
            toEmail: to.toLowerCase(),
            subject: subject || null,
            bodyHtml: bodyHtml || null,
            bodyText: bodyText || null,
            providerMessageId: providerMessageId || null,
            sentById: sentById || null,
            isRead: true,
        },
    });
    await prisma.emailThread.update({ where: { id: t.id }, data: { lastMessageAt: new Date() } });

    return { thread: t, message };
}

/**
 * Match an inbound email to its thread:
 *  1. plus-address token on any recipient,
 *  2. References / In-Reply-To header pointing at a logged outbound message,
 *  3. otherwise null (caller opens a new unmatched thread).
 */
export async function matchInboundThread({ recipients = [], references = "" }) {
    for (const rcpt of recipients) {
        const token = tokenFromAddress(rcpt);
        if (token) {
            const byToken = await prisma.emailThread.findUnique({ where: { token } });
            if (byToken) return byToken;
        }
    }

    // References/In-Reply-To carry RFC message-ids like <abc@resend.dev>.
    const ids = String(references || "").match(/<[^<>]+>/g) || [];
    for (const raw of ids) {
        const id = raw.replace(/[<>]/g, "");
        const msg = await prisma.emailMessage.findFirst({
            where: { providerMessageId: id },
            select: { threadId: true },
        });
        if (msg) return prisma.emailThread.findUnique({ where: { id: msg.threadId } });
    }
    return null;
}

/**
 * Verify a Svix-signed webhook (Resend). Returns true when the signature
 * matches. secret is the dashboard value, usually prefixed "whsec_".
 */
export function verifySvixSignature({ secret, svixId, svixTimestamp, svixSignature, payload }) {
    if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;
    // Reject stale timestamps (> 5 min skew) to block replays.
    const ts = parseInt(svixTimestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const expected = createHmac("sha256", key).update(signedContent).digest("base64");

    // Header holds space-separated versioned signatures: "v1,<base64> v1,<base64>".
    for (const part of String(svixSignature).split(" ")) {
        const [version, sig] = part.split(",");
        if (version !== "v1" || !sig) continue;
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return false;
}
