import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { chargeableWeightKg, quoteStandaloneFee } from "@/lib/deliveryPricing";
import { haversineKm, KIGALI_HUB, isOsrmPricingEnabled, roadDistanceKm } from "@/lib/deliveryEta";
import { getExternalDeliveryConfig, flatSectorFee } from "@/lib/externalDelivery";

// POST { addressId, items: [{ id, quantity }], lat?, lng? }
// Checkout-time estimate of the Kigali Pooled Delivery fee for the customer's cart.
// Distance comes from the pinned checkout location, else the saved address
// coordinates (exact pin or village-level geocode). Priced as a batch of one —
// the final pooled share is never higher than this estimate.
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const items = Array.isArray(body?.items) ? body.items.filter(i => i?.id) : [];
        const addressId = body?.addressId || null;

        // Resolve the drop point: explicit checkout pin wins, then the address geo.
        let lat = Number.isFinite(body?.lat) ? body.lat : null;
        let lng = Number.isFinite(body?.lng) ? body.lng : null;
        let sector = null;

        if (addressId) {
            const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
            if (!address) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
            sector = address.sector || null;
            if (lat == null || lng == null) {
                lat = address.latitude ?? null;
                lng = address.longitude ?? null;
            }
        }

        // Total chargeable weight of the cart (max of actual vs volumetric per item).
        const config = await getExternalDeliveryConfig();
        let chargeableKg = 0;
        if (items.length) {
            const products = await prisma.product.findMany({
                where: { id: { in: items.map(i => i.id) } },
                select: { id: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true },
            });
            const productMap = new Map(products.map(p => [p.id, p]));
            for (const item of items) {
                const p = productMap.get(item.id);
                if (!p) continue;
                const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
                const perUnit = chargeableWeightKg(p.weightKg, p.lengthCm, p.widthCm, p.heightCm, config.volumetricFactor);
                // Products without weight data still occupy the rider — assume 1 kg each.
                chargeableKg += (perUnit > 0 ? perUnit : 1) * qty;
            }
        }

        let distanceKm = null;
        if (lat != null && lng != null) {
            const drop = { lat, lng };
            if (isOsrmPricingEnabled()) distanceKm = await roadDistanceKm(KIGALI_HUB, drop);
            if (distanceKm == null) distanceKm = haversineKm(KIGALI_HUB, drop);
        }

        if (distanceKm != null && distanceKm > 0 && chargeableKg > 0) {
            return NextResponse.json({
                fee: quoteStandaloneFee({ chargeableKg, distanceKm, config }),
                chargeableKg: parseFloat(chargeableKg.toFixed(2)),
                distanceKm: parseFloat(distanceKm.toFixed(2)),
                basis: "formula",
            });
        }

        // No usable coordinates/weight → flat per-sector price.
        return NextResponse.json({
            fee: flatSectorFee(config, sector),
            chargeableKg: parseFloat(chargeableKg.toFixed(2)),
            distanceKm: distanceKm != null ? parseFloat(distanceKm.toFixed(2)) : null,
            basis: "flat",
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
