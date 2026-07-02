# Launch Guide — The Quality Market

Everything code-side is done and verified (build ✅ lint ✅ typecheck ✅). This guide
covers the remaining steps **only you can do** — accounts, credentials, store
listings, and business/legal items. Work top to bottom; each section says what it
unblocks and roughly how long it takes.

> **Quick path to a live web platform:** Sections 1–6 (about half a day, mostly
> waiting on DNS). Mobile (sections 7–9) can proceed in parallel.

---

## Cost reality — what's genuinely free vs. not

This plan uses **free tiers only**. Here's the honest picture so nothing surprises
you. Free-tier terms change often — verify the current numbers when you sign up.

| Service | Free tier | The catch (read this) |
|---|---|---|
| **Render** (web host) | 1 web service, 750 hrs/mo (enough for 24/7) | **Sleeps after 15 min idle**; first request after sleep cold-starts in ~1 min. Fine at launch volume; upgrade ($7/mo) when you have steady traffic. |
| **Supabase** (database) | 500 MB DB, daily backups | **Pauses after 7 days of no activity** (real traffic prevents this); **no point-in-time recovery** on free — you can lose up to a day on a bad delete. |
| **Clerk** (auth) | 10,000 monthly active users | None meaningful for launch. Genuinely generous. |
| **Resend** (email) | 3,000 emails/mo, **100/day** | The 100/day cap is the real limit — order + delivery + store emails add up. Watch it; upgrade when you approach it. |
| **Inngest** (jobs) | ~50k steps/mo | Fine for launch. |
| **ImageKit** (images) | ~20 GB bandwidth/mo | You already use it; watch bandwidth. |
| **OSRM** (routing) | Public demo server | Rate-limited, no SLA. Keep pricing on straight-line distance (already the default). Good enough to launch. |
| **UptimeRobot** (monitoring) | 50 monitors, 5-min checks | None. |
| **Error alerts** | Discord/Slack webhook | Free. Use a webhook instead of paid error tools. |
| **Google Play** | — | **$25 one-time, unavoidable** for the Play Store. Free workaround: distribute the Android APK directly (section 7). |
| **Apple App Store** | — | **$99/year, unavoidable.** No free workaround for iOS distribution. Skip iOS at launch; the web app covers iPhone users. |
| **Google Maps** (mobile map) | $200/mo credit (covers launch) | **Requires a billing account / card on file** even though the credit covers usage. The *web* tracking map uses free OpenStreetMap — no key needed. |

**Bottom line:** the entire **web platform launches for $0**. The only unavoidable
cash costs are app-store fees *if* you want native apps in the stores ($25 Android /
$99-yr iOS) — and you can launch Android free via direct APK and defer both.

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

## 1. Deploy the web app — Render free tier (~45 min)

The repo has a production `Dockerfile` that runs the custom server (`server.js`),
so **all realtime features work** on Render: chat, live rider tracking, the
dispatch board. (Vercel is NOT suitable — it can't run Socket.IO, *and* its free
"Hobby" tier forbids commercial use. Render's free web service allows commercial
use.)

> **The one free-tier tradeoff:** a Render free service **sleeps after 15 minutes
> of no traffic**, and the next visitor waits ~1 minute for it to wake. At launch
> volume this is survivable; the app also polls as a fallback so realtime features
> reconnect after wake. The moment you have steady traffic, upgrade to the $7/mo
> Starter instance to remove the sleep. (A free trick to reduce sleeping: point the
> UptimeRobot monitor from section 11 at `/api/health` every 5 min — it keeps the
> service warm during the day. Don't rely on it as a guarantee.)

1. Push the repo to GitHub (step 0).
2. Create a free account at https://render.com.
3. **New → Web Service → Build and deploy from a Git repository** → connect this
   repo. Render detects the `Dockerfile`. Set **Instance Type = Free**.
4. Under **Environment**, add every variable from `.env.example` with production
   values (see sections 2–5 for where each key comes from). Critical ones:
   - `DATABASE_URL` / `DIRECT_URL` — Supabase (section 2)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — **production** keys (section 3)
   - `NEXT_PUBLIC_APP_URL` — your final public URL (set it to the
     `*.onrender.com` URL Render generates first; change it after the domain is
     attached, then **redeploy** — `NEXT_PUBLIC_*` values are baked in at build time)
   - `NEXT_PUBLIC_SOCKET_ENABLED=true` ← realtime ON
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (section 4)
   - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (section 5)
   - `IMAGEKIT_*` (existing keys work; watch the free bandwidth cap)
   - `ADMIN_EMAIL` — your admin email(s), comma-separated
   - `ERROR_ALERT_EMAIL` and/or `ERROR_WEBHOOK_URL` — where crash alerts go
     (a free Discord/Slack incoming-webhook URL works for the webhook)
5. Deploy. The container runs `prisma migrate deploy` automatically on start, so
   the database schema is applied on first boot — watch the deploy logs for
   `migrate` output and `Ready` from Next.js.
6. **Custom domain (optional, and free if you already own a domain):** service →
   Settings → Custom Domains → add e.g. `www.thequalitymarket.com`, then add the
   CNAME record it shows at your DNS provider. Wait for the free certificate to
   issue. Update `NEXT_PUBLIC_APP_URL` and redeploy. *You can also launch on the
   free `*.onrender.com` URL and add a domain later.*
7. Smoke test: open the site → sign in → place a test order → open `/admin`.

**Free alternatives if Render's sleep bothers you:** **Koyeb** and **Fly.io** both
have small free allowances that can run this Docker image (terms shift — check
current limits). **Self-host for free** only if you already have an always-on
machine: `docker build -t qm . && docker run --env-file .env -p 3000:3000 qm`
behind Caddy (free auto-TLS).

---

## 2. Supabase production hardening (~15 min)

Your project (`rfocgurnyebeybekfpiw`) is already connected. In the
[Supabase dashboard](https://supabase.com/dashboard):

1. **Connection strings:** Project → Connect → ORMs → Prisma. Use the
   **Transaction pooler** string (port 6543, ends `?pgbouncer=true`) as
   `DATABASE_URL` and the direct string (port 5432) as `DIRECT_URL`.
2. **Backups (free tier):** the free plan keeps **daily** backups but has **no
   point-in-time recovery** — a bad `DELETE` can cost up to a day of orders. To stay
   free and still be safe, take your own periodic dump and store it off Supabase:
   ```bash
   # Run weekly (or before any risky change). Keep the file somewhere safe.
   pg_dump "$DIRECT_URL" -Fc -f qm-backup-$(date +%F).dump
   ```
   You can automate this for free with a GitHub Actions scheduled workflow that
   dumps to a private artifact — ask me to add one when you want it. Upgrade to
   Supabase Pro (PITR) once real revenue justifies it.
3. **Anti-pause note:** the free project **pauses after 7 days of no activity**.
   Real launch traffic keeps it awake; during any quiet pre-launch gap, just open
   the dashboard to resume it (data is retained).
4. **Restore drill:** once, before launch, restore a dump into a scratch project
   and confirm the data is intact. A backup you've never restored is not a backup.
5. Check **Advisors** (Database → Advisors) and resolve anything red.

---

## 3. Clerk production instance (~30 min)

You are on test keys (`pk_test_…`). Test-mode auth must not go live.

1. In https://dashboard.clerk.com → your app → **Production** (create the
   production instance).
2. Add your production domain; Clerk gives you DNS records (CNAMEs) — add them at
   your DNS provider and wait for verification. **Note:** a Clerk *production*
   instance requires a domain you control (to add `clerk.yourdomain.com` CNAMEs) —
   you can't do this on a bare `*.onrender.com` subdomain. A domain is ~$10/yr
   (Namecheap/Cloudflare) — effectively the one small unavoidable cost for a real
   web launch. If you want to stay strictly $0 for a demo/soft pilot, keep using the
   Clerk **development** instance on the onrender.com URL and switch to production
   keys once you buy the domain.
3. Copy the **production** `pk_live_…` / `sk_live_…` keys into Render's environment
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
in spam or fail unless the from-domain is verified. The free tier sends **3,000
emails/month but only 100/day** — enough for a launch, but keep an eye on it.

1. https://resend.com/domains → **Add Domain** → e.g. `thequalitymarket.com` (uses
   the same domain from section 3; verification is free).
2. Add the DKIM/SPF DNS records Resend shows, wait for "Verified".
3. Set `RESEND_FROM_EMAIL=noreply@thequalitymarket.com` in Render's environment.
4. Send yourself a test (place an order) and check it arrives in the inbox, not spam.
5. **Stay under the daily cap:** delivery SMS is already off (email only), which is
   correct for free — leave `DELIVERY_SMS_ENABLED=false`. If you ever approach
   100/day, that's your signal to upgrade Resend, not to drop notifications.

> **No domain yet?** Resend also gives you a shared `onboarding@resend.dev` sender
> that can email **only your own verified address** — usable to test the flow before
> you buy a domain, but not for real customer emails.

---

## 5. Inngest production (~10 min)

Background jobs (welcome emails, payment-proof notifications, coupon expiry).

1. https://app.inngest.com → create/select the production environment.
2. Copy the production `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Render's
   environment. (The free tier's monthly step allowance is ample at launch volume.)
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

## 7. Mobile — free Android launch via direct APK (~2–4 h)

**Free path:** skip the Play Store's $25 fee at launch — EAS produces a real
installable **APK** you distribute by download link. Users install it directly
(they tap "allow from this source" once). No store fee, no review wait. You lose
Play Store discoverability and auto-updates, which you can add later (section 8).

Prereq: a free [Expo account](https://expo.dev). EAS Build's free tier gives you a
limited number of cloud builds per month — plenty for launch iterations.

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
   as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (EAS: `eas env:create`). This needs a Google
   Cloud **billing account (card on file)**, but the $200/mo free credit covers
   launch map usage many times over — you won't be charged at this volume. *(The
   customer web tracking map uses free OpenStreetMap and needs no key.)*
4. **Push notifications (FCM):** create a free Firebase project for the app package,
   then `eas credentials` → Android → upload the FCM V1 service-account key.
   Without this, production push silently fails.
5. **Production env for builds:** set the `EXPO_PUBLIC_*` variables (API URL =
   your Render URL/domain, production Clerk publishable key,
   `EXPO_PUBLIC_SOCKET_ENABLED=true`) as EAS environment variables so cloud builds
   bake them in.
6. **Build the APK** (the `preview` profile in `eas.json` already outputs an APK):
   ```bash
   eas build --profile preview --platform android
   ```
   EAS returns a download URL. Share that link (or the QR) — that's your free
   distribution. Put it on your website ("Download the Android app") and send it to
   testers.
7. **Updates:** rebuild and reshare the link for each new version. (Later you can
   add free over-the-air JS updates with `expo-updates` / EAS Update so you don't
   rebuild for every change — ask me to wire it up when you want it.)

### 8. Optional paid upgrades (when you're ready, not at launch)

- **Google Play Store — $25 one-time.** Gives discoverability + auto-updates. Build
  with `--profile production` (AAB), create the listing (screenshots, description,
  **privacy policy URL** → your `/policy` page, and the **Data safety** form:
  declare location [delivery tracking], personal info [name/email/phone], photos
  [payment proofs/products]). Use the Internal testing track first, then promote.
- **Apple App Store — $99/year.** The only way onto iOS; there is **no free
  distribution** for iPhone (no sideloading). `eas build --platform ios` →
  `eas submit` → TestFlight → review. **Skip this at launch** — the web app already
  works on iPhone Safari, so iOS users are covered for free.

---

## 9. OSRM routing — free default is fine to launch on

**For a free launch, do nothing here.** Live ETAs/route lines already default to
the public OSRM demo server (free, just rate-limited), and delivery *pricing* falls
back to straight-line distance (keep `DELIVERY_OSRM_PRICING=false`). This is
perfectly adequate for launch volume.

Only when delivery volume grows enough to hit the demo server's rate limits should
you self-host OSRM — and even then it's free **if** you run it on an always-on
machine you already have (it does need real RAM to build the Rwanda map, so it's
not a fit for the free Render tier). Run OSRM with the Rwanda map:

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
- [ ] Uptime monitor pointed at `https://<domain>/api/health` every 5 min (free:
      UptimeRobot) — doubles as the keep-warm ping for the free Render service
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
