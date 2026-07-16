import { NextResponse } from "next/server";
import { getExternalDeliveryConfig } from "@/lib/externalDelivery";

// GET — public, non-sensitive delivery options for checkout/booking UIs.
// Only exposes which services are offered (never the pricing knobs); the
// authoritative fee always comes from the server-side quote endpoints.
export async function GET() {
    try {
        const config = await getExternalDeliveryConfig();
        return NextResponse.json({ expressEnabled: config.expressEnabled !== false });
    } catch (error) {
        console.error(error);
        // Fail open to the default (express offered) — the order APIs still
        // enforce the real flag at booking time.
        return NextResponse.json({ expressEnabled: true });
    }
}
