import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { invalidatePricingCache } from "@/lib/pricing";

export async function PUT(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { category, sellerModel, percent, fixedAmount, effectiveFrom, effectiveTo } = body;

    if (!category || (percent == null && fixedAmount == null)) {
      return NextResponse.json({ error: "category and at least one of percent or fixedAmount are required" }, { status: 400 });
    }

    const updated = await prisma.categoryCommission.update({
      where: { id },
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

    return NextResponse.json({ commission: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const isAdmin = await authAdmin(userId);
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await prisma.categoryCommission.delete({ where: { id } });
    invalidatePricingCache();
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}