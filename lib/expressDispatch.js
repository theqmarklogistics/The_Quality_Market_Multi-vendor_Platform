import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { KIGALI_HUB } from "@/lib/deliveryEta";
import { routeDistanceKm } from "@/lib/distanceProvider";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { getSocketServer } from "@/lib/socketServer";

// Kigali-local calendar date (YYYY-MM-DD) for run naming, independent of server TZ.
function kigaliDateLabel(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Kigali",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

/**
 * Instant dispatch for an EXPRESS order: the moment it's booked (shop orders)
 * or paid (external bookings), a single-stop EXPRESS run is created on the
 * dispatch board and logistics staff are notified in real time — no waiting for
 * the pooled batching schedule. Staff assign the nearest free rider from the
 * board exactly like a corridor run, so the whole rider/tracking/OTP pipeline
 * works unchanged.
 *
 * Idempotent: an order already on a run (corridorId set), a non-EXPRESS order,
 * or an unpaid external booking is skipped. Never throws — dispatch is a
 * side-effect that must not fail the booking/payment call that triggered it.
 *
 * @returns {Promise<{corridorId:string}|null>} the created run, or null when skipped
 */
export async function dispatchExpressOrder(orderId) {
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { address: { select: { sector: true, district: true, latitude: true, longitude: true } } },
        });
        if (!order || order.deliveryType !== "EXPRESS") return null;
        if (order.corridorId) return null; // already dispatched
        // External bookings are prepaid — never dispatch an unpaid one.
        if (order.isExternalDelivery && !order.isPaid) return null;

        // Distance origin: recorded pickup point wins over the hub (mirrors pricing).
        const origin = (order.pickupLat != null && order.pickupLng != null)
            ? { lat: order.pickupLat, lng: order.pickupLng }
            : KIGALI_HUB;
        const dropLat = order.recipientLat ?? order.address?.latitude ?? null;
        const dropLng = order.recipientLng ?? order.address?.longitude ?? null;
        let distanceKm = order.deliveryDistanceKm ?? null;
        if (distanceKm == null && dropLat != null && dropLng != null) {
            // A distance failure must not block the dispatch itself.
            try { distanceKm = await routeDistanceKm(origin, { lat: dropLat, lng: dropLng }); } catch (_) { distanceKm = null; }
        }

        // The single drop carries the whole run: its fee share IS the run cost.
        // Shop orders carry the fee in shippingCost; delivery-only bookings in total.
        const fee = order.isExternalDelivery
            ? Number(order.total ?? 0)
            : Number(order.shippingCost ?? 0);

        const area = order.address?.sector || order.address?.district || "Kigali";
        const corridorId = "cor_" + randomBytes(8).toString("hex");
        const now = new Date();

        await prisma.deliveryCorridor.create({
            data: {
                id: corridorId,
                name: `EXPRESS · ${area} · #${order.id.slice(-6)} (${kigaliDateLabel(now)})`,
                runDate: now,
                baseRouteCost: Math.max(0, Math.round(fee)),
                status: "CLOSED", // dispatch-ready: needs a rider now
            },
        });
        await prisma.order.update({
            where: { id: order.id },
            data: {
                corridorId,
                stopSequence: 1,
                deliveryFeeShare: fee,
                ...(distanceKm != null && { deliveryDistanceKm: parseFloat(Number(distanceKm).toFixed(2)) }),
            },
        });

        // Real-time nudge: the dispatch board refreshes and admins get a banner.
        emitDelivery(["logistics-room"], "corridor-update", { corridorId, express: true, orderId: order.id });
        try {
            const io = getSocketServer();
            io.to("admin-room").emit("admin-notification", {
                key: "expressDelivery",
                message: `EXPRESS delivery #${order.id.slice(-6)} needs a rider now (${area})`,
            });
        } catch (_) { /* socket optional */ }

        return { corridorId };
    } catch (error) {
        console.error("Express dispatch failed for", orderId, error);
        return null;
    }
}
