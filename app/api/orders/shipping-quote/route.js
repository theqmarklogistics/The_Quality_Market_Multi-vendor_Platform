import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { quotePooledCartFee, getExternalDeliveryConfig } from "@/lib/externalDelivery";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

// Quotes fire on every address/pin/delivery-type change at checkout — generous
// but bounded, mirroring the other public-ish read endpoints.
const quoteLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

// POST { addressId, items: [{ id, quantity }], deliveryType?, lat?, lng? }
// Checkout-time shipping quote for the whole cart, computed exactly like order
// creation (per store, then summed) so the amount shown at checkout is the
// amount charged. Every delivery type (standard + pooled) uses the segmented
// distance-taper + weight-range formula. If any store's package weight falls
// outside the configured ranges, the quote returns needsReview (no fee) so the
// customer is told the fee will be confirmed by our team.
export async function POST(request) {
    try {
        const rl = quoteLimiter(`shipping-quote:${getClientIp(request)}`);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many requests." },
                { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
            );
        }

        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const items = Array.isArray(body?.items) ? body.items.filter(i => i?.id) : [];
        const addressId = body?.addressId || null;
        // Standard delivery is disabled for now — quotes are pooled or express
        // (unknown/legacy values coerce to pooled, matching order creation).
        const deliveryType = body?.deliveryType === "EXPRESS" ? "EXPRESS" : "KIGALI_POOL";
        if (deliveryType === "EXPRESS") {
            const deliveryCfg = await getExternalDeliveryConfig();
            if (deliveryCfg.expressEnabled === false) {
                return NextResponse.json({ error: "Express delivery is currently unavailable." }, { status: 400 });
            }
        }
        const pinLat = Number.isFinite(body?.lat) ? body.lat : null;
        const pinLng = Number.isFinite(body?.lng) ? body.lng : null;

        if (!addressId || !items.length) {
            return NextResponse.json({ error: "addressId and items are required" }, { status: 400 });
        }

        const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
        if (!address) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

        const products = await prisma.product.findMany({
            where: { id: { in: items.map(i => i.id) } },
            select: { id: true, storeId: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true, importOrigin: true },
        });
        const productMap = new Map(products.map(p => [p.id, p]));

        // Group by store — each store becomes its own order (and shipping charge).
        const byStore = new Map();
        // Imported (non-local) products aren't auto-priced by the domestic formula:
        // the customer requests a shipping quote and our team follows up.
        let hasImported = false;
        for (const item of items) {
            const p = productMap.get(item.id);
            if (!p) continue;
            if (p.importOrigin) hasImported = true;
            const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
            if (!byStore.has(p.storeId)) byStore.set(p.storeId, []);
            byStore.get(p.storeId).push({
                quantity: qty,
                weightKg: p.weightKg,
                lengthCm: p.lengthCm,
                widthCm: p.widthCm,
                heightCm: p.heightCm,
                importOrigin: p.importOrigin,
            });
        }

        // Any imported item ⇒ the whole cart's shipping is quoted on request.
        if (hasImported) {
            return NextResponse.json({
                shipping: null,
                needsReview: true,
                importQuote: true,
                stores: byStore.size,
                deliveryType,
                basis: "import_quote",
            });
        }

        // Every delivery type is priced by the same formula (per store, summed).
        let shipping = 0;
        let basis = null;
        let needsReview = false;
        let volumetricKg = 0;
        let chargeableKg = 0;
        for (const storeItems of byStore.values()) {
            const quote = await quotePooledCartFee({
                items: storeItems,
                lat: pinLat ?? address.latitude ?? null,
                lng: pinLng ?? address.longitude ?? null,
                sector: address.sector || null,
                express: deliveryType === "EXPRESS",
            });
            volumetricKg += quote?.volumetricKg || 0;
            chargeableKg += quote?.greaterWeightKg || 0;
            if (quote?.needsReview) {
                needsReview = true;
                basis = "needs_review";
                continue;
            }
            shipping += quote?.fee || 0;
            if (!needsReview) basis = basis || quote?.basis || null;
        }

        return NextResponse.json({
            shipping: needsReview ? null : parseFloat(shipping.toFixed(2)),
            needsReview,
            volumetricKg: parseFloat(volumetricKg.toFixed(2)),
            chargeableKg: parseFloat(chargeableKg.toFixed(2)),
            stores: byStore.size,
            deliveryType,
            basis,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
