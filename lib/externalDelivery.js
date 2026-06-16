import prisma from "@/lib/prisma";

const DEFAULT_BASE_PRICE = 2000; // RWF, used until an admin configures pricing

// Load the singleton external-delivery pricing config, creating it on first use.
export async function getExternalDeliveryConfig() {
    let config = await prisma.externalDeliveryConfig.findUnique({ where: { id: "default" } });
    if (!config) {
        config = await prisma.externalDeliveryConfig.create({
            data: { id: "default", basePrice: DEFAULT_BASE_PRICE, perSector: {} },
        });
    }
    return config;
}

// Published flat/zone price charged to the partner at booking for a given Kigali
// sector. Per-sector overrides win; otherwise the flat base price applies. This
// is the CUSTOMER-facing price — independent of the internal rider fee share.
export async function quoteExternalDeliveryFee(sector) {
    const config = await getExternalDeliveryConfig();
    const perSector = config.perSector && typeof config.perSector === "object" ? config.perSector : {};
    const override = sector ? perSector[sector] : null;
    const price = Number.isFinite(override) && override > 0 ? override : config.basePrice;
    return parseFloat(Number(price ?? DEFAULT_BASE_PRICE).toFixed(2));
}
