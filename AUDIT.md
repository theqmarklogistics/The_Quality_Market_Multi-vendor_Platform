# AUDIT — End-to-end logic review (2026-07-15)

Scope: cart → checkout → payment (MoMo / Bank Transfer) → invoice → fulfillment →
corridor/batch → delivery → completion, plus totals consistency across checkout UI,
order record, invoice PDF, customer view, and admin view. Method: code walk of every
route/lib in those flows + the six unit suites (`npm run test:*`) + a clean
production build.

Legend: **FIXED** = corrected in this work order · **OPEN** = listed, needs your
decision or a follow-up · severity H/M/L.

## Fixed in this work order

| # | Sev | Issue | Fix |
|---|-----|-------|-----|
| F1 | H | **Cancel ↔ expiry stock double-restore race.** `POST /api/orders/[id]/cancel` restored stock from a stale `PENDING` read and only then flipped the status, so a cancel racing the lazy expiry sweep (which also restores stock) could increment the same stock twice → oversell. | Cancel now claims the order atomically (`updateMany WHERE paymentStatus='PENDING'` → only the winner restores stock), the same pattern `lib/expireOrders.js` documents. [app/api/orders/[id]/cancel/route.js](app/api/orders/%5Bid%5D/cancel/route.js) |
| F2 | H | **Invoice numbering didn't exist** — invoices were ad-hoc PDFs keyed by order id; nothing sequential, no uniqueness, nothing persisted. | `Invoice` table + Postgres sequence `invoice_number_seq`; number drawn and inserted in a single statement (race-safe under PgBouncer); unique `orderId` makes issuance idempotent. [lib/invoices.js](lib/invoices.js) |
| F3 | M | **Delivery pricing used straight-line distance by default** (haversine; OSRM only behind an env flag), under-charging vs. real road effort. | Provider chain: RouteCache (DB) → Google Routes API (field-masked) → OSRM (opt-in) → haversine × `ROAD_DISTANCE_FACTOR` (1.4, logged `[distance-fallback]`). [lib/distanceProvider.js](lib/distanceProvider.js) |
| F4 | M | **Every quote re-billed the Geocoding API** for the same village/sector strings; no cache existed. | `GeocodeCache` keyed by normalized address; `RouteCache` keyed by rounded coord pair (fallback estimates deliberately NOT cached so paid APIs get retried). |
| F5 | M | **Sellers could attach a shipping fee to a Standard order after checkout** (`PATCH /api/store/orders/[id]` `shippingCost` branch), contradicting the new free-Standard policy. | Nonzero fees now rejected for non-pooled orders. [app/api/store/orders/[id]/route.js](app/api/store/orders/%5Bid%5D/route.js) |
| F6 | L | Role-invite email rendered the brand header twice (copy/paste duplication in `lib/email.js`). | Removed. |
| F7 | L | Checkout/quote totals math lived inline in two routes and could drift. | Extracted to [lib/orderTotals.js](lib/orderTotals.js), used by both `POST /api/orders` and `/api/orders/shipping-quote`, unit-tested. |

## Verified sound (no action)

- **Totals consistency:** the client `OrderSummary` figure is display-only; the server
  recomputes subtotal − coupon + shipping at order creation, and the invoice PDF and
  admin views read the persisted `total`/`shippingCost`. One authoritative path.
- **Stock reservation:** guarded raw-SQL decrement with explicit rollback; coupon
  claim is a guarded increment (`usedCount < maxUses`). Both are race-safe reads-
  don't-lie patterns; verified the rollback paths cover every abort branch.
- **Escrow lifecycle:** `HELD` at pooled checkout → `RELEASED` on OTP verify
  (`verify-otp`) or proof-photo confirm → `REFUNDED` via staff resolve route. No
  dangling state found.
- **OTP hardening:** attempts + lockout fields enforced in verify-otp.
- **Expiry sweep:** claim-before-restore, throttled, crash direction is
  under-restore (never oversells) — documented and acceptable.
- **Order GET / hero / geocode / route caches** degrade gracefully if the new
  tables don't exist yet (caches skip; orders GET catches) — but see O1.

## Open items — decide or schedule

| # | Sev | Issue | Recommendation |
|---|-----|-------|----------------|
| O1 | H | **Migrations must be deployed before the new features are exercised.** Auto-invoicing (F2), email threads, corridor rates, and `deliveryDistanceKm` all need the five new migration folders. Until then: invoice creation logs an error (order itself is unaffected), inbox APIs 500, corridor rate fields don't persist. | Run `npx prisma migrate deploy` as the first deploy step. |
| O2 | M | **Coupon usage is never released.** `usedCount` is claimed at checkout but not decremented when the order is cancelled or expires, so a limited coupon can exhaust itself on abandoned orders. | If unintended, decrement inside the cancel/expiry claim winners (both are now atomic, so a guarded `usedCount - 1` is safe). Left untouched — business call. |
| O3 | M | **No tax/VAT is modeled anywhere** (schema, checkout, invoice). The work order assumed tax recomputation; there is none to recompute. If EBM/VAT compliance is needed for Rwanda, it must be designed in deliberately (rate config, tax lines on Invoice, EBM receipt hooks). | Confirm whether prices are VAT-inclusive; if invoices must show VAT, treat as a new feature. |
| O4 | M | **Zone×weight tariff is no longer charged at shop checkout** (Standard is free), leaving `calculateOrderShippingForStore` caller-less for shop orders. The `WeightShippingRate` table still powers strategy Model A for pooled/external quotes, so it is NOT dead — but the admin "Shipping Configuration" page copy still says it prices Full-Managed store checkout. | Keep the table (Model A uses it); update the page copy when convenient. |
| O5 | L | **`STRIPE` / `AIRTEL_MONEY` enum values are unreachable** (checkout only offers Bank Transfer + MoMo). Harmless dead states. | Remove from the enum in a future migration, or wire them up. |
| O6 | L | **Order.status vs paymentStatus overlap:** an EXPIRED/CANCELLED payment leaves `status = ORDER_PLACED`. Customer lists key off paymentStatus so nothing breaks, but admin status filters can look inconsistent. | Consider a `CANCELLED` order status set by the same claim writes. |
| O7 | L | **Auto-invoice email is fire-and-forget:** if Resend is down, the invoice row exists but `invoiceStatus` stays null. This is intentional (an email outage must not block checkout); the admin Invoices page shows it as *Pending* for manual re-send, and the customer has the Download button. | None — behaviour is by design; noted for operators. |
| O8 | L | **Corridor rate matching is by sector-name string** against the corridor's free-form `areas` labels (case-insensitive exact match). A typo in `areas` silently falls through to strategy pricing. | Enter official NISR sector names in corridor areas (the same names the address dropdowns produce). |
| O9 | L | **RouteCache never expires.** Road distances are stable, but if roads change or you want fresh traffic-aware durations, purge periodically: `DELETE FROM "RouteCache" WHERE "updatedAt" < now() - interval '90 days';` | Optional maintenance task. |
| O10 | L | **Nearest-first stop ordering (task 9) is not route-optimal.** Sorting by ascending hub→drop distance can produce a longer *total* route than the previous nearest-neighbour chaining (e.g. two drops equidistant in opposite directions). Implemented exactly as specified; corridor pricing still uses the true routed distance, so fees are unaffected. | If riders report zig-zag routes, revisit (e.g. distance-sorted within nearest-neighbour clusters). |
| O11 | L | **Checkout stock reservation can orphan decrements** if the server crashes between the raw-SQL decrement and order insert (no transaction possible over PgBouncer; rollback is best-effort in-process). Pre-existing design; extremely narrow window; direction is under-sell (safe), but stock could need a manual bump after a crash. | Acceptable; consider a reconciliation script if it ever bites. |
| O12 | L | **Mobile app** consumes the same APIs (hero, shipping-quote, orders), so free-Standard and the removed "Starts from" badge flow through automatically — but the mobile checkout copy hasn't been re-read end-to-end in this pass. | Give the mobile checkout one visual pass on the next EAS build (remember the npm-10 lockfile rule). |

## Test & build status

- `test:order-totals`, `test:chargeable-weight`, `test:shipping-strategies`,
  `test:batch-ordering`, `test:pricing`, `test:delivery-pricing` — **all passing**.
- `npx prisma validate` ✔ · `npx prisma generate` ✔ · `npx next build` ✔ (no errors).
- ESLint clean on every touched file (one pre-existing warning in
  `app/admin/invoices/page.jsx` left as-is).
