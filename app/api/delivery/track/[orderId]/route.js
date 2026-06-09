import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { estimateEtaForStop } from "@/lib/deliveryEta";

export async function GET(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId } = await params;

        if (!orderId) {
            return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                address: true,
                store: { select: { name: true, logo: true } },
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

        // Only the customer who placed the order can see the OTP
        if (order.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (order.deliveryType !== 'KIGALI_POOL') {
            return NextResponse.json({ error: "This order does not use Kigali Pooled Delivery" }, { status: 400 });
        }

        const corridor = order.corridor;
        const riderPos = corridor?.riderLat != null && corridor?.riderLng != null
            ? { lat: corridor.riderLat, lng: corridor.riderLng }
            : null;

        // Customer location (pinned/live preferred, saved address as fallback)
        const recipientLat = order.recipientLat ?? order.address?.latitude ?? null;
        const recipientLng = order.recipientLng ?? order.address?.longitude ?? null;

        // ETA: only meaningful once the rider is moving (IN_TRANSIT/ARRIVING) and we have a position.
        let etaMinutes = null;
        if (riderPos && corridor && ["IN_TRANSIT", "ARRIVING"].includes(order.deliveryStatus)) {
            const stops = corridor.orders.map((o) => ({
                stopSequence: o.stopSequence,
                lat: o.recipientLat ?? o.address?.latitude ?? null,
                lng: o.recipientLng ?? o.address?.longitude ?? null,
            }));
            etaMinutes = estimateEtaForStop(riderPos, stops, order.stopSequence ?? 0);
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
            // Realtime tracking fields
            riderLat: corridor?.riderLat ?? null,
            riderLng: corridor?.riderLng ?? null,
            riderLocationAt: corridor?.riderLocationAt ?? null,
            recipientLat,
            recipientLng,
            etaMinutes,
            rider: corridor?.assignedRider
                ? {
                    name: corridor.assignedRider.name,
                    phone: corridor.assignedRider.riderProfile?.phone ?? null,
                    vehicleType: corridor.assignedRider.riderProfile?.vehicleType ?? null,
                }
                : null,
            store: order.store,
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
