import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

/**
 * Settle an order once its delivery is OTP-confirmed.
 *
 * Riders are salaried company employees (paid via payroll, NOT per delivery), so
 * there is no per-delivery rider disbursement. `order.deliveryFeeShare` is the
 * customer's delivery charge / the order's allocated share of the fixed corridor
 * route cost — it is delivery REVENUE, never money owed to the rider.
 *
 * The only real money-out is the vendor payout: a `Payout` row created here and
 * settled by the existing admin payout flow. The MoMo disbursement to the vendor
 * is still mocked — replace the stub with a real MTN MoMo Disbursement call when
 * credentials are available.
 */
export async function triggerSplitPayout(order) {
    // The order's allocated share of the fixed route cost. Informational only
    // (delivery unit-economics) — never paid out, since riders are on payroll.
    const routeCostShare = order.deliveryFeeShare ?? 0;

    // ── External (off-platform) delivery: no vendor, no goods. ────────────────
    // The partner prepaid a published delivery fee (order.total); the whole amount
    // is platform delivery revenue. The rider cost is payroll, not per-order.
    if (order.isExternalDelivery) {
        const deliveryRevenue = parseFloat(Number(order.total ?? 0).toFixed(2));
        console.log(`[settlement] External delivery ${order.id}: ${deliveryRevenue} RWF delivery revenue (allocated route-cost share ~${routeCostShare} RWF)`);

        // Pooling benefit: the partner prepaid the solo quote (order.total) but the
        // batched route share (deliveryFeeShare) is usually lower. Return the
        // difference as redeemable account credit. Idempotent — only credits once.
        let poolingSavings = 0;
        const savings = Math.round(deliveryRevenue - Number(routeCostShare || 0));
        if (savings > 0 && order.userId) {
            const claimed = await prisma.$executeRaw`
                UPDATE "Order" SET "poolingSavings" = ${savings}
                WHERE id = ${order.id} AND "poolingSavings" IS NULL
            `;
            if (claimed > 0) {
                poolingSavings = savings;
                await prisma.$executeRaw`
                    UPDATE "User" SET "deliveryCreditBalance" = "deliveryCreditBalance" + ${savings}
                    WHERE id = ${order.userId}
                `;
                prisma.event
                    .create({ data: { name: "delivery.pooling_credit", userId: order.userId, payload: { orderId: order.id, savings, total: deliveryRevenue, deliveryFeeShare: routeCostShare } } })
                    .catch((e) => console.error("Event write error:", e.message));
            }
        }

        return { external: true, deliveryRevenue, routeCostShare, vendorAmount: 0, poolingSavings };
    }

    // ── Platform order: pay the vendor for goods (minus commission). ──────────
    const itemsTotal = order.total - (order.shippingCost ?? 0);
    // Commission is stored as a JSON array of per-item breakdowns.
    const commissionList = Array.isArray(order.commission) ? order.commission : [];
    const platformCommission = commissionList.reduce((sum, c) => sum + (c.commissionAmount ?? 0), 0);
    const vendorAmount = parseFloat((itemsTotal - platformCommission).toFixed(2));
    // The customer's delivery charge is platform revenue (rider is salaried).
    const deliveryRevenue = parseFloat(Number(routeCostShare).toFixed(2));

    // ── MOCK: MTN MoMo Disbursement — Vendor ─────────────────────────────────
    // TODO: Replace with a real MTN MoMo Disbursement API transfer to the store.
    // POST https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer
    // A Payout row is still created below, so the existing admin payout flow can
    // settle the vendor manually until the disbursement API is wired.
    console.log(`[settlement] Vendor payout: ${vendorAmount} RWF → store ${order.storeId} (order ${order.id})`);
    console.log(`[settlement] Platform retains: ${platformCommission} RWF commission + ${deliveryRevenue} RWF delivery revenue (order ${order.id})`);

    // Persist a Payout record for the vendor using the existing Payout model.
    const payoutId = 'pay_' + randomBytes(8).toString('hex');
    const now = new Date();

    await prisma.$executeRaw`
        INSERT INTO "Payout" (id, "storeId", amount, "periodStart", "periodEnd", status, notes, "createdAt", "updatedAt")
        VALUES (
            ${payoutId},
            ${order.storeId},
            ${vendorAmount},
            ${order.createdAt},
            ${now},
            'PENDING'::"PayoutStatus",
            ${'Auto-generated on pooled delivery OTP confirmation for order ' + order.id},
            ${now},
            ${now}
        )
    `;

    return { vendorAmount, platformCommission, deliveryRevenue };
}
