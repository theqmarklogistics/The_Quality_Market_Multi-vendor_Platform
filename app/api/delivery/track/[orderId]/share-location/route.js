import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { quoteExternalDeliveryFee } from "@/lib/externalDelivery";
import { geocodeRwAddress } from "@/lib/geocode";

// POST { lat, lng } — the customer opts in to share their live location so the rider
// can find them. Persists on the order (not the saved address) and pushes the pin to
// the rider/corridor + logistics rooms.
// POST { useAddress: true } — second option: the customer asks us to derive the drop
// point from the geographic location of the address recorded with the booking
// (district → sector → cell/village, geocoded server-side).
//
// For external (delivery-only) bookings the client's shared coordinates are the
// authoritative drop point: while payment is still pending, the delivery fee is
// re-priced from them (origin = recorded pickup point when present, else the hub).
export async function POST(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const { searchParams } = new URL(request.url);
        const token = searchParams.get("t");

        const { orderId } = await params;
        if (!orderId) return NextResponse.json({ error: "Missing order ID" }, { status: 400 });

        const body = await request.json();
        let { lat, lng } = body;
        const useAddress = body?.useAddress === true;
        if (!useAddress && (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng))) {
            return NextResponse.json({ error: "lat and lng (numbers) are required" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                userId: true, deliveryType: true, corridorId: true, trackingToken: true,
                isExternalDelivery: true, isPaid: true, paymentStatus: true,
                paymentProofStatus: true, deliveryStatus: true,
                total: true, creditApplied: true, addressId: true,
                pickupLat: true, pickupLng: true,
                packageWeightKg: true, packageLengthCm: true, packageWidthCm: true, packageHeightCm: true,
                address: { select: { sector: true, district: true, cell: true, village: true, state: true } },
            },
        });
        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        // Access: logged-in owner, or anyone holding the public tracking token.
        const hasValidToken = !!token && !!order.trackingToken && token === order.trackingToken;
        if (!hasValidToken) {
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            if (order.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (order.deliveryType !== "KIGALI_POOL") {
            return NextResponse.json({ error: "Not a pooled-delivery order" }, { status: 400 });
        }

        if (useAddress) {
            if (!order.address?.sector || !order.address?.district) {
                return NextResponse.json(
                    { error: "No recorded address to locate — share your location instead" },
                    { status: 400 }
                );
            }
            const geo = await geocodeRwAddress({
                village: order.address.village || order.address.cell,
                sector: order.address.sector,
                district: order.address.district,
                province: order.address.state,
            });
            if (!geo) {
                return NextResponse.json(
                    { error: "Could not locate the recorded address — share your location instead" },
                    { status: 400 }
                );
            }
            lat = geo.lat;
            lng = geo.lng;
        }

        const now = new Date();
        await prisma.order.update({
            where: { id: orderId },
            data: { recipientLat: lat, recipientLng: lng, locationSharedAt: now },
        });

        // ── External booking, payment still open → re-price from the client's pin ─
        let updatedFee = null;
        const repriceable =
            order.isExternalDelivery &&
            !order.isPaid &&
            order.deliveryStatus === "PENDING_INTAKE" &&
            ["NOT_SUBMITTED", "REJECTED"].includes(order.paymentProofStatus) &&
            !["EXPIRED", "CANCELLED"].includes(order.paymentStatus);
        if (repriceable) {
            const quote = await quoteExternalDeliveryFee({
                sector: order.address?.sector || "",
                weightKg: order.packageWeightKg ?? undefined,
                lengthCm: order.packageLengthCm ?? undefined,
                widthCm: order.packageWidthCm ?? undefined,
                heightCm: order.packageHeightCm ?? undefined,
                dropLat: lat,
                dropLng: lng,
                originLat: order.pickupLat ?? undefined,
                originLng: order.pickupLng ?? undefined,
            });
            // A needs-review re-price returns fee null (weight out of range) — the
            // finite check below skips it, leaving the existing fee + flag untouched.
            const newFee = quote.fee;
            if (Number.isFinite(newFee) && newFee > 0 && newFee !== order.total) {
                const oldCredit = Number(order.creditApplied ?? 0);
                // Fee dropped below the redeemed credit → return the surplus.
                const newCredit = Math.min(oldCredit, newFee);
                const refund = Math.max(0, parseFloat((oldCredit - newCredit).toFixed(2)));
                const amountDue = Math.max(0, parseFloat((newFee - newCredit).toFixed(2)));
                const fullyCovered = newCredit > 0 && amountDue <= 0;

                await prisma.order.update({
                    where: { id: orderId },
                    data: {
                        total: newFee,
                        creditApplied: newCredit,
                        ...(fullyCovered && {
                            isPaid: true,
                            paymentStatus: "PAID",
                            paymentProofStatus: "APPROVED",
                            paymentExpiresAt: null,
                        }),
                    },
                });
                if (refund > 0) {
                    await prisma.user.update({
                        where: { id: order.userId },
                        data: { deliveryCreditBalance: { increment: refund } },
                    });
                }
                prisma.event
                    .create({ data: { name: "delivery.fee_repriced", userId: order.userId, payload: { orderId, oldFee: order.total, newFee, basis: quote.basis, distanceKm: quote.distanceKm } } })
                    .catch((e) => console.error("Event write error:", e.message));
                updatedFee = newFee;
            }
        }

        // External bookings create a booking-specific Address row — keep its geo in
        // sync with the client's shared point so batching/routing match pricing.
        // (Platform orders keep live location on the order only, never the saved address.)
        if (order.isExternalDelivery && order.addressId) {
            prisma.address
                .update({ where: { id: order.addressId }, data: { latitude: lat, longitude: lng } })
                .catch((e) => console.error("Address geo sync error:", e.message));
        }

        emitDelivery(
            [order.corridorId ? `corridor-${order.corridorId}` : null, "logistics-room"],
            "customer-location-update",
            { orderId, lat, lng, at: now.toISOString() }
        );

        return NextResponse.json({ success: true, at: now.toISOString(), ...(updatedFee != null && { fee: updatedFee }) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
