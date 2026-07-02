// Dependency-free error reporting for production.
//
// Every reported error is:
//   1. Logged to stdout as a single structured JSON line (greppable, and picked up
//      by any host's log drain — Railway, Render, Docker, journald…).
//   2. Optionally forwarded to a webhook (ERROR_WEBHOOK_URL — Slack/Discord webhook
//      or any endpoint that accepts a JSON POST).
//   3. Optionally emailed to ops (ERROR_ALERT_EMAIL, falls back to the first
//      ADMIN_EMAIL) via the existing Resend account — throttled per error
//      signature so an error storm cannot flood the inbox.
//
// All three sinks are best-effort: reporting must never throw into the request
// path that called it.

const EMAIL_THROTTLE_MS = 15 * 60 * 1000; // max 1 email per signature per 15 min
const lastEmailAt = new Map(); // signature -> timestamp

function signatureOf(payload) {
    return `${payload.source}|${payload.name}|${(payload.message || '').slice(0, 120)}`;
}

function alertEmailAddress() {
    const explicit = process.env.ERROR_ALERT_EMAIL;
    if (explicit) return explicit.trim();
    const admins = process.env.ADMIN_EMAIL || '';
    return admins.split(',')[0]?.trim() || null;
}

async function sendWebhook(payload) {
    const url = process.env.ERROR_WEBHOOK_URL;
    if (!url) return;
    try {
        // Slack/Discord accept a `text`/`content` field; generic endpoints get the full payload.
        const text = `🔴 [${payload.source}] ${payload.name}: ${payload.message}\n${payload.path || ''}`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, content: text, ...payload }),
            signal: AbortSignal.timeout(5000),
        });
    } catch (e) {
        console.error('[errorReporting] webhook failed:', e.message);
    }
}

async function sendEmail(payload) {
    const to = alertEmailAddress();
    if (!to || !process.env.RESEND_API_KEY) return;

    const sig = signatureOf(payload);
    const now = Date.now();
    if (now - (lastEmailAt.get(sig) || 0) < EMAIL_THROTTLE_MS) return;
    lastEmailAt.set(sig, now);
    // Keep the throttle map from growing unbounded.
    if (lastEmailAt.size > 500) {
        for (const [k, t] of lastEmailAt) if (now - t > EMAIL_THROTTLE_MS) lastEmailAt.delete(k);
    }

    try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@thequalitymarket.com',
            to,
            subject: `🔴 [${payload.source}] ${payload.name}: ${String(payload.message || '').slice(0, 90)}`,
            html: `
                <div style="font-family: monospace; font-size: 13px;">
                    <p><strong>Source:</strong> ${payload.source}</p>
                    <p><strong>Error:</strong> ${payload.name}: ${payload.message}</p>
                    ${payload.path ? `<p><strong>Path:</strong> ${payload.method || ''} ${payload.path}</p>` : ''}
                    ${payload.routerKind ? `<p><strong>Router:</strong> ${payload.routerKind} / ${payload.routeType || ''}</p>` : ''}
                    <p><strong>Time:</strong> ${payload.timestamp}</p>
                    <pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;">${(payload.stack || 'no stack').slice(0, 4000)}</pre>
                    <p style="color:#94a3b8;">Repeats of this error are muted for 15 minutes.</p>
                </div>`,
        });
    } catch (e) {
        console.error('[errorReporting] alert email failed:', e.message);
    }
}

/**
 * Report an error from any server context (API route, render, background job).
 * Never throws. `context` may include { path, method, routerKind, routeType, extra }.
 */
export async function reportServerError(error, context = {}) {
    try {
        const payload = {
            source: context.source || 'server',
            name: error?.name || 'Error',
            message: error?.message || String(error),
            stack: typeof error?.stack === 'string' ? error.stack.slice(0, 8000) : undefined,
            digest: error?.digest,
            path: context.path,
            method: context.method,
            routerKind: context.routerKind,
            routeType: context.routeType,
            extra: context.extra,
            timestamp: new Date().toISOString(),
        };

        // 1. Structured log line — always.
        console.error('SERVER_ERROR ' + JSON.stringify(payload));

        // 2 + 3. Forward in the background; never block or throw.
        await Promise.allSettled([sendWebhook(payload), sendEmail(payload)]);
    } catch (e) {
        console.error('[errorReporting] reporter itself failed:', e?.message);
    }
}

/**
 * Report an error sent by a client (mobile app / browser). Same sinks, tagged
 * with the client platform. Payload is expected to be pre-sanitized by the API route.
 */
export async function reportClientError({ platform, name, message, stack, componentStack, userId, extra }) {
    return reportServerError(
        { name: name || 'ClientError', message, stack: [stack, componentStack].filter(Boolean).join('\n---component---\n') },
        { source: `client:${platform || 'unknown'}`, extra: { userId, ...extra } }
    );
}
