import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { estimateEtaForStop, fetchOsrmRoute, haversineKm, KIGALI_HUB } from "@/lib/deliveryEta";

// Long-polling support: a "?wait=1" client (typically the public recipient
// tracking page when Socket.IO is unavailable, e.g. on a serverless / cold
// Render instance) holds this request open for up to LONG_POLL_TIMEOUT_MS.
// The server probes the corridor's rider position + the order's delivery
// status every POLL_INTERVAL_MS and returns the moment either changes, or
// immediately on terminal status. Empty-changes, after timeout, we return
// the current state — so the client always gets a payload to render and can
// immediately re-open a new long-poll.
const POLL_INTERVAL_MS = 2000;
const LONG_POLL_TIMEOUT_MS = 25_000;

// Cheap change-probe — only reads the two columns the live tracking UI
// depends on, on the Order + its corridor. Returns a snapshot fingerprint.
async function probe(orderId) {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            deliveryStatus: true,
            deliveredAt: true,
            failureReason: true,
            escrowStatus: true,
            corridor: { select: { id: true, riderLat: true, riderLng: true, riderLocationAt: true, status: true } },
        },
    });
    if (!order) return null;
    return {
        deliveryStatus: order.deliveryStatus,
        deliveredAt: order.deliveredAt?.toISOString() ?? null,
        failureReason: order.failureReason ?? null,
        escrowStatus: order.escrowStatus,
        corridorId: order.corridorId,
        corridorStatus: order.corridor?.status ?? null,
        riderLat: order.corridor?.riderLat ?? null,
        riderLng: order.corridor?.riderLng ?? null,
        riderLocationAt: order.corridor?.riderLocationAt?.toISOString() ?? null,
    };
}

// Deterministic fingerprint of the probe — used to decide "did anything change?"
function fingerprint(s) {
    if (!s) return '';
    return `${s.deliveryStatus}|${s.deliveredAt}|${s.corridorStatus}|${s.riderLat}|${s.riderLng}|${s.riderLocationAt}|${s.escrowStatus}|${s.failureReason}`;
}

const TERMINAL_STATUSES = new Set(['DELIVERED', 'FAILED']);

async function longPollForChange(orderId, sinceFingerprint) {
    const deadline = Date.now() + LONG_POLL_TIMEOUT_MS;
    let current = await probe(orderId);
    let currentFp = fingerprint(current);
    if (currentFp !== sinceFingerprint || !current) return current;

    while (Date.now() < deadline && current && !TERMINAL_STATUSES.has(current.deliveryStatus)) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const next = await probe(orderId);
        const nextFp = fingerprint(next);
        if (nextFp !== currentFp) return next;
        current = next;
    }
    return current;
}

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        const { searchParams } = new URL(request.url);
        const token = searchParams.get("t");
        const wantsLongPoll = searchParams.get("wait") === "1" || searchParams.get("wait") === "true";
        const sinceFingerprint = wantsLongPoll ? (searchParams.get("since") || '') : '';

        const { orderId } = await params;

        if (!orderId) {
            return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }

        // Long-poll loop — observe + short-circuit on change before doing the
        // expensive Order + corridor + OSRM fetch. Skip the loop entirely when
        // long-polling isn't requested (regular clients get the immediate full
        // response they always have).
        if (wantsLongPoll) {
            const snap = await longPollForChange(orderId, sinceFingerprint);
            if (!snap) {
                return NextResponse.json({ error: "Order not found" }, { status: 404 });
            }
            // If still unchanged at timeout or just-after, return the lightweight
            // probe snapshot only — saves the OSRM roundtrip when nothing moved.
            // Callers wanting the full ETA/route payload should request `wait=0`.
            return NextResponse.json({
                longPoll: true,
                changed: fingerprint(snap) !== sinceFingerprint,
                snapshot: snap,
            }, {
                headers: { 'Cache-Control': 'no-store' }
            });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                address: true,
                store: { select: { name: true, logo: true } },
                user: { select: { name: true } },
                corridor: {
                    include: {
                        assignedRider: { select: { name: true, riderProfile: { select: { phone: true, vehicleType: true } } } },
                        orders: { select: { id: true, stopSequence: true, recipientLat: true, recipientLng: true, address: { select: { latitude: true, longitude: true } } } },
                    },
                },
            },
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const hasValidToken = !!token && !!order.trackingToken && token === order.trackingToken;
        if (!hasValidToken) {
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            if (order.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (!['KIGALI_POOL', 'EXPRESS'].includes(order.deliveryType)) {
            return NextResponse.json({ error: "This order does not use rider delivery" }, { status: 400 });
        }

        const corridor = order.corridor;
        const riderPos = corridor?.riderLat != null && corridor?.riderLng != null
            ? { lat: corridor.riderLat, lng: corridor.riderLng }
            : null;

        const recipientLat = order.recipientLat ?? order.address?.latitude ?? null;
        const recipientLng = order.recipientLng ?? order.address?.longitude ?? null;

        const hubDistanceKm = (recipientLat != null && recipientLng != null)
            ? haversineKm(KIGALI_HUB, { lat: recipientLat, lng: recipientLng })
            : null;

        let etaMinutes = null;
        let routeGeometry = null;
        if (riderPos && corridor && ["IN_TRANSIT", "ARRIVING"].includes(order.deliveryStatus)) {
            const stops = corridor.orders.map((o) => ({
                stopSequence: o.stopSequence,
                lat: o.recipientLat ?? o.address?.latitude ?? null,
                lng: o.recipientLng ?? o.address?.longitude ?? null,
            }));
            etaMinutes = estimateEtaForStop(riderPos, stops, order.stopSequence ?? 0);

            const legStops = stops
                .filter((s) => s.lat != null && s.lng != null && s.stopSequence != null && s.stopSequence <= (order.stopSequence ?? 0))
                .sort((a, b) => a.stopSequence - b.stopSequence)
                .map((s) => ({ lat: s.lat, lng: s.lng }));
            if (legStops.length) {
                const osrm = await fetchOsrmRoute([riderPos, ...legStops]);
                if (osrm) {
                    etaMinutes = osrm.durationMin;
                    routeGeometry = osrm.geometry;
                }
            }
        }

        return NextResponse.json({
            orderId: order.id,
            deliveryStatus: order.deliveryStatus,
            escrowStatus: order.escrowStatus,
            intakeMethod: order.intakeMethod,
            landmarkAddress: order.landmarkAddress,
            deliveryOtp: order.deliveryOtp,
            deliveryFeeShare: order.deliveryFeeShare,
            corridorId: order.corridorId,
            corridorStatus: corridor?.status ?? null,
            stopSequence: order.stopSequence,
            failureReason: order.failureReason,
            deliveredAt: order.deliveredAt,
            podPhotoUrl: order.podPhotoUrl,
            riderLat: corridor?.riderLat ?? null,
            riderLng: corridor?.riderLng ?? null,
            riderLocationAt: corridor?.riderLocationAt ?? null,
            recipientLat,
            recipientLng,
            hubDistanceKm,
            etaMinutes,
            routeGeometry,
            rider: corridor?.assignedRider
                ? {
                    name: corridor.assignedRider.name,
                    phone: corridor.assignedRider.riderProfile?.phone ?? null,
                    vehicleType: corridor.assignedRider.riderProfile?.vehicleType ?? null,
                }
                : null,
            store: order.store,
            isExternalDelivery: order.isExternalDelivery,
            packageDescription: order.packageDescription,
            senderName: order.isExternalDelivery ? (order.user?.name ?? null) : null,
            // External bookings: the fee is priced from the recipient's shared
            // location, so the track page can prompt for it and show the result.
            deliveryFee: order.isExternalDelivery ? order.total : null,
            isPaid: order.isPaid,
            locationSharedAt: order.locationSharedAt,
            address: {
                name: order.address?.name,
                street: order.address?.street,
                sector: order.address?.sector,
                city: order.address?.city,
            },
            createdAt: order.createdAt,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
