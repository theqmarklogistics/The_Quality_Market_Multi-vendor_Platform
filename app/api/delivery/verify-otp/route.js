import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { triggerSplitPayout } from "@/lib/pooledDeliveryPayout";
import { emitDelivery } from "@/lib/deliveryRealtime";
import { notifyDeliveryEvent } from "@/lib/deliveryNotifications";

// Brute-force throttle on the 4-digit code.
const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, inputOtp } = await request.json();

        if (!orderId || !inputOtp) {
            return NextResponse.json({ error: "orderId and inputOtp are required" }, { status: 400 });
        }

        if (!/^\d{4}$/.test(String(inputOtp))) {
            return NextResponse.json({ error: "OTP must be a 4-digit number" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                corridor: { select: { id: true, assignedRiderId: true } },
                address: { select: { email: true, phone: true } },
            },
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (!['KIGALI_POOL', 'EXPRESS'].includes(order.deliveryType)) {
            return NextResponse.json({ error: "This order does not use rider delivery" }, { status: 400 });
        }

        // Only the rider assigned to this order's corridor (or an admin) may confirm delivery.
        const isAssignedRider = order.corridor?.assignedRiderId === userId;
        if (!isAssignedRider && !(await authAdmin(userId))) {
            return NextResponse.json({ error: "Only the assigned rider can confirm this delivery" }, { status: 403 });
        }

        if (order.deliveryStatus === 'DELIVERED') {
            return NextResponse.json({ error: "This order has already been delivered" }, { status: 409 });
        }

        // Reject while locked out from too many wrong attempts.
        if (order.otpLockedUntil && new Date(order.otpLockedUntil) > new Date()) {
            const mins = Math.ceil((new Date(order.otpLockedUntil) - new Date()) / 60000);
            return NextResponse.json(
                { error: `Too many incorrect attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` },
                { status: 429 }
            );
        }

        if (String(inputOtp) !== order.deliveryOtp) {
            // Count the failed attempt and lock the code after the threshold.
            const attempts = (order.otpAttempts ?? 0) + 1;
            const lock = attempts >= MAX_OTP_ATTEMPTS;
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    otpAttempts: lock ? 0 : attempts,
                    otpLockedUntil: lock ? new Date(Date.now() + OTP_LOCK_MINUTES * 60000) : null,
                },
            });
            const remaining = MAX_OTP_ATTEMPTS - attempts;
            return NextResponse.json(
                {
                    error: lock
                        ? `Invalid OTP. Too many attempts — locked for ${OTP_LOCK_MINUTES} minutes.`
                        : `Invalid OTP. Please verify the code with the customer. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`,
                },
                { status: 401 }
            );
        }

        // Atomically mark as delivered, settle escrow, and clear OTP throttle state.
        // External (off-platform) deliveries hold no goods escrow — it stays NOT_HELD.
        const escrowVal = order.isExternalDelivery ? "NOT_HELD" : "RELEASED";
        await prisma.$executeRaw`
            UPDATE "Order"
            SET status = 'DELIVERED'::"OrderStatus",
                "deliveryStatus" = 'DELIVERED'::"PoolDeliveryStatus",
                "escrowStatus" = ${escrowVal}::"EscrowStatus",
                "deliveredAt" = NOW(),
                "otpAttempts" = 0,
                "otpLockedUntil" = NULL,
                "updatedAt" = NOW()
            WHERE id = ${orderId} AND "deliveryOtp" = ${order.deliveryOtp}
        `;

        // Trigger split payout (mock MoMo disbursements)
        const payout = await triggerSplitPayout(order);

        // Notify the customer's tracking page + logistics board in realtime.
        emitDelivery(
            [`track-${orderId}`, order.corridor?.id ? `corridor-${order.corridor.id}` : null, "logistics-room"],
            "delivery-status-update",
            { orderId, deliveryStatus: "DELIVERED", escrowStatus: escrowVal, at: new Date().toISOString() }
        );

        // Email + SMS the customer that the package was delivered (best-effort).
        await notifyDeliveryEvent(order, "DELIVERED");

        return NextResponse.json({
            success: true,
            message: "Delivery confirmed. Escrow released.",
            payout
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
