# Launch Guide — The Quality Market

Everything code-side is done and verified (build ✅ lint ✅ typecheck ✅). This guide
covers the remaining steps **only you can do** — accounts, credentials, store
listings, and business/legal items. Work top to bottom; each section says what it
unblocks and roughly how long it takes.

> **Quick path to a live web platform:** Sections 1–6 (about half a day, mostly
> waiting on DNS). Mobile (sections 7–9) can proceed in parallel.

---

## 0. Merge and push (5 min)

The `feat/external-seller-delivery` branch now contains the Supabase migration and
all launch hardening. Merge it:

```bash
git checkout main
git merge feat/external-seller-delivery
git push origin main
```

CI (`.github/workflows/ci.yml`) now runs lint, pricing tests, a production web
build, and a mobile install + typecheck on every push/PR — make sure the first run
is green before deploying.

---

## 1. Deploy the web app — Railway (recommended) (~45 min)

The repo now has a production `Dockerfile` that runs the custom server
(`server.js`), so **all realtime features work**: chat, live rider tracking, the
dispatch board. Railway and Render both auto-detect it. (Vercel is NOT suitable —
it can't run Socket.IO.)

1. Push the repo to GitHub (step 0).
2. Create an account at https://railway.app (Hobby plan ~$5/mo is enough to start).
3. **New Project → Deploy from GitHub repo** → select this repo. Railway detects
   the `Dockerfile` automatically.
4. In the service → **Variables**, add every variable from `.env.example` with
   production values (see sections 2–5 for where each key comes from). Critical ones:
   - `DATABASE_URL` / `DIRECT_URL` — Supabase (section 2)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — **production** keys (section 3)
   - `NEXT_PUBLIC_APP_URL` — your final public URL (see step 6 below; set it to the
     Railway-generated URL first, change after the domain is attached, then **redeploy** —
     `NEXT_PUBLIC_*` values are baked in at build time)
   - `NEXT_PUBLIC_SOCKET_ENABLED=true` ← realtime ON (unlike Vercel)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (section 4)
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (section 5)
   - `IMAGEKIT_*` (existing keys work; check usage limits for production)
   - `ADMIN_EMAIL` — your admin email(s), comma-separated
   - `ERROR_ALERT_EMAIL` and/or `ERROR_WEBHOOK_URL` — where crash alerts go (new;
     a Discord/Slack incoming-webhook URL works for the webhook)
5. Deploy. The container runs `prisma migrate deploy` automatically on start, so
   the database schema is applied on first boot — watch the deploy logs for
   `migrate` output and `Ready` from Next.js.
6. **Custom domain:** service → Settings → Networking → Custom Domain → enter
   e.g. `www.thequalitymarket.com`, then add the CNAME record it shows at your DNS
   provider. Wait for the certificate to issue. Update `NEXT_PUBLIC_APP_URL` to
   `https://www.thequalitymarket.com` and redeploy.
7. Smoke test: open the site → sign in → place a test order → open `/admin`.

**Alternative — Render:** same flow (New → Web Service → connect repo, Docker
runtime). **Alternative — VPS:** `docker build -t qm . && docker run --env-file
.env -p 3000:3000 qm` behind Caddy/Nginx for TLS.

---

## 2. Supabase production hardening (~15 min)

Your project (`rfocgurnyebeybekfpiw`) is already connected. In the
[Supabase dashboard](https://supabase.com/dashboard):

1. **Connection strings:** Project → Connect → ORMs → Prisma. Use the
   **Transaction pooler** string (port 6543, ends `?pgbouncer=true`) as
   `DATABASE_URL` and the direct string (port 5432) as `DIRECT_URL`.
2. **Backups:** Settings → Database → confirm daily backups are on. Strongly
   consider the Pro plan for **Point-in-Time Recovery** before real money flows —
   an accidental `DELETE` without PITR means losing up to a day of orders.
3. **Restore drill:** once, before launch, restore a backup into a scratch project
   and confirm the data is intact. A backup you've never restored is not a backup.
4. Check **Advisors** (Database → Advisors) and resolve anything red.

---

## 3. Clerk production instance (~30 min)

You are on test keys (`pk_test_…`). Test-mode auth must not go live.

1. In https://dashboard.clerk.com → your app → **Production** (create the
   production instance).
2. Add your production domain; Clerk gives you DNS records (CNAMEs) — add them at
   your DNS provider and wait for verification.
3. Copy the **production** `pk_live_…` / `sk_live_…` keys into Railway variables
   (and later into the mobile `.env` / EAS secrets: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`).
4. **Native/mobile:** Configure → Native applications → enable, and allow the
   redirect scheme `thequalitymarket` (from `mobile/app.json`).
5. **Sessions/security:** enable multi-factor authentication and turn it on for
   your own admin account (User & Authentication → Multi-factor). Ask all staff
   accounts (admin, logistics, financial) to enroll.
6. Sign up on production once, then set your own role to ADMIN: your `ADMIN_EMAIL`
   env fallback covers you initially; after first sign-in, set the DB role from
   `/admin/users` and keep `ADMIN_EMAIL` as a break-glass fallback only.

---

## 4. Resend — verified sending domain (~20 min + DNS wait)

Emails (order confirmations, store approvals, delivery updates, error alerts) land
in spam or fail unless the from-domain is verified.

1. https://resend.com/domains → **Add Domain** → e.g. `thequalitymarket.com`.
2. Add the DKIM/SPF DNS records Resend shows, wait for "Verified".
3. Set `RESEND_FROM_EMAIL=noreply@thequalitymarket.com` in Railway.
4. Send yourself a test (place an order) and check it arrives in the inbox, not spam.

---

## 5. Inngest production (~10 min)

Background jobs (welcome emails, payment-proof notifications, coupon expiry).

1. https://app.inngest.com → create/select the production environment.
2. Copy the production `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Railway.
3. After deploy, in Inngest → Apps → **Sync** the app URL:
   `https://<your-domain>/api/inngest`. Confirm the functions list appears.

---

## 6. Payment operations — MoMo & bank (business setup)

The launch flow is deliberately manual (customer pays → uploads proof → admin
approves in `/admin/payments` or the mobile Ops console). What only you can do:

1. **MTN MoMo merchant/pay code:** register a MoMo business/merchant account with
   MTN Rwanda, then enter the pay code + instructions in **Admin → Payment
   settings** so checkout shows real payment instructions.
2. **Bank account details:** same page, for bank-transfer instructions.
3. **Define the review procedure** (write it down for staff):
   - Who checks `/admin/payments` and how often (aim: within 1 hour, 8:00–20:00)?
   - Verification rule: proof screenshot **must** be matched against the actual
     MoMo/bank statement before approving — screenshots are trivially fakeable.
   - Rejections must carry a note (the customer gets it by email).
4. **Payout cadence:** decide the schedule for settling seller payouts
   (`/admin/payouts`), e.g. weekly Fridays. The system records payouts; the money
   movement is manual until the MoMo Disbursement API is integrated.
5. **Later (post-launch):** apply for API access at https://momodeveloper.mtn.com
   (Collections for customer payments, Disbursements for seller payouts). The code
   has a marked integration point in `lib/pooledDeliveryPayout.js`.

---

## 7. Mobile — EAS setup & Android launch (~2–4 h + Google review)

Prereqs: an [Expo account](https://expo.dev) (free) and a
[Google Play Console](https://play.google.com/console) account ($25 one-time).

1. **EAS init:**
   ```bash
   npm install -g eas-cli
   cd mobile
   eas login
   eas init        # links the project, writes extra.eas.projectId into app.json
   ```
2. **App icon + splash:** replace the placeholder assets referenced in
   `mobile/app.json` — you need a 1024×1024 icon, an Android adaptive-icon
   foreground, and a splash image. (Ask me to wire them into `app.json` once you
   have the image files.)
3. **Google Maps key (Android):** in Google Cloud Console, create an API key with
   **Maps SDK for Android** enabled, restrict it to your app's package name, set it
   as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (EAS: `eas env:create`).
4. **Push notifications (FCM):** create a Firebase project for the app package,
   then `eas credentials` → Android → upload the FCM V1 service-account key.
   Without this, production push silently fails.
5. **Production env for builds:** set the `EXPO_PUBLIC_*` variables (API URL =
   your production domain, production Clerk publishable key, `EXPO_PUBLIC_SOCKET_ENABLED=true`)
   as EAS environment variables so cloud builds bake them in.
6. **Build:**
   ```bash
   eas build --profile production --platform android
   ```
7. **Play Console:** create the app listing — screenshots (take them from the
   preview build), description, category, **privacy policy URL** (host your policy
   page, e.g. `https://<domain>/policy`), and the **Data safety** form (declare:
   location [delivery tracking], personal info [name/email/phone], photos
   [payment proofs/products]).
8. **Internal testing first:** upload the build to the Internal testing track,
   test the full flow on real devices for a few days, then promote to Production.
   First-time review typically takes 1–7 days.

## 8. Mobile — iOS (~apply now, finish later)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/year — enrollment can take days, start early).
2. `eas build --profile production --platform ios` (EAS manages certificates).
3. `eas submit --platform ios` → TestFlight → internal testers → App Store review.
4. App Store listing needs the same assets + privacy "nutrition labels" as Play.

iOS can lag the Android launch — the web app covers iPhone users meanwhile.

---

## 9. OSRM routing (optional but recommended before delivery volume grows)

Live ETAs/route lines default to the public OSRM demo server (rate-limited, no
SLA). Pricing falls back to straight-line distance. To go production-grade, run
OSRM with the Rwanda map on any small VM (or a second Railway service):

```bash
wget https://download.geofabrik.de/africa/rwanda-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-contract /data/rwanda-latest.osrm
docker run -d -p 5000:5000 -v $(pwd):/data osrm/osrm-backend osrm-routed /data/rwanda-latest.osrm
```

Then set `OSRM_URL=http://<host>:5000` and `DELIVERY_OSRM_PRICING=true`.

---

## 10. Legal & compliance (Rwanda) — consult before real revenue

Only you can do these; none are blockers for a soft launch but don't defer them long:

1. **Business registration** (RDB) and a TIN for the platform entity itself.
2. **RRA / EBM e-invoicing:** the platform generates PDF invoices, but Rwanda
   requires EBM-certified invoices for VAT. Talk to an accountant about whether
   your model (marketplace commission + delivery fees) needs EBM integration and
   from what revenue level.
3. **Terms & privacy pages:** `/terms` and `/policy` exist — have someone review
   that they match reality (escrow wording, refunds, returns, data collection
   including location tracking).
4. **Rider employment:** riders are salaried staff — confirm contracts, insurance,
   and vehicle liability are in order.

---

## 11. Launch-week operations checklist

- [ ] Staff roles assigned in `/admin/users`: who is ADMIN, LOGISTICS_MANAGER, FINANCIAL_OPERATIONAL
- [ ] Payment-proof review rota agreed (target: < 1 h during business hours)
- [ ] Dispatch procedure: when is "Batch now" run each day, who assigns riders
- [ ] At least one full **production** dry run: real order → real MoMo payment →
      proof approved → sorted → batched → dispatched → OTP delivery → payout record
- [ ] Error alerts verified: trigger a test error, confirm the email/webhook arrives
- [ ] `ERROR_ALERT_EMAIL` inbox is one somebody actually reads
- [ ] Backups confirmed + restore drill done (section 2)
- [ ] Uptime monitor pointed at `https://<domain>/api/health` (free: UptimeRobot / Better Stack)
- [ ] Announce 🎉

---

## What was already implemented for you (no action needed)

- **Error monitoring** — every uncaught server error is logged as structured JSON
  and can alert via email (Resend, throttled) and/or webhook; mobile crashes report
  to `/api/client-error` (`lib/errorReporting.js`, `instrumentation.js`,
  `mobile/src/lib/crashReporting.ts`).
- **Security headers** (clickjacking, MIME-sniffing, HSTS, referrer, permissions).
- **Coupon race fix** — usage limits can no longer be exceeded by concurrent checkouts.
- **Dockerfile** for full-featured deployment (Next.js + Socket.IO + auto-migrations).
- **CI** — lint, pricing tests, production build, mobile clean-install + typecheck.
- **Mobile dependency reconciliation** — `npm ci`/EAS builds now resolve cleanly
  (TypeScript 5.9 + @types/react 19); typecheck and lint pass with zero errors.
