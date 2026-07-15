import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSocketServer } from "@/lib/socketServer";
import { matchInboundThread, verifySvixSignature, bareEmail } from "@/lib/emailThreads";

// Resend inbound webhook (event: email.received). Requires:
//  - an MX-verified receiving subdomain (INBOUND_EMAIL_DOMAIN),
//  - the webhook's signing secret in RESEND_WEBHOOK_SECRET.
// Replies are matched to their thread by the inbox+<token> plus-address, then
// by References/In-Reply-To; unmatched mail opens a new thread so nothing is lost.
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
        if (event?.type !== "email.received") return NextResponse.json({ ignored: true });

        const data = event.data || {};
        const from = bareEmail(data.from);
        if (!from) return NextResponse.json({ ignored: true });

        const recipients = (Array.isArray(data.to) ? data.to : [data.to]).filter(Boolean).map(String);
        // Header shapes vary; accept both an object map and a [{name,value}] list.
        const headerList = Array.isArray(data.headers) ? data.headers : [];
        const headerValue = (name) => {
            const fromList = headerList.find((h) => String(h?.name || "").toLowerCase() === name)?.value;
            if (fromList) return fromList;
            const obj = data.headers && !Array.isArray(data.headers) ? data.headers : {};
            return obj[name] || obj[name.replace(/(^|-)(\w)/g, (m) => m.toUpperCase())] || "";
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
                providerMessageId: String(headerValue("message-id") || data.message_id || data.email_id || "").replace(/[<>]/g, "") || null,
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
    } catch (error) {
        console.error("[inbound-email] error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
