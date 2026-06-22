import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { Buffer } from "buffer";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import imageKit, { toFile } from "@/configs/imageKit";
import { triggerSplitPayout } from "@/lib/pooledDeliveryPayout";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { notifyDeliveryEvent } from "@/lib/deliveryNotifications";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST (multipart: orderId, photoFile) — confirm a delivery with a proof photo
// when the recipient can't provide the OTP. Same settlement as /verify-otp, but
// proof is a captured image instead of the 4-digit code.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const formData = await request.formData();
        const orderId = formData.get("orderId");
        const photoFile = formData.get("photoFile");

        if (!orderId || !photoFile) {
            return NextResponse.json({ error: "Order ID and a delivery photo are required" }, { status: 400 });
        }
        if (photoFile.size > MAX_SIZE) {
            return NextResponse.json({ error: "Photo too large. Maximum size is 10 MB." }, { status: 400 });
        }
        if (!ALLOWED_TYPES.includes(photoFile.type)) {
            return NextResponse.json({ error: "Invalid file type. Please upload a photo (JPEG, PNG, WebP)." }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: String(orderId) },
            include: {
                corridor: { select: { id: true, assignedRiderId: true } },
                address: { select: { email: true, phone: true } },
            },
        });

        if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        if (order.deliveryType !== "KIGALI_POOL") {
            return NextResponse.json({ error: "This order does not use Kigali Pooled Delivery" }, { status: 400 });
        }

        // Only the rider assigned to this order's corridor (or an admin) may confirm.
        const isAssignedRider = order.corridor?.assignedRiderId === userId;
        if (!isAssignedRider && !(await authAdmin(userId))) {
            return NextResponse.json({ error: "Only the assigned rider can confirm this delivery" }, { status: 403 });
        }
        if (order.deliveryStatus === "DELIVERED") {
            return NextResponse.json({ error: "This order has already been delivered" }, { status: 409 });
        }

        // Upload the proof photo to ImageKit before flipping the order.
        const buffer = Buffer.from(await photoFile.arrayBuffer());
        const uploadResponse = await imageKit.files.upload({
            file: await toFile(buffer, `pod-${order.id}.jpg`),
            fileName: `pod-${order.id}.jpg`,
            folder: "pod-photos",
        });

        // Mark delivered, settle escrow, store the proof. External (off-platform)
        // deliveries hold no goods escrow — it stays NOT_HELD.
        const escrowVal = order.isExternalDelivery ? "NOT_HELD" : "RELEASED";
        const updated = await prisma.order.updateMany({
            where: { id: order.id, deliveryStatus: { not: "DELIVERED" } },
            data: {
                status: "DELIVERED",
                deliveryStatus: "DELIVERED",
                escrowStatus: escrowVal,
                deliveredAt: new Date(),
                podPhotoUrl: uploadResponse.url,
                otpAttempts: 0,
                otpLockedUntil: null,
            },
        });
        // Lost a race with a concurrent confirmation — treat as already done.
        if (updated.count === 0) {
            return NextResponse.json({ error: "This order has already been delivered" }, { status: 409 });
        }

        // Trigger settlement (mock MoMo disbursements + vendor Payout row).
        const payout = await triggerSplitPayout(order);

        // Notify the customer's tracking page + logistics board in realtime.
        emitDelivery(
            [`track-${order.id}`, order.corridor?.id ? `corridor-${order.corridor.id}` : null, "logistics-room"],
            "delivery-status-update",
            { orderId: order.id, deliveryStatus: "DELIVERED", escrowStatus: escrowVal, at: new Date().toISOString() }
        );

        // Email the customer that the package was delivered (best-effort).
        await notifyDeliveryEvent(order, "DELIVERED");

        return NextResponse.json({
            success: true,
            message: "Delivery confirmed with photo proof.",
            podPhotoUrl: uploadResponse.url,
            payout,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
