import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

export async function GET(request) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rules = await prisma.shippingRule.findMany({ orderBy: { priority: 'desc' } });
    return NextResponse.json({ rules });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, type, regionKey, minKm, maxKm, flatRate, perKmRate, priority } = body;

    if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 });

    const created = await prisma.shippingRule.create({
      data: {
        name: String(name),
        type: String(type),
        regionKey: regionKey ? String(regionKey) : null,
        minKm: minKm == null ? null : Number(minKm),
        maxKm: maxKm == null ? null : Number(maxKm),
        flatRate: flatRate == null ? null : Number(flatRate),
        perKmRate: perKmRate == null ? null : Number(perKmRate),
        priority: priority == null ? 0 : Number(priority)
      }
    });

    return NextResponse.json({ rule: created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}
