import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { quotePooledCartFee } from "@/lib/externalDelivery";

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

        // Resolve cart items → weight/dimension rows, then delegate to the shared
        // pooled-fee helper (same math as order creation, incl. the 1 kg/unit
        // fallback for products without weight data).
        let cartItems = [];
        if (items.length) {
            const products = await prisma.product.findMany({
                where: { id: { in: items.map(i => i.id) } },
                select: { id: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true },
            });
            const productMap = new Map(products.map(p => [p.id, p]));
            cartItems = items
                .filter(i => productMap.has(i.id))
                .map(i => ({ ...productMap.get(i.id), quantity: Math.max(1, parseInt(i.quantity, 10) || 1) }));
        }

        const quote = await quotePooledCartFee({ items: cartItems, lat, lng, sector });
        return NextResponse.json(quote);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
