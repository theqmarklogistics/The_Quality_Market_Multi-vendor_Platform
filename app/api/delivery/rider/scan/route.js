import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authRider from "@/middlewares/authRider";
import { emitDelivery } from "@/lib/deliveryRealtime";

// Pull an order id out of whatever the rider scanned/typed: a raw id, a
// /package/<id> or /track/<id> URL (with or without query string).
function parseOrderCode(raw) {
    const code = String(raw || "").trim();
    if (!code) return null;
    const urlMatch = code.match(/\/(?:package|track)\/([A-Za-z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    return code.split("?")[0].split("/").pop() || null;
}

// POST { code } — rider scans a package QR (or types the id) and gets assigned
// to that package: the order is attached to the rider's own pickup corridor for
// today (created on first scan), or — when the order is already on an
// unassigned corridor — the rider takes that corridor.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authRider(userId))) {
            return NextResponse.json({ error: "Forbidden — riders only" }, { status: 403 });
        }

        const body = await request.json();
        const orderId = parseOrderCode(body?.code);
        if (!orderId) return NextResponse.json({ error: "Scan or enter a package code" }, { status: 400 });

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { address: { select: { name: true, sector: true, phone: true } } },
        });
        if (!order || !["KIGALI_POOL", "EXPRESS"].includes(order.deliveryType)) {
            return NextResponse.json({ error: "No rider-delivery package found for this code" }, { status: 404 });
        }
        if (["DELIVERED", "FAILED"].includes(order.deliveryStatus || "")) {
            return NextResponse.json({ error: `This package is already ${order.deliveryStatus.toLowerCase()}` }, { status: 409 });
        }
        // External (off-platform) deliveries are prepaid — never take an unpaid one.
        if (order.isExternalDelivery && !order.isPaid) {
            return NextResponse.json({ error: "This external delivery hasn't been paid yet — send it to logistics" }, { status: 409 });
        }

        let corridorId = order.corridorId;

        if (corridorId) {
            // Already routed: the rider can take an unassigned corridor, or confirm
            // one that's already theirs. Never steal another rider's route.
            const corridor = await prisma.deliveryCorridor.findUnique({ where: { id: corridorId } });
            if (corridor.assignedRiderId && corridor.assignedRiderId !== userId) {
                return NextResponse.json({ error: "This package is on another rider's route" }, { status: 409 });
            }
            if (!corridor.assignedRiderId) {
                await prisma.deliveryCorridor.update({
                    where: { id: corridorId },
                    data: { assignedRiderId: userId },
                });
            }
        } else {
            // Un-routed package: attach it to the rider's own scan corridor for today.
            const dayStart = new Date();
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            let corridor = await prisma.deliveryCorridor.findFirst({
                where: {
                    assignedRiderId: userId,
                    runDate: { gte: dayStart, lte: dayEnd },
                    status: { in: ["OPEN", "CLOSED", "IN_TRANSIT"] },
                },
                orderBy: { createdAt: "desc" },
            });
            if (!corridor) {
                const rider = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
                corridor = await prisma.deliveryCorridor.create({
                    data: {
                        name: `Scanned pickups — ${rider?.name || "rider"} ${new Date().toLocaleDateString("en-GB")}`,
                        runDate: new Date(),
                        status: "CLOSED",
                        assignedRiderId: userId,
                    },
                });
            }
            corridorId = corridor.id;

            const stopCount = await prisma.order.count({ where: { corridorId } });
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    corridorId,
                    deliveryStatus: order.deliveryStatus === "PENDING_INTAKE" ? "SORTING" : order.deliveryStatus,
                    stopSequence: stopCount + 1,
                },
            });
        }

        emitDelivery(["logistics-room", `corridor-${corridorId}`, `rider-${userId}`], "corridor-update", {
            corridorId,
            scanned: order.id,
        });

        return NextResponse.json({
            success: true,
            corridorId,
            stop: {
                orderId: order.id,
                recipientName: order.address?.name || null,
                sector: order.address?.sector || null,
                landmarkAddress: order.landmarkAddress || null,
            },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
