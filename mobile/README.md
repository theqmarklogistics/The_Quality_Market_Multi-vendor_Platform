# The Quality Market — Mobile App

React Native (Expo) companion app for The Quality Market platform. It reuses the
existing Next.js backend (`../`) as-is: same REST API (`app/api/**`), same Clerk
auth, same Socket.IO realtime. This directory is a standalone Expo project.

See the full plan: `../../.claude/plans/i-would-like-to-concurrent-pearl.md` (or the
plan summary). **Phases 0 (foundations), 1 (customer core), 2 (tracking, chat, push),
3 (rider console), 4 (seller & external-seller), and 5 (admin & logistics)** are built.

## What's in Phase 0

- Expo Router app scaffold (TypeScript), Android-first config.
- Clerk auth (`@clerk/clerk-expo`) with a secure token cache (`expo-secure-store`):
  email/password **sign-in** and **sign-up + email verification**.
- A typed `apiClient` (`src/api/client.ts`) that injects the Clerk session JWT as
  `Authorization: Bearer <token>` on every request — no backend auth changes needed.
- Redux Toolkit store wired.
- Ported shared enums/constants from the web's `lib/constants.js` (`src/constants`).

## What's in Phase 1 (customer core)

- **Home** tab (`app/(tabs)/index.tsx`): service landing — auto-rotating ad carousel fed
  by the admin-managed `/api/hero` slots (`src/api/hero.ts`), explicit service sections
  with branded illustrations (`src/components/BrandArt.tsx`) and CTAs for shopping, the
  delivery service, and opening a store (web `/create-store` via the in-app WebView),
  plus a best-selling rail.
- **Shop** tab (`app/(tabs)/shop.tsx`): searchable, category-filtered, paginated product
  grid (`/api/product`, `/api/categories`).
- **Product detail**: gallery, wholesale pricing note, reviews, add-to-cart.
- **Cart** tab: quantity steppers, per-line + subtotal, live tab badge. The cart map
  (`{productId: qty}`) syncs to `/api/cart` (ported `cartSlice`).
- **Checkout**: address select/add (with GPS pin — `expo-location`), delivery method
  (standard vs. Kigali pooled + landmark/pin), payment method (MoMo / bank transfer),
  coupon verification (`/api/coupon`), and order placement (`/api/orders`).
- **Order confirmation**: payment instructions (MoMo pay code from `/api/payment-config`).
- **Orders** tab: order list, payment-proof upload (`expo-image-picker` →
  `/api/orders/payment-proof`), pooled-delivery status + OTP, and star ratings for
  delivered items (`/api/rating`).

> Totals on the cart/checkout are **estimates**; the server computes the authoritative
> total (shipping, commission, pooled-delivery fee) at order creation, shown in Orders.

## What's in Phase 2 (tracking, chat & push)

- **Live delivery tracking** (`app/track/[orderId].tsx`): `react-native-maps` with rider
  + recipient markers and the OSRM route line, a status timeline, ETA, the delivery OTP,
  rider contact (tap to call), and opt-in **share-my-location**. Live over Socket.IO
  (`rider-location-update`, `delivery-status-update`) with a 15s polling fallback. Reached
  via **Track delivery** on pooled orders.
- **Chat** (`app/(tabs)/chat.tsx` + `app/conversation/[id].tsx`): conversations list
  with unread badges, realtime thread (`new-message`), **Message support** (admin), and
  **Message seller** from an order or product page (`/api/chat/**`).
- **Push notifications** (`expo-notifications`): the device registers its Expo token on
  sign-in (`/api/push/register`); delivery-status changes push to the customer and tapping
  deep-links into tracking. Backend additions: `PushToken` model, the register route, and
  `lib/push.js` wired into `lib/deliveryNotifications.js` alongside the existing Resend email.

### Backend setup for Phase 2

The push feature adds a `PushToken` table. From the repo root, run the migration once:

```bash
npx prisma migrate dev --name add_push_tokens   # dev
# or, in CI/prod after the migration is committed:
npx prisma migrate deploy
```

Realtime (tracking + chat) requires the backend to run via the custom server
(`npm start` → `node server.js`) with `NEXT_PUBLIC_SOCKET_ENABLED=true`. On serverless,
the app falls back to polling for tracking; chat updates require a manual refresh.

## What's in Phase 4 (seller & external-seller)

Two role-gated consoles, both reusing the existing backend as-is (**no server changes** —
all endpoints already exist). They surface from the **Account** tab when `GET /api/me/role`
returns the matching role (seller for `SELLER`/`ADMIN`, delivery partner for
`EXTERNAL_SELLER`/`ADMIN`), the same pattern as the rider console.

- **Seller console** (`app/store/**`, `src/api/store.ts`):
  - **Dashboard** (`/store`): net earnings, product/order/review counts, a low-stock alert,
    recent reviews, and shortcuts. The store API still enforces an approved, active store
    (`authSeller`); `GET /api/store/is-seller` drives a friendly "pending / rejected /
    inactive" state when it isn't.
  - **Products** (`/store/products`): paginated, searchable, status-filtered list with
    quick stock toggle (`/api/store/stock-toggle`), delete, and edit.
  - **Add / edit product** (`/store/product-form`): up to 4 images (`expo-image-picker`),
    **AI listing** — the first photo is sent to `/api/store/ai` to suggest a name +
    description — web-parity validation, and multipart create/update (`/api/store/product`).
    Creating or editing resubmits the product for admin approval.
  - **Orders** (`/store/orders`): fulfil orders — set a shipping fee, choose the pooled
    intake method (hub drop-off / +1,000 RWF driver sweep), and advance status
    (Processing → Shipped with an optional public note) via `PATCH /api/store/orders/[id]`.
  - **Payouts** (`/store/payouts`): received / pending totals and the payout history.
  - **Seller chat** reuses the existing **Messages** tab — a seller already sees the STORE
    conversations they participate in (`/api/chat/**`); the dashboard links to it.

- **External-seller (delivery partner) console** (`app/external/**`, `src/api/externalDelivery.ts`):
  - **My deliveries** (`/external`): redeemable pooling-credit banner, MoMo pay instructions,
    and each booked delivery with live status + payment state. Per delivery: **track** live
    (Phase-2 map), **share** the public tracking link (RN `Share`), view an in-app **label**
    (QR + recipient/sender/OTP) with a "Download official PDF" action, and **upload payment
    proof** (`/api/orders/payment-proof`).
  - **Book a delivery** (`/external/book`): recipient + pinned drop location (`expo-location`),
    pickup method, package weight/dims, payment method, a **live fee quote**
    (`/api/delivery/external/quote`, distance×weight) with pooling-credit redemption, then
    `POST /api/delivery/external` into the Kigali pooled pipeline.

> **No new dependencies — nothing to install for Phase 4.** The label PDF is fetched with the
> Clerk bearer token via `expo-file-system` `downloadAsync` (iOS opens the share sheet; Android
> saves to the app cache — share the tracking link to send it on). Everything else uses
> packages already installed in earlier phases.
>
> `package.json` and `package-lock.json` are reconciled to one coherent Expo SDK 56 tree
> (verified in CI), so a clean `npm ci` — including the one EAS Build runs — reproduces the
> working install.

## What's in Phase 5 (admin & logistics)

An **Ops console** for staff, role-gated and reusing the existing backend as-is
(**no server changes** — every endpoint already exists). It surfaces from the
**Account** tab when `GET /api/me/role` returns `ADMIN` (full console) or
`LOGISTICS_MANAGER` (dispatch board only), mirroring `authAdmin` / `authLogistics`.

- **Ops home** (`/admin`, `src/api/admin.ts`): admins see headline figures (orders,
  revenue, stores) and a *needs-attention* grid (payment proofs, store approvals, new
  orders, pending products, unread chats, invoice requests) from `/api/admin/dashboard`,
  with shortcuts into the actionable queues. Logistics managers see only the dispatch
  board entry (the dashboard endpoint is admin-only, so it's skipped for them).
- **Dispatch board** (`/admin/dispatch`): the mobile logistics board for a chosen day
  (prev/next day nav). Shows each delivery **corridor** with its status, assigned rider
  and ordered stops, plus the key dispatcher actions — **run the auto-batcher**
  (`/api/logistics/batch`) to sweep waiting pooled orders into routes, **assign/reassign
  a rider** (`/api/logistics/riders` + `…/assign-rider`), and **advance the lifecycle**
  (mark ready → dispatch → complete, `…/corridors/[id]/status`). A banner counts orders
  still waiting to batch (`/api/logistics/orders/poolable`). Tap-to-call recipients and
  rider. Live over the **logistics room** (`join-logistics-room` → `corridor-update`)
  with a focus/pull-to-refresh fallback.
- **Payment review** (`/admin/payments`): the proof queue (Submitted / Approved /
  Rejected) from `/api/admin/payments`. A detail sheet shows the uploaded proof image
  (tap to open full-size) and order summary; **Approve** marks the order paid, **Reject**
  requires a note that's emailed to the customer.
- **Store approvals** (`/admin/stores`): stores awaiting a decision (`/api/admin/approve-store`).
  A detail sheet shows the store profile (owner, contacts — tap to call/email, address);
  **Approve** activates the store and emails a contract, **Reject** emails a reason.

> **No new dependencies for Phase 5.** Everything uses packages already installed in
> earlier phases.

## Prerequisites

- Node.js 22.12+ and npm.
- The backend running and reachable (see `../README` / `../.env`). For realtime later,
  run the backend via the custom server (`npm start` → `node server.js`), not Vercel.
- A physical Android device with **Expo Go** (quickest) or an Android emulator. For
  background GPS / push (Phase 2–3) you'll need a **dev client** via EAS Build.

## Setup

```bash
cd mobile
npm install
cp .env.example .env      # then edit .env
```

Set in `.env`:

- `EXPO_PUBLIC_API_URL` — the backend origin. On a **physical device** use your
  computer's LAN IP, not `localhost` (e.g. `http://192.168.1.20:3000`).
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — the **same** Clerk publishable key the web app
  uses (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `../.env`).
- `EXPO_PUBLIC_CURRENCY_SYMBOL` — `RWF`.
- `EXPO_PUBLIC_SOCKET_ENABLED` — `true` to enable realtime tracking/chat (needs the
  backend on `node server.js`); `false` falls back to polling.
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — Android Maps SDK key for the tracking map.

## Run

```bash
npm start          # then press "a" for Android, or scan the QR with Expo Go
# or
npm run android
```

Type-check without running:

```bash
npm run typecheck
```

## Verifying

1. Launch the app → land on **Sign in**. Sign in (or create an account — verifies by
   email code). On success you reach the **Shop** tab with products loaded.
   - If products don't load: `EXPO_PUBLIC_API_URL` is wrong/unreachable (use the LAN IP
     on a device; ensure the backend is running).
   - If auth fails: the Clerk key in `.env` doesn't match the backend's Clerk instance.
2. **Shop**: search, switch categories, scroll to paginate, open a product, **Add to cart**.
3. **Cart**: adjust quantities (badge updates), **Proceed to checkout**.
4. **Checkout**: add an address (pin location), choose delivery + payment, optionally apply
   a coupon, **Place order** → see the confirmation + payment instructions.
5. **Orders**: the new order appears; **Upload payment proof** (pick an image). After an
   admin marks an order DELIVERED on the web, **Rate** a product.
6. **Account** → **Sign out** returns you to Sign in (token cache cleared).

### Phase 2 checks (realtime + push)

Run the backend via `node server.js` with `NEXT_PUBLIC_SOCKET_ENABLED=true`, and build a
**dev client** (`eas build --profile development`) — Expo Go can't deliver remote push.

7. **Tracking**: on a pooled (KIGALI_POOL) order, tap **Track delivery**. With a rider
   dispatched and broadcasting on the web/dispatch board, the rider marker and status
   update live; **Share my live location** drops your pin for the rider.
8. **Chat**: **Messages** tab → **Message support**, send a message; replying from the web
   admin chat appears in realtime. **Message seller** works from an order or product page.
9. **Push**: after `prisma migrate dev`, sign in on a device (grant notifications), then
   advance a delivery on the web (dispatch / mark arriving / confirm). A push arrives and
   tapping it opens the tracking screen.

### Phase 4 checks (seller & external-seller)

10. **Seller**: sign in as an approved seller (or admin) → **Account** → **Seller console**.
    The dashboard shows metrics + low stock. **Products** → **Add product**: pick a photo
    (AI fills name/description), complete the form, submit; it appears as *Pending*. Toggle
    stock, edit, delete. **Orders**: open an order, set a shipping fee, choose the pooled
    intake method, mark Processing → Shipped. **Payouts** lists your payout history.
11. **External-seller**: sign in as a delivery partner (enable on the web, or admin) →
    **Account** → **My deliveries** → **Book a delivery**: fill the recipient, **Use my
    location** to pin the drop, add a weight, watch the **live fee quote** (with credit), and
    book. Back on the list, **upload payment proof**, open the **Label** (QR + details), and
    **Share** the tracking link.

### Phase 5 checks (admin & logistics)

12. **Admin**: sign in as an admin → **Account** → **Admin console**. The dashboard shows
    figures + a needs-attention grid. Tap **Payment review**, open a submitted proof, view
    the image, **Approve** (the order flips to paid) or **Reject** with a note. Tap **Store
    approvals**, open a pending store, **Approve** (it activates) or **Reject** with a reason.
13. **Dispatch**: from the console (or as a `LOGISTICS_MANAGER`) open the **Dispatch board**.
    With pooled orders waiting, **Auto-batch** builds routes. Open a corridor, **Assign** a
    rider, **Dispatch** it (customers are notified, stops go in transit), then **Mark
    completed**. Use the day arrows to view other days. With the realtime server running it
    refreshes live; otherwise pull to refresh.

## Notes / gotchas

- **Clerk dashboard**: ensure the native app's redirect scheme (`thequalitymarket`) is
  allowed and Expo/native is enabled for your Clerk instance.
- **EAS**: `eas.json` is preconfigured for an Android `development`/`preview` (APK) build.
  Run `eas build:configure` and set `extra.eas.projectId` in `app.json` before your first
  cloud build. A dev client is required for native modules added in later phases
  (`react-native-maps`, `expo-location` background, `expo-notifications`).
- **`localStorage` warning**: none — this is RN; tokens live in `expo-secure-store`.

## Project layout

```
mobile/
  app/                     # Expo Router routes
    _layout.tsx            # Clerk + Redux + API bridge + auth gate + root Stack
    index.tsx              # entry redirect
    (auth)/                # sign-in / sign-up
    (tabs)/                # Home, Shop, Cart, Orders, Account (+ hidden Messages route)
    product/[id].tsx       # product detail (+ message seller)
    checkout.tsx           # checkout
    address/new.tsx        # add address (GPS pin)
    order-confirmation.tsx # payment instructions
    track/[orderId].tsx    # live delivery tracking (map)
    conversation/[id].tsx  # chat room
    rider/index.tsx        # rider console (Phase 3)
    store/                 # seller console: dashboard, products, product-form, orders, payouts
    external/              # external-seller: deliveries dashboard + booking
    admin/                 # ops console: home, dispatch board, payment review, store approvals
  src/
    api/                   # apiClient, auth bridge, typed endpoint modules + types
    auth/                  # Clerk secure-store token cache
    realtime/              # Socket.IO client + useRealtimeRoom hook
    push/                  # Expo push registration + PushManager (tap routing)
    store/                 # Redux store, cart slice, typed hooks, CartSync
    components/            # ProductCard, RatingModal, DeliveryTimeline, ErrorBoundary, ui primitives
    constants/             # enums ported from web lib/constants.js
    lib/                   # client-side pricing helpers
    theme.ts               # shared design tokens
```

## Roadmap

1. **Phase 0** — Foundations. ✅ Done.
2. **Phase 1** — Customer core: storefront, product detail, cart, checkout, orders,
   payment-proof upload, reviews. ✅ Done.
3. **Phase 2** — Live tracking (react-native-maps + Socket.IO), chat, push. ✅ Done.
4. **Phase 3** — Rider console (background GPS, OTP, proof-of-delivery camera). ✅ Done.
5. **Phase 4** — Seller console (dashboard, products + AI, orders, payouts) & external-seller
   (delivery booking + quote, credit, label, proof). ✅ Done.
6. **Phase 5** — Admin & logistics ops console (dashboard, dispatch board with auto-batch +
   rider assignment + corridor lifecycle, payment-proof review, store approvals). ✅ Done.
7. **Phase 6** — Hardening + iOS launch. 🚧 In progress.
   - **Done:** app-wide **error boundary** (`src/components/ErrorBoundary.tsx`, wired in
     `app/_layout.tsx`) so a render crash shows a recovery screen instead of white-screening;
     iOS **camera** permission string for proof-of-delivery / product photos; iOS **simulator**
     build profiles in `eas.json` (dev + preview, no Apple credentials needed to start testing).
   - **Remaining (needs an Apple Developer account / assets, can't be done from code alone):**
     run `eas init` to set `extra.eas.projectId`; add real app **icon + splash** assets;
     a credentialed **iOS device build** + TestFlight; broader QA polish (per-screen retry
     states, slow-network handling) and a crash reporter (e.g. Sentry) in the error boundary.
