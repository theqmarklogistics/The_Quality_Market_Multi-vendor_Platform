import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { KIGALI_HUB, nearestNeighborRoute, proportionalFeeShares } from "@/lib/deliveryEta";

const BASE_ROUTE_COST = 10000; // 10,000 RWF per corridor route

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

/**
 * Batch all un-corridored Kigali pooled orders into per-sector route corridors.
 *
 * Unlike a naive "today only" sweep, this picks up EVERY pooled order that has
 * been sorted but not yet placed on a corridor (`corridorId IS NULL`), so an
 * order missed by an earlier run is never orphaned. Stops within each corridor
 * are ordered by a greedy nearest-neighbour route from the hub, and the fixed
 * route cost is split by each stop's cumulative distance (closest pays least).
 *
 * @returns {Promise<{batched:number, corridors:number}>}
 */
export async function runPoolBatching() {
    const orders = await prisma.order.findMany({
        where: {
            deliveryType: "KIGALI_POOL",
            deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] },
            corridorId: null,
        },
        include: { address: true },
    });

    if (!orders.length) return { batched: 0, corridors: 0 };

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

    for (const [sector, groupOrders] of groups.entries()) {
        const corridorId = "cor_" + randomBytes(8).toString("hex");

        // Optimise the visiting order from the hub, then cost it by real geometry.
        const points = groupOrders.map((o) => ({ ...o, ...stopCoords(o) }));
        const ordered = nearestNeighborRoute(KIGALI_HUB, points);
        const shares = proportionalFeeShares(KIGALI_HUB, ordered, BASE_ROUTE_COST);

        await prisma.$executeRaw`
            INSERT INTO "DeliveryCorridor" (id, name, "runDate", "baseRouteCost", status, "createdAt", "updatedAt")
            VALUES (
                ${corridorId},
                ${`Hub → ${sector} (${dateLabel})`},
                ${runDate},
                ${BASE_ROUTE_COST},
                'CLOSED'::"CorridorStatus",
                NOW(),
                NOW()
            )
        `;

        for (let i = 0; i < ordered.length; i++) {
            const order = ordered[i];
            const stopIndex = i + 1;
            const feeShare = shares[i] ?? parseFloat((BASE_ROUTE_COST / ordered.length).toFixed(2));
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

    return { batched, corridors: groups.size };
}
