import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { KIGALI_HUB } from "@/lib/deliveryEta";
import { routeMatrixKm, fullRouteKm } from "@/lib/distanceProvider";
import { orderStopsByDistance } from "@/lib/batchOrdering";
import { computeRouteShares, splitByRatio } from "@/lib/deliveryPricing";
import { orderChargeableKg } from "@/lib/poolBatching"; // shared with the auto-batcher
import { getExternalDeliveryConfig, getWeightRanges } from "@/lib/externalDelivery";

// GET ?date=YYYY-MM-DD — all corridors running that day, with stops + assigned rider.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date");
        const dayStart = dateParam ? new Date(dateParam) : new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const corridors = await prisma.deliveryCorridor.findMany({
            where: { runDate: { gte: dayStart, lte: dayEnd } },
            orderBy: { name: "asc" },
            include: {
                assignedRider: { select: { id: true, name: true, riderProfile: { select: { phone: true, vehicleType: true } } } },
                orders: {
                    orderBy: { stopSequence: "asc" },
                    include: { address: true, store: { select: { name: true } } },
                },
            },
        });

        const result = corridors.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            runDate: c.runDate,
            dispatchedAt: c.dispatchedAt,
            completedAt: c.completedAt,
            riderLat: c.riderLat,
            riderLng: c.riderLng,
            riderLocationAt: c.riderLocationAt,
            rider: c.assignedRider
                ? { id: c.assignedRider.id, name: c.assignedRider.name, phone: c.assignedRider.riderProfile?.phone ?? null }
                : null,
            stops: c.orders.map((o) => ({
                orderId: o.id,
                stopSequence: o.stopSequence,
                deliveryStatus: o.deliveryStatus,
                intakeMethod: o.intakeMethod,
                storeName: o.store?.name ?? null,
                isExternalDelivery: o.isExternalDelivery,
                recipientName: o.address?.name ?? null,
                recipientPhone: o.address?.phone ?? null,
                sector: o.address?.sector ?? null,
                landmarkAddress: o.landmarkAddress ?? null,
                lat: o.recipientLat ?? o.address?.latitude ?? null,
                lng: o.recipientLng ?? o.address?.longitude ?? null,
                deliveryFeeShare: o.deliveryFeeShare,
                receivedById: o.receivedById ?? null,
                receivedByName: o.receivedByName ?? null,
            })),
        }));

        return NextResponse.json({ corridors: result });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// Parse a date input that may be date-only ("YYYY-MM-DD") or a full ISO string.
// Date-only values are pinned to local noon so they land squarely inside the
// dispatch board's day window regardless of timezone.
function parseRunDate(value) {
    if (!value) return null;
    const str = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T12:00:00`) : new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
}

// POST { name, runDate, baseRouteCost?, riderId?, orderIds? }
// Schedule a delivery route (corridor) for a chosen date, optionally pre-assigning
// a rider and loading specific un-corridored pooled orders onto it. Stops are
// ordered by a greedy nearest-neighbour route from the hub, then priced with the
// distance × weight formula and split by each stop's (chargeableKg × distance) —
// identical to the auto-batcher. An explicit baseRouteCost overrides the formula
// total (still split by the same ratio).
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const body = await request.json();
        const name = (body?.name || "").trim();
        const runDate = parseRunDate(body?.runDate);
        const riderId = body?.riderId || null;
        const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.filter(Boolean) : [];
        // Optional explicit route cost. When omitted, the distance × weight formula
        // prices the route; when set, staff override the total and we just split it.
        const costOverride = Number.isFinite(body?.baseRouteCost) && body.baseRouteCost > 0
            ? Math.round(body.baseRouteCost)
            : null;

        if (!name) return NextResponse.json({ error: "Route name is required" }, { status: 400 });
        if (!runDate) return NextResponse.json({ error: "A valid run date is required" }, { status: 400 });

        // Validate the rider (if pre-assigning).
        if (riderId) {
            const rider = await prisma.user.findUnique({ where: { id: riderId }, select: { role: true } });
            if (!rider || rider.role !== "RIDER") {
                return NextResponse.json({ error: "Selected user is not a rider" }, { status: 400 });
            }
        }

        // Pull and validate the orders being loaded onto the route. Only pooled
        // orders not already on another corridor are eligible.
        let orders = [];
        if (orderIds.length) {
            orders = await prisma.order.findMany({
                where: {
                    id: { in: orderIds },
                    deliveryType: "KIGALI_POOL",
                    corridorId: null,
                    deliveryStatus: { in: ["PENDING_INTAKE", "SORTING"] },
                    // External (off-platform) deliveries are prepaid — never route an unpaid one.
                    OR: [{ isExternalDelivery: false }, { isPaid: true }],
                },
                include: {
                    address: true,
                    orderItems: { include: { product: { select: { weightKg: true, lengthCm: true, widthCm: true, heightCm: true } } } },
                },
            });
            if (orders.length !== orderIds.length) {
                return NextResponse.json(
                    { error: "Some selected orders are no longer available to schedule" },
                    { status: 409 }
                );
            }
        }

        // Price the route with the distance × weight formula (unless staff set an
        // explicit cost), then split it across stops by (chargeableKg × distance).
        const config = await getExternalDeliveryConfig();
        const volumetricFactor = config.volumetricFactor ?? 200;
        const weightRanges = await getWeightRanges();

        let ordered = [];
        let shares = [];
        let routePrice = costOverride ?? Math.round(config.minimumFloor ?? 2000);

        if (orders.length) {
            const points = orders.map((o) => ({
                ...o,
                lat: o.recipientLat ?? o.address?.latitude ?? null,
                lng: o.recipientLng ?? o.address?.longitude ?? null,
                chargeableKg: orderChargeableKg(o, volumetricFactor),
            }));
            // Nearest-first: stops sorted by ascending hub→drop road distance
            // (persisted per order below so batch listings never recompute it).
            const dropKm = await routeMatrixKm(KIGALI_HUB, points.map((p) => ({ lat: p.lat, lng: p.lng })));
            ordered = orderStopsByDistance(points, dropKm);
            const dropDistances = ordered.map((s) => s.deliveryDistanceKm);
            const distOpts = dropDistances.every((d) => d != null)
                ? { dropDistances, routeKm: await fullRouteKm(ordered, KIGALI_HUB) }
                : {};
            const res = computeRouteShares(ordered, config, weightRanges, KIGALI_HUB, distOpts);
            if (costOverride != null) {
                routePrice = costOverride;
                shares = splitByRatio(routePrice, res.loads.some((l) => l > 0) ? res.loads : ordered.map(() => 1));
            } else {
                routePrice = res.routePrice;
                shares = res.shares;
            }
        }

        // A route loaded with stops is dispatch-ready (CLOSED); an empty placeholder
        // route stays OPEN until orders are added into it.
        const corridor = await prisma.deliveryCorridor.create({
            data: {
                name,
                runDate,
                baseRouteCost: routePrice,
                status: orders.length ? "CLOSED" : "OPEN",
                assignedRiderId: riderId,
            },
        });

        // Attach each ordered stop with its computed fee share.
        for (let i = 0; i < ordered.length; i++) {
            const feeShare = shares[i] ?? Math.round(routePrice / ordered.length);
            await prisma.order.update({
                where: { id: ordered[i].id },
                data: {
                    corridorId: corridor.id,
                    deliveryStatus: "SORTING",
                    deliveryFeeShare: feeShare,
                    stopSequence: i + 1,
                    deliveryDistanceKm: ordered[i].deliveryDistanceKm ?? null,
                },
            });
        }

        const rooms = ["logistics-room", `corridor-${corridor.id}`];
        if (riderId) rooms.push(`rider-${riderId}`);
        emitDelivery(rooms, "corridor-update", { corridorId: corridor.id, scheduled: true });

        return NextResponse.json({
            success: true,
            corridor: { id: corridor.id, name: corridor.name, runDate: corridor.runDate, status: corridor.status },
            stops: orders.length,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
