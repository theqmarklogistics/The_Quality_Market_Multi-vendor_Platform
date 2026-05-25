import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";

export async function GET(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const rule = await prisma.shippingRule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    const body = await request.json();
    const data = {};
    if (body.name) data.name = String(body.name);
    if (body.type) data.type = String(body.type);
    if (body.regionKey != null) data.regionKey = body.regionKey ? String(body.regionKey) : null;
    if (body.minKm != null) data.minKm = Number(body.minKm);
    if (body.maxKm != null) data.maxKm = Number(body.maxKm);
    if (body.flatRate != null) data.flatRate = Number(body.flatRate);
    if (body.perKmRate != null) data.perKmRate = Number(body.perKmRate);
    if (body.priority != null) data.priority = Number(body.priority);

    const updated = await prisma.shippingRule.update({ where: { id }, data });
    return NextResponse.json({ rule: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    await prisma.shippingRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}
