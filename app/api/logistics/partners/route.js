import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import authLogistics from "@/middlewares/authLogistics";

// GET — all external delivery partners (EXTERNAL_SELLER users) staff can book for.
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const partners = await prisma.user.findMany({
            where: { role: "EXTERNAL_SELLER" },
            orderBy: { name: "asc" },
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json({ partners });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// POST { name, email?, phone? } — quick-create a lightweight external partner the
// staff can book deliveries for. These have no Clerk login (id prefixed "ext_");
// they receive tracking via the public token link, not a dashboard.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await authLogistics(userId))) {
            return NextResponse.json({ error: "Forbidden — logistics only" }, { status: 403 });
        }

        const body = await request.json();
        const name = (body?.name || "").trim();
        const email = (body?.email || "").trim().toLowerCase();
        if (!name) return NextResponse.json({ error: "Partner name is required" }, { status: 400 });

        const id = "ext_" + randomBytes(10).toString("hex");
        const partner = await prisma.user.create({
            data: {
                id,
                name,
                email: email || `${id}@external.local`,
                image: "",
                role: "EXTERNAL_SELLER",
            },
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json({ success: true, partner });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
