import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

export async function GET(request) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rates = await prisma.weightShippingRate.findMany({
      orderBy: [{ zone: "asc" }, { minWeightKg: "asc" }]
    });
    return NextResponse.json({ rates });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

// Bulk-update costs: body = [{ id, cost }]
export async function PUT(request) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const patches = await request.json();
    if (!Array.isArray(patches)) return NextResponse.json({ error: "Expected array" }, { status: 400 });

    await Promise.all(patches.map(({ id, cost }) =>
      prisma.weightShippingRate.update({ where: { id }, data: { cost: Number(cost) } })
    ));
    return NextResponse.json({ message: "Rates updated" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}