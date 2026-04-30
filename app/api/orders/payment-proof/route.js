import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { Buffer } from "buffer";
import { inngest } from "@/inngest/client";
import { getSocketServer } from "@/lib/socketServer";

export async function POST(request) {
    try {
        const { userId } = getAuth(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await request.formData();
        const orderId = formData.get("orderId");
        const proofFile = formData.get("proofFile");

        if (!orderId || !proofFile) {
            return NextResponse.json({ error: "Missing proof details" }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: {
                id: String(orderId),
                userId
            }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const buffer = Buffer.from(await proofFile.arrayBuffer());
        const uploadResponse = await imageKit.files.upload({
            file: await toFile(buffer, proofFile.name),
            fileName: proofFile.name,
            folder: "payment-proofs"
        });

        await prisma.order.update({
            where: {
                id: String(orderId)
            },
            data: {
                paymentProofUrl: uploadResponse.url,
                paymentProofStatus: "SUBMITTED",
                paymentProofDate: new Date(),
                paymentProofNotes: null,
                paymentReviewedAt: null,
                paymentReviewedBy: null
            }
        });

        try {
            await inngest.send({
                name: "payment/proof.submitted",
                data: {
                    orderId: String(orderId),
                    userId
                }
            });
        } catch (inngestError) {
            console.error("Inngest payment proof event error:", inngestError.message);
        }

        try {
            const io = getSocketServer();
            io.to('admin-room').emit('admin-notification', {
                key: 'pendingPaymentProofs',
                message: 'New payment proof submitted'
            });
        } catch (socketError) {
            console.error('Socket.IO admin notify error:', socketError.message);
        }

        return NextResponse.json({ message: "Payment proof uploaded successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
