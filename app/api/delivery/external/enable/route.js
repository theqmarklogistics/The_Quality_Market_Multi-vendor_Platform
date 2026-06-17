import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

// POST — self-serve delivery-partner enrolment. A signed-in customer opts into
// the external-seller delivery service and is granted the EXTERNAL_SELLER role
// instantly (no admin review), so they can book deliveries right away.
//
// Guard: User.role is a single field, so we only upgrade a plain CUSTOMER. Users
// who already hold another staff/seller role keep it — overwriting would strip
// their existing access — and are pointed at support instead.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });

        // The Clerk → DB sync runs on a webhook; on the rare race where the row
        // isn't there yet, ask them to retry rather than silently failing.
        if (!user) {
            return NextResponse.json(
                { error: "Your account is still syncing — please retry in a moment." },
                { status: 409 }
            );
        }

        // Already a partner (or admin) — nothing to grant, just let them through.
        if (user.role === "EXTERNAL_SELLER" || user.role === "ADMIN") {
            return NextResponse.json({ success: true, alreadyEnabled: true });
        }

        // Some other role — don't clobber it. Route them to support.
        if (user.role !== "CUSTOMER") {
            return NextResponse.json(
                { error: `Your account already has a ${user.role.replace(/_/g, " ").toLowerCase()} role. Contact support to add delivery access.` },
                { status: 409 }
            );
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: "EXTERNAL_SELLER" },
        });

        // Analytics trail for self-enrolments (fire-and-forget).
        prisma.event
            .create({ data: { name: "external_seller.self_enrolled", userId, payload: {} } })
            .catch((err) => console.error("Event write error:", err.message));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
