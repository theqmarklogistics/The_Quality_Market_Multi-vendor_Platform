import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { reportClientError } from "@/lib/errorReporting";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

// Crash reports from the mobile app (and optionally the web client). Anonymous
// is allowed — crashes can happen before sign-in — so it's tightly rate-limited
// and every field is truncated server-side.
const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

export async function POST(request) {
    const ip = getClientIp(request);
    if (!limiter(`client-error:${ip}`).success) {
        return NextResponse.json({ error: "Too many reports" }, { status: 429 });
    }

    try {
        let userId = null;
        try { userId = getAuth(request)?.userId || null; } catch {}

        const body = await request.json();
        await reportClientError({
            platform: clip(body.platform, 40) || 'unknown',
            name: clip(body.name, 120),
            message: clip(body.message, 500),
            stack: clip(body.stack, 6000),
            componentStack: clip(body.componentStack, 3000),
            userId,
            extra: {
                appVersion: clip(body.appVersion, 40),
                screen: clip(body.screen, 120),
            },
        });

        return NextResponse.json({ ok: true });
    } catch {
        // Never let the crash reporter itself surface errors to the client.
        return NextResponse.json({ ok: false }, { status: 400 });
    }
}
