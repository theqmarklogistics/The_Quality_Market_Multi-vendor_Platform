import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import resend from "@/configs/resend";
import { getSocketServer } from "@/lib/socketServer";
import { matchInboundThread, verifySvixSignature, bareEmail, recordOutboundStatus, outboundStatusForEvent } from "@/lib/emailThreads";

// Resend webhook. Requires:
//  - an MX-verified receiving subdomain (INBOUND_EMAIL_DOMAIN) for replies,
//  - the webhook's signing secret in RESEND_WEBHOOK_SECRET.
// Handles every event Resend sends: `email.received` (an incoming reply) opens
// or continues a thread; the outbound lifecycle events (sent/delivered/bounced/
// complained/…) update the delivery status on the message they refer to.
export async function POST(request) {
    try {
        const secret = process.env.RESEND_WEBHOOK_SECRET || "";
        if (!secret) {
            // Not configured — acknowledge so Resend doesn't retry forever, but do nothing.
            console.warn("[inbound-email] RESEND_WEBHOOK_SECRET not set; ignoring webhook");
            return NextResponse.json({ ignored: true });
        }

        const payload = await request.text();
        const ok = verifySvixSignature({
            secret,
            svixId: request.headers.get("svix-id"),
            svixTimestamp: request.headers.get("svix-timestamp"),
            svixSignature: request.headers.get("svix-signature"),
            payload,
        });
        if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

        const event = JSON.parse(payload);
        const type = event?.type || "";

        if (type === "email.received") return await handleInbound(event);
        if (outboundStatusForEvent(type)) return await handleOutboundStatus(event, type);

        // Unknown/unsubscribed event type — acknowledge so Resend stops retrying.
        return NextResponse.json({ ignored: true, type });
    } catch (error) {
        console.error("[inbound-email] error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// An incoming reply: match it to its thread (plus-token, then References/
// In-Reply-To), else open a new thread so nothing is lost.
async function handleInbound(event) {
    const meta = event.data || {};
    const emailId = String(meta.email_id || meta.id || "");

    // Resend's email.received webhook carries only metadata — the body, headers
    // and attachments are NOT included (to keep the payload small). Fetch the
    // full received email (text/html/headers) from Resend by its id; without
    // this the message stores blank and the header-based thread match can't run.
    let full = null;
    if (emailId) {
        try {
            const { data, error } = await resend.emails.receiving.get(emailId);
            if (error) console.warn("[inbound-email] receiving.get error:", error.message || error);
            else full = data;
        } catch (e) {
            console.warn("[inbound-email] receiving.get threw:", e?.message || e);
        }
    }
    // Fall back to the webhook metadata if the fetch failed, so the message
    // still lands (just without its body) rather than being lost.
    const data = full || meta;

    const from = bareEmail(data.from);
    if (!from) return NextResponse.json({ ignored: true });

    const recipients = (Array.isArray(data.to) ? data.to : [data.to]).filter(Boolean).map(String);
    // full.headers is a { name: value } map; the webhook meta may omit it or use
    // a [{name,value}] list. Look up case-insensitively across both shapes.
    const headerList = Array.isArray(data.headers) ? data.headers : [];
    const headerObj = data.headers && !Array.isArray(data.headers) ? data.headers : {};
    const headerValue = (name) => {
        const target = name.toLowerCase();
        const fromList = headerList.find((h) => String(h?.name || "").toLowerCase() === target)?.value;
        if (fromList) return fromList;
        const key = Object.keys(headerObj).find((k) => k.toLowerCase() === target);
        return key ? headerObj[key] : "";
    };
    const references = `${headerValue("references")} ${headerValue("in-reply-to")}`;

    let thread = await matchInboundThread({ recipients, references });
    if (!thread) {
        // Unknown sender/thread — open a new one so the message still lands in the inbox.
        const customer = await prisma.user.findFirst({ where: { email: { equals: from, mode: "insensitive" } }, select: { id: true } });
        thread = await prisma.emailThread.create({
            data: {
                subject: String(data.subject || "(no subject)").slice(0, 250),
                customerEmail: from,
                userId: customer?.id || null,
            },
        });
    }

    await prisma.emailMessage.create({
        data: {
            threadId: thread.id,
            direction: "INBOUND",
            fromEmail: from,
            toEmail: recipients[0] || "",
            subject: data.subject || null,
            bodyText: data.text || null,
            bodyHtml: data.html || null,
            providerMessageId: String(headerValue("message-id") || data.message_id || emailId || "").replace(/[<>]/g, "") || null,
        },
    });
    await prisma.emailThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

    try {
        const io = getSocketServer();
        io.to("admin-room").emit("admin-notification", {
            key: "inboundEmail",
            threadId: thread.id,
            message: `New email reply from ${from}`,
        });
    } catch {}

    return NextResponse.json({ received: true, threadId: thread.id });
}

// An outbound lifecycle event (sent/delivered/delayed/opened/clicked/bounced/
// complained): record the new status on the message it refers to. Bounces and
// spam complaints are actionable, so they're pushed to the admin inbox.
async function handleOutboundStatus(event, type) {
    const data = event.data || {};
    const emailId = String(data.email_id || data.id || "");
    const { message, changed } = await recordOutboundStatus({
        type,
        emailId,
        at: data.created_at || event.created_at,
    });
    if (!message) return NextResponse.json({ ignored: true, reason: "no matching outbound message", type });

    if (changed && (message.deliveryStatus === "bounced" || message.deliveryStatus === "complained")) {
        try {
            const io = getSocketServer();
            const label = message.deliveryStatus === "bounced" ? "bounced" : "was marked as spam";
            io.to("admin-room").emit("admin-notification", {
                key: "emailDeliveryProblem",
                threadId: message.threadId,
                message: `Email to ${message.toEmail} ${label}`,
            });
        } catch {}
    }

    return NextResponse.json({ received: true, status: message.deliveryStatus });
}
