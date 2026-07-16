import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import authAdmin from "@/middlewares/authAdmin";
import { logAdminAction } from "@/lib/auditLog";
import { invalidateWeightRangeCache } from "@/lib/externalDelivery";

// GET — all weight ranges (admin), ascending by min weight.
export async function GET(request) {
  try {
    const { userId } = getAuth(request);
    if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ranges = await prisma.deliveryWeightRange.findMany({
      orderBy: { minWeightKg: "asc" },
      take: 200,
    });
    return NextResponse.json({ ranges });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}

// PUT — replace the whole weight-range table.
// body = [{ minWeightKg, maxWeightKg|null, chargeableKg }]
// Validation: each row needs a finite minWeightKg ≥ 0, a positive chargeableKg,
// and (when set) maxWeightKg > minWeightKg. Rows are stored ascending; the top
// row may leave maxWeightKg null for the open tier.
export async function PUT(request) {
  try {
    const { userId } = getAuth(request);
    if (!(await authAdmin(userId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!Array.isArray(body)) return NextResponse.json({ error: "Expected an array of ranges" }, { status: 400 });

    const clean = [];
    for (const r of body) {
      const min = Number(r?.minWeightKg);
      const max = r?.maxWeightKg === "" || r?.maxWeightKg == null ? null : Number(r.maxWeightKg);
      const chargeable = Number(r?.chargeableKg);
      if (!Number.isFinite(min) || min < 0) {
        return NextResponse.json({ error: "Each range needs a valid minimum weight (≥ 0)" }, { status: 400 });
      }
      if (!Number.isFinite(chargeable) || chargeable <= 0) {
        return NextResponse.json({ error: "Each range needs a chargeable weight greater than 0" }, { status: 400 });
      }
      if (max != null && (!Number.isFinite(max) || max <= min)) {
        return NextResponse.json({ error: "Each range's maximum must be greater than its minimum" }, { status: 400 });
      }
      clean.push({ minWeightKg: min, maxWeightKg: max, chargeableKg: chargeable });
    }
    clean.sort((a, b) => a.minWeightKg - b.minWeightKg);

    // Replace-all in a transaction so a bad batch never leaves a partial table.
    await prisma.$transaction([
      prisma.deliveryWeightRange.deleteMany({}),
      ...(clean.length ? [prisma.deliveryWeightRange.createMany({ data: clean })] : []),
    ]);

    invalidateWeightRangeCache();
    const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    logAdminAction({ adminId: userId, adminName: admin?.name || "", action: "WEIGHT_RANGES_UPDATED", targetType: "DeliveryWeightRange", targetId: "all", notes: `${clean.length} ranges` });

    return NextResponse.json({ message: "Weight ranges saved", count: clean.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || error.code }, { status: 500 });
  }
}
