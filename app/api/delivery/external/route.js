import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { randomBytes, randomInt } from "crypto";
import prisma from "@/lib/prisma";
import authExternalSeller from "@/middlewares/authExternalSeller";
import authLogistics from "@/middlewares/authLogistics";
import { paymentMethod } from "@/lib/constants";
import { quoteExternalDeliveryFee } from "@/lib/externalDelivery";
import { getSocketServer } from "@/lib/socketServer";

const ALLOWED_PAYMENT = [paymentMethod.BANK_TRANSFER, paymentMethod.MTN_MOMO];
const ALLOWED_INTAKE = ["HUB_DROP_OFF", "DRIVER_SWEEP"];

// GET — the caller's own external deliveries (partner dashboard).
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authExternalSeller(userId))) {
            return NextResponse.json({ error: "Forbidden — delivery partners only" }, { status: 403 });
        }

        const orders = await prisma.order.findMany({
            where: { userId, isExternalDelivery: true },
            orderBy: { createdAt: "desc" },
            include: { address: { select: { name: true, phone: true, sector: true } } },
        });

        return NextResponse.json({
            deliveries: orders.map((o) => ({
                orderId: o.id,
                createdAt: o.createdAt,
                total: o.total,
                paymentStatus: o.paymentStatus,
                paymentProofStatus: o.paymentProofStatus,
                isPaid: o.isPaid,
                deliveryStatus: o.deliveryStatus,
                intakeMethod: o.intakeMethod,
                deliveryOtp: o.deliveryOtp,
                trackingToken: o.trackingToken,
                packageDescription: o.packageDescription,
                recipientName: o.address?.name ?? null,
                recipientPhone: o.address?.phone ?? null,
                recipientSector: o.address?.sector ?? null,
            })),
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// POST — book a delivery-only order through the Kigali pooled pipeline.
// Owner (order.userId) resolution:
//   • staff (logistics/admin) may pass { partnerId } to book on a partner's behalf
//   • otherwise the caller must be an EXTERNAL_SELLER and owns the order themselves
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();

        // Resolve who owns (and is billed for) this delivery.
        let ownerId;
        if (body?.partnerId) {
            if (!(await authLogistics(userId))) {
                return NextResponse.json({ error: "Only logistics staff can book on a partner's behalf" }, { status: 403 });
            }
            const partner = await prisma.user.findUnique({ where: { id: body.partnerId }, select: { id: true } });
            if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 400 });
            ownerId = partner.id;
        } else {
            if (!(await authExternalSeller(userId))) {
                return NextResponse.json({ error: "Forbidden — delivery partners only" }, { status: 403 });
            }
            ownerId = userId;
        }

        // ── Validate inputs ──────────────────────────────────────────────────
        const recipientName = (body?.recipientName || "").trim();
        const recipientPhone = (body?.recipientPhone || "").trim();
        const recipientEmail = (body?.recipientEmail || "").trim();
        const recipientSector = (body?.recipientSector || "").trim();
        const recipientLandmark = (body?.recipientLandmark || "").trim();
        const recipientLat = typeof body?.recipientLat === "number" && !Number.isNaN(body.recipientLat) ? body.recipientLat : null;
        const recipientLng = typeof body?.recipientLng === "number" && !Number.isNaN(body.recipientLng) ? body.recipientLng : null;

        const intakeMethod = ALLOWED_INTAKE.includes(body?.intakeMethod) ? body.intakeMethod : "HUB_DROP_OFF";
        const pickupContactName = (body?.pickupContactName || "").trim() || null;
        const pickupPhone = (body?.pickupPhone || "").trim() || null;
        const pickupLandmark = (body?.pickupLandmark || "").trim() || null;
        const pickupLat = typeof body?.pickupLat === "number" && !Number.isNaN(body.pickupLat) ? body.pickupLat : null;
        const pickupLng = typeof body?.pickupLng === "number" && !Number.isNaN(body.pickupLng) ? body.pickupLng : null;

        const packageDescription = (body?.packageDescription || "").trim() || null;
        const declaredValue = Number.isFinite(body?.declaredValue) && body.declaredValue > 0 ? body.declaredValue : null;
        const selectedPaymentMethod = body?.paymentMethod;

        if (!recipientName || !recipientPhone || !recipientSector || !recipientLandmark) {
            return NextResponse.json(
                { error: "Recipient name, phone, sector and landmark/directions are required" },
                { status: 400 }
            );
        }
        if (!ALLOWED_PAYMENT.includes(selectedPaymentMethod)) {
            return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }
        if (intakeMethod === "DRIVER_SWEEP" && (!pickupContactName || !pickupPhone || !pickupLandmark)) {
            return NextResponse.json(
                { error: "Pickup contact, phone and location are required for a driver sweep" },
                { status: 400 }
            );
        }

        // ── Recipient address (owned by the partner; satisfies Address.userId) ─
        const address = await prisma.address.create({
            data: {
                userId: ownerId,
                name: recipientName,
                email: recipientEmail,
                phone: recipientPhone,
                street: recipientLandmark || "-",
                city: "Kigali",
                state: "Kigali",
                zip: "-",
                country: "Rwanda",
                sector: recipientSector,
                latitude: recipientLat,
                longitude: recipientLng,
            },
        });

        // ── Quote the published delivery fee (partner-paid) ──────────────────
        const fee = await quoteExternalDeliveryFee(recipientSector);

        const orderId = "ord_" + randomBytes(8).toString("hex");
        const deliveryOtp = String(randomInt(1000, 10000));
        const trackingToken = "trk_" + randomBytes(16).toString("hex");
        const now = new Date();

        // Delivery-only order: no storeId, no OrderItems, escrow NOT_HELD, unpaid.
        // Raw insert mirrors app/api/orders/route.js (no implicit transaction on the
        // Neon HTTP adapter). No paymentExpiresAt → the expiry cron leaves it alone.
        await prisma.$executeRaw`
            INSERT INTO "Order" (
                id, "userId", "storeId", "addressId",
                total, status,
                "shippingCost", "shippingQuoted",
                commission,
                "paymentMethod", "paymentStatus",
                "isPaid", "isCouponUsed", coupon,
                "invoiceRequested", "paymentProofStatus",
                "deliveryType", "intakeMethod", "landmarkAddress", "deliveryOtp",
                "deliveryStatus", "escrowStatus",
                "isExternalDelivery", "pickupContactName", "pickupPhone", "pickupLandmark",
                "pickupLat", "pickupLng", "packageDescription", "declaredValue", "trackingToken",
                "recipientLat", "recipientLng",
                "createdAt", "updatedAt"
            ) VALUES (
                ${orderId}, ${ownerId}, ${null}, ${address.id},
                ${fee}, 'ORDER_PLACED'::"OrderStatus",
                ${0}, ${true},
                '{}'::jsonb,
                ${selectedPaymentMethod}::"PaymentMethod", 'PENDING'::"PaymentStatus",
                false, false, '{}'::jsonb,
                false, 'NOT_SUBMITTED'::"PaymentProofStatus",
                'KIGALI_POOL'::"DeliveryType", ${intakeMethod}::"IntakeMethod", ${recipientLandmark}, ${deliveryOtp},
                'PENDING_INTAKE'::"PoolDeliveryStatus", 'NOT_HELD'::"EscrowStatus",
                true, ${pickupContactName}, ${pickupPhone}, ${pickupLandmark},
                ${pickupLat}, ${pickupLng}, ${packageDescription}, ${declaredValue}, ${trackingToken},
                ${recipientLat}, ${recipientLng},
                ${now}, ${now}
            )
        `;

        try {
            const io = getSocketServer();
            io.to("admin-room").emit("admin-notification", {
                key: "newOrders",
                message: "New external delivery booked",
            });
        } catch (_) { /* socket optional */ }

        return NextResponse.json({ success: true, orderId, fee, trackingToken, deliveryOtp });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
