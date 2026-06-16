import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

/**
 * Triggers the split payout after a successful OTP delivery confirmation.
 * MoMo disbursement calls are mocked — replace the stub sections with real
 * MTN MoMo Disbursement API requests when credentials are available.
 */
export async function triggerSplitPayout(order) {
    const riderAmount = order.deliveryFeeShare ?? 0;

    // ── External (off-platform) delivery: there is no vendor / no goods. ──────
    // The partner prepaid a published delivery fee (order.total). On delivery we
    // pay the rider their share; the platform retains the rest. No Payout row.
    if (order.isExternalDelivery) {
        const platformMargin = parseFloat((Number(order.total ?? 0) - riderAmount).toFixed(2));
        console.log(`[MOCK MoMo] Rider payout: ${riderAmount} RWF → corridor rider for external delivery ${order.id}`);
        console.log(`[MOCK MoMo] Platform delivery margin retained: ${platformMargin} RWF for external delivery ${order.id}`);
        return { vendorAmount: 0, riderAmount, platformCommission: platformMargin, external: true };
    }

    const itemsTotal = order.total - (order.shippingCost ?? 0);
    // Commission is stored as a JSON array of per-item breakdowns
    const commissionList = Array.isArray(order.commission) ? order.commission : [];
    const platformCommission = commissionList.reduce((sum, c) => sum + (c.commissionAmount ?? 0), 0);
    const vendorAmount = parseFloat((itemsTotal - platformCommission).toFixed(2));

    // ── MOCK: MTN MoMo Disbursement — Vendor ─────────────────────────────────
    // TODO: Replace with real MTN MoMo Disbursement API call
    // POST https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer
    // Body: { amount: vendorAmount, currency: "RWF", externalId: order.id, payee: { partyIdType: "MSISDN", partyId: storePhoneNumber } }
    console.log(`[MOCK MoMo] Vendor payout: ${vendorAmount} RWF → store ${order.storeId}`);

    // ── MOCK: MTN MoMo Disbursement — Rider ──────────────────────────────────
    // TODO: Replace with real MTN MoMo Disbursement API call
    // The rider wallet ID would come from a RiderProfile model (future)
    console.log(`[MOCK MoMo] Rider payout: ${riderAmount} RWF → corridor rider for order ${order.id}`);

    // ── MOCK: Platform Commission Retention ───────────────────────────────────
    // TODO: Log to a PlatformRevenue ledger model (future)
    console.log(`[MOCK MoMo] Platform commission retained: ${platformCommission} RWF for order ${order.id}`);

    // Persist a Payout record for the vendor using the existing Payout model
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

    return { vendorAmount, riderAmount, platformCommission };
}
