import { unstable_cache } from 'next/cache';

// ── In-process data cache for rare-write / hot-read rows ─────────────────────
// Use `cachedFetch(key, fetcher, tags, ttlSeconds)` to wrap a Prisma read so
// the result is memoized per-tag inside Next's Data Cache. Callers invalidate
// by importing `revalidateTag` from 'next/cache' and passing the same tag.
//
// Notes:
//   - `unstable_cache` is in-process on a single-instance deploy (Render free
//     tier) — sufficient at 5K MAU. When scaling to >1 instance, switch the
//     tag invalidations to a Redis Pub/Sub broadcast, or migrate to Upstash KV.
//   - Tags MUST be passed as an array (Next requires it). Results are JSON-
//     serializable — do not cache anything with function/class members.
//
// Default TTL is 1 hour — generous for admin-managed config tables that
// change very rarely. Invalidate explicitly via `revalidateTag('categories')`
// (or whichever tag) from the admin POST routes that mutate them.

export function cachedFetch(keyParts, fetcher, { tags = [], ttlSeconds = 3600 } = {}) {
    // `unstable_cache` requires a stable string key. Build one from parts;
    // any non-string parts are JSON-serialized so objects work as cache keys.
    const key = Array.isArray(keyParts)
        ? keyParts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('::')
        : String(keyParts);

    return unstable_cache(fetcher, [key, ...tags], {
        tags,
        revalidate: ttlSeconds,
    });
}

// Convenience: invoke a `cachedFetch`-wrapped fn and return its result.
// Wrapping-and-calling in one go keeps call sites terse.
export async function withCache(keyParts, fetcher, opts) {
    const fn = cachedFetch(keyParts, fetcher, opts);
    return fn();
}

// Standard browser + edge Cache-Control for read-only admin config.
// `s-maxage=300` lets a CDN cache for 5 min; `max-age=60` lets the browser
// cache for 1 min; `stale-while-revalidate=600` serves stale for up to 10 min
// while fetching fresh in the background.
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

// Fixed JSON response with the standard public Cache-Control header.
import { NextResponse } from 'next/server';
export function cachedJson(data, status = 200, extraHeaders = {}) {
    const res = NextResponse.json(data, { status, headers: extraHeaders });
    res.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    return res;
}
