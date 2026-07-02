// Next.js instrumentation hook — captures every uncaught error from API routes,
// server components, and route handlers in production, and feeds it to the
// dependency-free reporter in lib/errorReporting.js (structured log + optional
// webhook + throttled admin email). See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
export function register() {
    // No warm-up needed.
}

export async function onRequestError(err, request, context) {
    // The reporter uses Node APIs (Resend, fetch with timeout) — skip on edge.
    if (process.env.NEXT_RUNTIME === 'edge') return;
    const { reportServerError } = await import('./lib/errorReporting.js');
    await reportServerError(err, {
        source: 'next-server',
        path: request?.path,
        method: request?.method,
        routerKind: context?.routerKind,
        routeType: context?.routeType,
    });
}
