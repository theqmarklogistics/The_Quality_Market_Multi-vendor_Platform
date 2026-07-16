// One-off repair: addresses saved with a bogus (0,0) / out-of-Rwanda "pin"
// (the Number(null)→0 bug in the address API). Re-geocodes each from its
// administrative parts (village/cell → sector → district) and updates the row;
// rows that can't be geocoded get null coords so pricing falls back safely.
// Run: node --env-file=.env scripts/fix-null-island-addresses.mjs
import { PrismaClient } from "@prisma/client";
import { geocodeRwAddress } from "../lib/geocode.js";
import { haversineKm, KIGALI_HUB } from "../lib/deliveryEta.js";

const prisma = new PrismaClient();

const inRwanda = (lat, lng) =>
  lat != null && lng != null && lat >= -3.0 && lat <= -1.0 && lng >= 28.8 && lng <= 31.0;

async function main() {
  const bad = await prisma.address.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      OR: [
        { latitude: { lt: -3.0 } }, { latitude: { gt: -1.0 } },
        { longitude: { lt: 28.8 } }, { longitude: { gt: 31.0 } },
      ],
    },
    select: {
      id: true, district: true, sector: true, cell: true, village: true,
      state: true, latitude: true, longitude: true,
    },
  });
  console.log(`Found ${bad.length} address(es) with out-of-Rwanda coordinates`);

  for (const a of bad) {
    const geo = await geocodeRwAddress({
      village: a.village || a.cell,
      sector: a.sector,
      district: a.district,
      province: a.state,
    });
    const ok = geo && inRwanda(geo.lat, geo.lng);
    const latitude = ok ? geo.lat : null;
    const longitude = ok ? geo.lng : null;
    await prisma.address.update({ where: { id: a.id }, data: { latitude, longitude } });
    const d = ok ? haversineKm(KIGALI_HUB, { lat: latitude, lng: longitude }) : null;
    console.log(
      `#${a.id} ${a.district}/${a.sector}/${a.cell}/${a.village}: (${a.latitude}, ${a.longitude}) → ` +
      (ok
        ? `(${latitude.toFixed(5)}, ${longitude.toFixed(5)}) [${geo.precision}] — ${d.toFixed(1)} km from hub`
        : "null (geocode failed — flat-fee fallback until customer pins)")
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
