import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import authLogistics from "@/middlewares/authLogistics";
import { runPoolBatching } from "@/lib/poolBatching";
import { emitDelivery } from "@/lib/deliveryRealtime";

// POST — run the pooled-delivery batching engine on demand (logistics only).
// Sweeps every sorted-but-un-corridored pooled order into route corridors now,
// instead of waiting for the next scheduled wave.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const result = await runPoolBatching();

        // Nudge any open dispatch boards to refresh.
        if (result.corridors > 0) {
            emitDelivery(["logistics-room"], "corridor-update", { batched: result.batched });
        }

        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
