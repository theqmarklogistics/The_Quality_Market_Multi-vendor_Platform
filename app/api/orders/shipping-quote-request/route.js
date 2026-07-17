import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { sendShippingQuoteRequestEmail } from "@/lib/email";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

// A shopper asks our team to quote shipping for imported (non-local) products.
// Imported items are not auto-priced by the domestic delivery formula, so instead
// of a checkout fee the customer requests a quote and admin follows up.
const requestLimiter = createRateLimiter({ max: 6, windowMs: 60_000 });

// POST { items: [{ id, quantity? }], addressId?, note?, source? }
export async function POST(request) {
    try {
        const rl = requestLimiter(`shipping-quote-request:${getClientIp(request)}`);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again shortly." },
                { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
            );
        }

        const { userId } = getAuth(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const rawItems = Array.isArray(body?.items) ? body.items.filter((i) => i?.id) : [];
        if (!rawItems.length) {
            return NextResponse.json({ error: "No products supplied" }, { status: 400 });
        }
        const qtyById = new Map(
            rawItems.map((i) => [i.id, Math.max(1, parseInt(i.quantity, 10) || 1)])
        );

        const products = await prisma.product.findMany({
            where: { id: { in: [...qtyById.keys()] } },
            select: { id: true, name: true, importOrigin: true },
        });
        // Only imported (non-local) products need a manual shipping quote.
        const imported = products.filter((p) => p.importOrigin);
        if (!imported.length) {
            return NextResponse.json({ error: "None of these products require a shipping quote" }, { status: 400 });
        }

        const [user, address] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
            body?.addressId
                ? prisma.address.findFirst({
                      where: { id: body.addressId, userId },
                      select: { phone: true, village: true, cell: true, sector: true, district: true, city: true },
                  })
                : Promise.resolve(null),
        ]);

        const deliveryArea = address
            ? [address.village, address.cell, address.sector, address.district || address.city]
                  .filter(Boolean)
                  .join(", ") || null
            : null;

        await sendShippingQuoteRequestEmail({
            customerName: user?.name || null,
            customerEmail: user?.email || null,
            customerPhone: address?.phone || null,
            deliveryArea,
            note: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
            source: body?.source === "checkout" ? "checkout" : "product",
            items: imported.map((p) => ({ name: p.name, origin: p.importOrigin, quantity: qtyById.get(p.id) })),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}
