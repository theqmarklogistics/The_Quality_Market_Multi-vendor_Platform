import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { invalidatePricingCache } from "@/lib/pricing";

export async function GET(request) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const commissions = await prisma.categoryCommission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    return NextResponse.json({ commissions });
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
    const { category, sellerModel, percent, fixedAmount, effectiveFrom, effectiveTo } = body;

    if (!category || (percent == null && fixedAmount == null)) {
      return NextResponse.json({ error: 'category and at least one of percent or fixedAmount are required' }, { status: 400 });
    }

    const created = await prisma.categoryCommission.create({
      data: {
        category: String(category),
        sellerModel: sellerModel || null,
        percent: percent == null ? null : Number(percent),
        fixedAmount: fixedAmount == null ? null : Number(fixedAmount),
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null
      }
    });

    invalidatePricingCache();

    return NextResponse.json({ commission: created }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}
