import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { KIGALI_HUB, nearestNeighborRoute, resolveRouteDistances } from "@/lib/deliveryEta";
import { computeRouteShares, chargeableWeightKg, volumetricWeightKg } from "@/lib/deliveryPricing";
import { getExternalDeliveryConfig } from "@/lib/externalDelivery";

// Max stops a single rider/corridor handles. A sector with more orders is split
// into several routes. Overridable via env; defaults to 5.
const MAX_STOPS_PER_CORRIDOR = Math.max(1, parseInt(process.env.MAX_STOPS_PER_CORRIDOR || "5", 10) || 5);

// Split an array into consecutive chunks of at most `size`.
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Kigali-local calendar date (YYYY-MM-DD) for corridor naming, independent of server TZ.
function kigaliDateLabel(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Kigali",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

const stopCoords = (order) => ({
    lat: order.recipientLat ?? order.address?.latitude ?? null,
    lng: order.recipientLng ?? order.address?.longitude ?? null,
});

// Chargeable weight for an order: external bookings carry their own package weight
// + dims; platform orders sum it from their products (max of actual vs volumetric).
// Exported so other corridor builders (manual scheduling) price consistently.
export function orderChargeableKg(order, volumetricFactor) {
    if (order.isExternalDelivery) {
        return chargeableWeightKg(
            order.packageWeightKg, order.packageLengthCm, order.packageWidthCm, order.packageHeightCm, volumetricFactor
        );
    }
    let actual = 0;
    let vol = 0;
    for (const item of order.orderItems || []) {
        const p = item.product;
        const qty = item.quantity || 1;
        actual += (p?.weightKg || 0) * qty;
        vol += volumetricWeightKg(p?.lengthCm, p?.widthCm, p?.heightCm, volumetricFactor) * qty;
    }
    return Math.max(actual, vol);
}

/**
 * Batch all un-corridored Kigali pooled orders into per-sector route corridors.
 *
 * Unlike a naive "today only" sweep, this picks up EVERY pooled order that has
 * been sorted but not yet placed on a corridor (`corridorId IS NULL`), so an
 * order missed by an earlier run is never orphaned. Stops within each corridor
 * are ordered by a greedy nearest-neighbour route from the hub, then the corridor
 * is priced by the distance × weight formula and split across drops by each
 * drop's (chargeableKg × distance) load (see lib/deliveryPricing.js).
 *
 * A sector with more than MAX_STOPS_PER_CORRIDOR orders is split across several
 * corridors so no single rider is handed an oversized route.
 *
 * @returns {Promise<{batched:number, corridors:number}>}
 */
export async function runPoolBatching() {
    const orders = await prisma.order.findMany({
        where: {
            deliveryType: "KIGALI_POOL",
            deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] },
            corridorId: null,
            // External (off-platform) deliveries are prepaid — never route an unpaid one.
            OR: [{ isExternalDelivery: false }, { isPaid: true }],
        },
        include: {
            address: true,
            orderItems: { include: { product: { select: { weightKg: true, lengthCm: true, widthCm: true, heightCm: true } } } },
        },
    });

    if (!orders.length) return { batched: 0, corridors: 0 };

    // Pricing knobs (base rate, floor, tiers, volumetric factor) come from the
    // admin-tunable external-delivery config singleton.
    const config = await getExternalDeliveryConfig();
    const volumetricFactor = config.volumetricFactor ?? 200;

    // Group orders by Kigali sector (district fallback).
    const groups = new Map();
    for (const order of orders) {
        const key = order.address?.sector || order.address?.district || "Kigali";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(order);
    }

    const runDate = new Date();
    const dateLabel = kigaliDateLabel(runDate);
    let batched = 0;
    let corridorCount = 0;

    for (const [sector, groupOrders] of groups.entries()) {
        // Optimise the visiting order from the hub, then split into routes of at
        // most MAX_STOPS_PER_CORRIDOR stops (one corridor/rider each). Each stop
        // carries its coords + chargeable weight for pricing.
        const points = groupOrders.map((o) => ({
            ...o,
            ...stopCoords(o),
            chargeableKg: orderChargeableKg(o, volumetricFactor),
        }));
        const ordered = nearestNeighborRoute(KIGALI_HUB, points);
        const routes = chunk(ordered, MAX_STOPS_PER_CORRIDOR);

        for (let r = 0; r < routes.length; r++) {
            const routeStops = routes[r];
            const corridorId = "cor_" + randomBytes(8).toString("hex");
            // Price this route and split it across its drops by (kg × distance).
            // Road distances via OSRM when enabled; otherwise haversine.
            const distOpts = await resolveRouteDistances(routeStops, KIGALI_HUB);
            const { routePrice, shares } = computeRouteShares(routeStops, config, KIGALI_HUB, distOpts);
            const name = routes.length > 1
                ? `Hub → ${sector} (${dateLabel}) · Route ${r + 1}`
                : `Hub → ${sector} (${dateLabel})`;

            await prisma.$executeRaw`
                INSERT INTO "DeliveryCorridor" (id, name, "runDate", "baseRouteCost", status, "createdAt", "updatedAt")
                VALUES (
                    ${corridorId},
                    ${name},
                    ${runDate},
                    ${routePrice},
                    'CLOSED'::"CorridorStatus",
                    NOW(),
                    NOW()
                )
            `;
            corridorCount++;

            for (let i = 0; i < routeStops.length; i++) {
                const order = routeStops[i];
                const stopIndex = i + 1;
                const feeShare = shares[i] ?? Math.round(routePrice / routeStops.length);
                await prisma.$executeRaw`
                    UPDATE "Order"
                    SET "corridorId"       = ${corridorId},
                        "deliveryStatus"   = 'SORTING'::"PoolDeliveryStatus",
                        "deliveryFeeShare" = ${feeShare},
                        "stopSequence"     = ${stopIndex},
                        "updatedAt"        = NOW()
                    WHERE id = ${order.id}
                `;
                batched++;
            }
        }
    }

    return { batched, corridors: corridorCount };
}
