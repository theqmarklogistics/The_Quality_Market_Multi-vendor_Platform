# PLAN — Feature & Fixes Work Order (2026-07-15)

## 0. What the repo actually is (corrections to the work-order assumptions)

| Assumption in work order | Reality in this repo |
|---|---|
| Next.js + TypeScript | Next.js 15 App Router, **JavaScript** (`.jsx`/`.js`, `jsconfig.json`). Only `middleware.ts` is TS. Mobile app (`mobile/`, Expo) is TS. |
| Supabase client | **Prisma ORM** → Supabase **Postgres** (PgBouncer transaction pooler at runtime, `DIRECT_URL` for migrations). No `@supabase/supabase-js`. |
| Tailwind | Tailwind 4 ✔. Plus Redux Toolkit, Clerk auth, socket.io (custom `server.js`), Resend email, Inngest, `@react-pdf/renderer` PDFs, ImageKit media. Deployed as Docker on Render. |
| "tax recomputes correctly" | **There is no tax anywhere.** Totals = items subtotal − coupon % + shippingCost. No VAT fields in schema, checkout, or invoice. I will NOT invent a tax line; flagged in AUDIT instead. |
| Payment methods | Checkout allows **BANK_TRANSFER and MTN_MOMO** only (`STRIPE`/`AIRTEL_MONEY` exist in the enum but are not offered). |
| Tests | No jest/vitest. Tests are plain-node assert scripts (`scripts/check-*.mjs`, run via `npm run test:pricing` etc.). New tests follow that pattern. |

### Key modules (current architecture)
- **Cart → checkout**: Redux cart → [components/OrderSummary.jsx](components/OrderSummary.jsx) → live quote `POST /api/orders/shipping-quote` → order creation `POST /api/orders` ([app/api/orders/route.js](app/api/orders/route.js)). Raw-SQL phased writes (stock reservation → coupon claim → order insert) because PgBouncer forbids long transactions.
- **Shipping fee today** (always charged — see conflict below):
  - `STANDARD_UNPOOLED`: zone×weight tariff (`WeightShippingRate`, zones A/B/C via `SECTOR_ZONE_MAP` + `CHINA_RWANDA`) in [lib/pricing.js](lib/pricing.js); flat `ExternalDeliveryConfig.basePrice` fallback (2000 RWF).
  - `KIGALI_POOL` + external bookings: `fee = max(floor, rate×chargeableKg×km×tierMultiplier)` in [lib/deliveryPricing.js](lib/deliveryPricing.js) / [lib/externalDelivery.js](lib/externalDelivery.js). Distance = haversine, or OSRM if `DELIVERY_OSRM_PRICING=true`.
- **Chargeable weight**: `max(actual, L×W×H / 5000)` already exists (`volumetricFactor` 200 kg/m³ ≡ divisor 5000, admin-tunable). **No 0.5 kg round-up yet.**
- **Geocoding**: [lib/geocode.js](lib/geocode.js) — Google Geocoding (server-side, `PUBLIC_GOOGLE_MAPS_API_KEY`) with Nominatim fallback, village→sector→district laddering. **No cache** (repeat billing risk).
- **Invoices**: no `Invoice` model. PDFs generated on-the-fly ([lib/generateInvoice.jsx](lib/generateInvoice.jsx)) keyed by Order ID; MoMo auto-emails on customer request; **Bank Transfer queues for manual admin send** ([app/api/orders/[id]/request-invoice/route.js](app/api/orders/%5Bid%5D/request-invoice/route.js), [app/admin/invoices/page.jsx](app/admin/invoices/page.jsx)). No invoice numbers.
- **Corridors**: two layers already exist — admin-registered `DeliveryHub`/`CorridorRoute`/`CorridorSchedule` (admin UI at [app/admin/hubs/page.jsx](app/admin/hubs/page.jsx)) and daily `DeliveryCorridor` runs built by [lib/poolBatching.js](lib/poolBatching.js) (greedy nearest-neighbour `stopSequence`, proportional fee shares). **No rates on corridors; not wired into fee calc.**
- **Messaging**: `Conversation`/`Message` models are **in-app chat** (socket.io), not email. No inbound email anywhere.
- **Rider batch order**: rider assignment returns stops ordered by `stopSequence` (nearest-neighbour route order), distance never persisted.

---

## ⚠️ Risky items & conflicts — read before I proceed

1. **Task 2 reverses a deliberate business rule.** The codebase (and my saved project notes) encode "shipping is never free — always charged at checkout"; `/api/hero` even scrubs admin copy mentioning free shipping, and `calculateOrderShippingForStore` deliberately falls back to a 2000 RWF floor so no order leaves checkout unpaid. The work order explicitly says Standard delivery ⇒ fee 0, so I will implement it as written (Standard = free, Pooled/external unchanged) — but this is a revenue decision you should be conscious of. The hero free-shipping scrub will be removed too (it would now fight reality). I'll update my saved note.
2. **Payments**: I will not touch payment-proof/verification flows. Task 3 only *adds* an Invoice record + auto-generation at order placement for Bank Transfer. Invoice numbering uses a **Postgres sequence** (safe under PgBouncer since `nextval()` is a single statement).
3. **Emails**: outbound uses existing Resend. **Inbound email (task 7) requires YOUR manual provider + DNS setup** (Resend inbound: MX record on a subdomain, webhook secret). Code will be ready and inert until configured. Full list of manual actions at the bottom.
4. **Distance API (billing)**: Google Routes API calls cost money. Mitigations: field masks, DB-backed caches keyed by rounded coords (`RouteCache`) and normalized address (`GeocodeCache`), fallback chain Google → OSRM (if configured) → haversine×1.4 with logging. Server-side-only key in a new env `GOOGLE_MAPS_SERVER_API_KEY` (falls back to existing `PUBLIC_GOOGLE_MAPS_API_KEY`). **You must enable "Routes API" in Google Cloud Console** — Geocoding alone is not enough.
5. **Migrations against the live Supabase DB.** I will add timestamped SQL folders under `prisma/migrations/` (repo convention) and update `schema.prisma`, but I will **not** run `prisma migrate` against your database. You (or your deploy) run `npx prisma migrate deploy`. Nothing I ship crashes if run before migration EXCEPT features that need the new tables (invoices auto-gen guards for table-missing errors were considered too magical — deploy migrations first).
6. **Task-4 worked example is internally inconsistent**: 3.2 kg "rounded up to nearest 0.5" is 3.5, but the example says chargeable = 3.2. I implement: `chargeable_kg = max(actual, volumetric)` (= 3.2 in the example, matching your test) and a separate `billedKg = roundUpToHalf(chargeable)` (= 3.5) used by the fee strategies. Both asserted in tests. Rounding up raises some existing pooled quotes slightly.
7. **Task 9 tradeoff**: sorting stops by ascending hub→drop distance replaces the nearest-neighbour *route* ordering (which usually yields shorter total routes). Implemented as specified; noted in AUDIT.

---

## Per-task plan

### 1. Remove "Starts from RWF4.9K" hero badge
It's config-driven: `HeroConfig.startingPrice` (DB) with `'4.9K'` defaults in [components/Hero.jsx](components/Hero.jsx), [app/api/hero/route.js](app/api/hero/route.js), mobile `mobile/src/api/hero.ts` + `mobile/app/(tabs)/index.tsx`, editable at [app/admin/hero/page.jsx](app/admin/hero/page.jsx).
**Change**: stop rendering the block in web Hero; force `startingPrice: null` in the public API response (kills web + mobile in one move, even with a stale DB row); remove the admin form field; null the client defaults. DB column stays (harmless). Layout: the block is conditional already (`{main.startingPrice && …}`) so removal is safe; I'll verify spacing (`mt-5/sm:mt-10` on the CTA row still anchors it under the description).

### 2. Standard delivery ⇒ shipping fee 0
Fee is computed server-side in exactly two places for `STANDARD_UNPOOLED`: order creation ([app/api/orders/route.js:296](app/api/orders/route.js#L296)) and the checkout quote ([app/api/orders/shipping-quote/route.js:80](app/api/orders/shipping-quote/route.js#L80)).
**Change**: extract a pure totals helper `lib/orderTotals.js` (`computeOrderTotal({subtotal, couponPercent, shippingCost})` + `standardShippingCost() → 0`); both routes short-circuit STANDARD to 0 (`shippingQuoted: true`); checkout UI shows "Free"; invoice PDF already hides zero shipping; persisted `shippingCost = 0`. Pooled/external untouched. Remove the now-false "paid at checkout" copy for standard + the hero free-shipping scrub.
**Test**: `scripts/check-order-totals.mjs` (+ npm script) — standard ⇒ 0 fee and total = subtotal − coupon; pooled path unchanged; grand total recompute with coupon.

### 3. Auto-invoice on Bank Transfer
**Migration**: `Invoice` model — `id`, `invoiceNumber Int @unique` (from Postgres `SEQUENCE invoice_number_seq`), `orderId @unique`, `paymentReference` (= formatted number `INV-2026-00042`), amounts snapshot (`subtotal, shippingFee, discount, total, chargeableKg, shippingTier`), `snapshot Json` (items + bank details at issue time), `issuedAt`.
**Flow**: in `POST /api/orders`, after each Bank-Transfer order insert: `INSERT … invoiceNumber = nextval('invoice_number_seq')` (race-safe, single statement), then best-effort generate PDF + email (`sendInvoiceEmail`) — email failure never fails the order.
**PDF**: extend `generateInvoice` to take the invoice (number, reference, chargeable weight, shipping tier + fee). Customer downloads via new authed `GET /api/orders/[id]/invoice` (renders from snapshot); order page gets a Download Invoice button; admin invoices page lists real invoice numbers and can re-send. Existing MoMo request-invoice flow kept; Bank branch of it now just re-sends the stored invoice.

### 4. Geocode cache + chargeable weight
- `GeocodeCache` table (`query @unique` normalized "village|sector|district|province", lat, lng, precision, provider). `geocodeRwAddress` checks it first; writes on success.
- Warehouse origin: `WAREHOUSE_LAT`/`WAREHOUSE_LNG` env (documented), falling back to current `KIGALI_HUB` constant.
- `roundUpToHalfKg()` + `billedWeightKg()` added to [lib/deliveryPricing.js](lib/deliveryPricing.js); applied in fee quoting paths (see conflict #6). Divisor stays admin-configurable via `volumetricFactor` (200 ≡ ÷5000 default).
- **Test**: `scripts/check-chargeable-weight.mjs`: 2 kg actual, 40×20×20 ⇒ volumetric 3.2, chargeable 3.2, billed 3.5.

### 5. Google Routes API road distance
New `lib/distanceProvider.js`:
- `routeDistanceKm(origin, dest)` → `POST routes.googleapis.com/directions/v2:computeRoutes` (`travelMode: DRIVE`, `routingPreference: TRAFFIC_AWARE`, field mask `routes.distanceMeters,routes.duration`).
- `routeMatrixKm(origin, dests[])` → `:computeRouteMatrix` for batches.
- Provider chain per call: **RouteCache hit → Google → OSRM (if `OSRM_URL` self-hosted) → haversine × `ROAD_DISTANCE_FACTOR` (default 1.4, logged `distance-fallback`)**.
- `RouteCache` table keyed by coords rounded to 4 dp (~11 m).
Wire into: `quoteExternalDeliveryFee`, `quotePooledCartFee`, `poolBatching`/`resolveRouteDistances` (matrix). OSRM keeps serving live-map geometry (Routes API polyline not needed).

### 6. Corridors management
Largely exists (hubs + corridor routes + schedules admin UI, validation, CRUD APIs). **Gaps vs spec**: no rates, no fee-calc wiring.
**Change**: migration adds `fixedRate Float?`, `perKmRate Float?` to `CorridorRoute`; admin form + API validation extended; fee calc: when a pooled/external drop's sector matches an active corridor's `areas`, corridor rate overrides the formula (fixed wins over per-km; per-km uses task-5 road distance). Falls through to strategy pricing when no corridor matches.

### 7. Admin ↔ customer email threads
- **Migration**: `EmailThread` (`id`, `token @unique` for plus-addressing, `customerEmail`, `userId?`, `orderId?`, `subject`, timestamps) + `EmailMessage` (`threadId`, `direction IN|OUT`, `fromEmail`, `toEmail`, `subject`, `bodyHtml`, `bodyText`, `providerMessageId`, `sentById?`, `createdAt`).
- **Send**: `POST /api/admin/email-threads[/id]/messages` → Resend, `replyTo: inbox+<token>@<INBOUND_EMAIL_DOMAIN>`, logged.
- **Receive**: `POST /api/email/inbound` webhook (Resend `email.received`, svix signature via `RESEND_WEBHOOK_SECRET`); thread matched by plus-token, fallback `References`/`In-Reply-To`, else new unmatched thread.
- **UI**: `app/admin/inbox/page.jsx` — thread list + conversation view + compose (pick customer/email, optional order link). Socket ping to admin-room on inbound.
- **⚠️ Requires your DNS/provider setup** (below). Until then: sending works (replies go to the reply-to and sit undelivered only if domain unconfigured — UI shows a setup banner when env is missing).

### 8. Three shipping-fee strategies
`lib/shipping/strategies.js` with `quote(input) → {fee, breakdown}` per model; `input = {billedKg, distanceKm, zone, sector, config}`:
- **A — Zone + weight tiers**: wraps existing `WeightShippingRate` (zone×bracket) — table + admin editor already exist.
- **B — Distance + weight**: `base + km×perKm + kg×perKg`, `min_fee` floor.
- **C — Hybrid margin floor**: `max((fuelPerKm×km + handling + kg×variableRate) × (1+margin), minFee)` rounded up to nearest 100 RWF.
Config: new columns on `ExternalDeliveryConfig` — `activeStrategy` (`LEGACY|ZONE_WEIGHT|DISTANCE_WEIGHT|HYBRID_MARGIN`, **default LEGACY = today's formula so live pricing doesn't silently change**; you flip it in admin) + `strategyParams Json`. Admin selector + params form added to the existing shipping admin page. Dispatcher used by pooled/external quote paths (after corridor override, task 6).
**Tests**: `scripts/check-shipping-strategies.mjs` — all three models against the task-4 package (3.5 billed kg), floors, rounding, param overrides.

### 9. Batch stops by ascending route distance
Migration: `Order.deliveryDistanceKm Float?` + index `(corridorId, deliveryDistanceKm)`. Computed **once** at corridor build/assignment (task-5 matrix: hub → each drop), persisted; `stopSequence` assigned by ascending distance (so existing rider/dispatch UIs keep working); rider assignment orders by `deliveryDistanceKm asc` with `stopSequence` fallback for legacy rows.
**Test**: pure sort/assignment helper test in `scripts/check-batch-ordering.mjs`.

### 10. Audit → AUDIT.md
End-to-end walk of: cart → quote → order creation (each payment × delivery type) → invoice → proof → fulfillment → corridor → delivery → completion; totals consistency across checkout UI / order record / invoice PDF / admin; races (stock, coupon, invoice seq); orphan states; client-side calcs that should be server-side. Findings listed with severity; unclear business logic **listed, not silently fixed**.

## Deliverables recap
- Migrations (5 folders): invoices+sequence, geocode/route caches, corridor rates + strategy config, order delivery distance, email threads.
- `.env.example` additions: `GOOGLE_MAPS_SERVER_API_KEY`, `ROAD_DISTANCE_FACTOR`, `WAREHOUSE_LAT/LNG`, `INBOUND_EMAIL_DOMAIN`, `RESEND_WEBHOOK_SECRET`.
- Tests: `check-order-totals`, `check-chargeable-weight`, `check-shipping-strategies`, `check-batch-ordering` (+ npm scripts).

## Manual actions YOU must do
1. **Run migrations**: `npx prisma migrate deploy` (uses `DIRECT_URL`).
2. **Google Cloud**: enable **Routes API** for your existing key or provide a new server-side key in `GOOGLE_MAPS_SERVER_API_KEY`; keep Geocoding enabled.
3. **Resend inbound**: verify a receiving subdomain (e.g. `inbound.thequalitymarket.com`) — add MX record `feedback-smtp…` per Resend dashboard; create webhook → `https://<app>/api/email/inbound`; put its signing secret in `RESEND_WEBHOOK_SECRET`; set `INBOUND_EMAIL_DOMAIN`.
4. **Choose the active shipping strategy** in admin once happy (stays LEGACY until you switch).
5. Optional: set `WAREHOUSE_LAT/LNG` if the origin isn't the current Kigali CBD hub constant.
