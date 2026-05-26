const store = new Map();

export function getClientIp(request) {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown'
    );
}

export function createRateLimiter({ max = 10, windowMs = 60_000 } = {}) {
    return function check(key) {
        const now = Date.now();
        const entry = store.get(key);

        if (!entry || now >= entry.resetAt) {
            store.set(key, { count: 1, resetAt: now + windowMs });
            return { success: true };
        }

        if (entry.count >= max) {
            return { success: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
        }

        entry.count++;
        return { success: true };
    };
}
