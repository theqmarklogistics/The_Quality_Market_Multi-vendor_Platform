import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { inngest } from "@/inngest/client";

const ALLOWED_REVIEW_STATUSES = ["APPROVED", "REJECTED"];

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const proofStatus = searchParams.get("proofStatus") || "SUBMITTED";

        const orders = await prisma.order.findMany({
            where: {
                paymentProofStatus: proofStatus
            },
            include: {
                user: true,
                store: true,
                orderItems: { include: { product: true } }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return NextResponse.json({ orders });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, status, notes } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing review details" }, { status: 400 });
        }

        if (!ALLOWED_REVIEW_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Invalid review status" }, { status: 400 });
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                paymentProofStatus: status,
                paymentProofNotes: notes || null,
                paymentReviewedBy: userId,
                paymentReviewedAt: new Date(),
                paymentStatus: status === "APPROVED" ? "PAID" : "PENDING",
                isPaid: status === "APPROVED",
                paymentReceivedAt: status === "APPROVED" ? new Date() : null
            }
        });

        try {
            await inngest.send({
                name: "payment/proof.reviewed",
                data: {
                    orderId,
                    status,
                    reviewedBy: userId
                }
            });
        } catch (inngestError) {
            console.error("Inngest payment review event error:", inngestError.message);
        }

        return NextResponse.json({ message: `Payment proof ${status.toLowerCase()} successfully` });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
