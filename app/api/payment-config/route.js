import prisma from "@/lib/prisma";
import { cachedJson, withCache } from "@/lib/cache";

// Public endpoint — returns MoMO details only (bank details kept private).
// Cached 5 min (shorter than other config — store/checkout uses it). Tag "payment-config".
export async function GET() {
    try {
        const config = await withCache(
            ['payment-config', 'default'],
            () => prisma.paymentConfig.findUnique({ where: { id: 'default' } }),
            { tags: ['payment-config'], ttlSeconds: 300 }
        );
        return cachedJson({
            momoPayCode: config?.momoPayCode || null,
            momoAccountName: config?.momoAccountName || null,
            momoConfigured: !!(config?.momoPayCode && config?.momoAccountName),
            bankConfigured: !!(config?.bankName && config?.bankAccountNumber),
        });
    } catch (error) {
        console.error(error);
        return cachedJson({ momoPayCode: null, momoAccountName: null, momoConfigured: false, bankConfigured: false });
    }
}
