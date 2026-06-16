<div align="center">

# The Quality Market

**A production-grade, multi-vendor e-commerce platform built for the modern web.**

Built with Next.js 15, Tailwind CSS 4, Clerk, Prisma, and real-time Socket.IO — designed to handle the full lifecycle of a marketplace: from vendor onboarding to customer checkout, shipping, payouts, and beyond.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwind-css)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [User Roles](#user-roles)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Project Structure](#project-structure)
- [Key Workflows](#key-workflows)
- [Kigali Pooled Delivery](#kigali-pooled-delivery)
- [API Overview](#api-overview)
- [Deployment](#deployment)

---

## Overview

The Quality Market is a full-featured, multi-vendor marketplace platform. It supports multiple seller models, a comprehensive admin control panel, real-time messaging between buyers and sellers, AI-assisted product listing, and a complete order lifecycle — from cart to fulfillment to payout.

The platform is localized to the Rwandan market (RWF currency) but is architected to be adapted to any locale.

---

## Features

### Storefront
- Responsive product catalog with category filtering and search
- Product detail pages with image galleries, descriptions, and seller info
- Star ratings and verified-purchase reviews
- Best-selling and latest product sections
- Vendor shop pages with store profiles
- Coupon code support at checkout
- Newsletter subscription

### Cart & Checkout
- Persistent cart synced to database (debounced)
- Multi-address support with geolocation
- Weight-based and region-based shipping rate calculation
- Multiple payment methods (admin-configurable)
- Order confirmation with email notification

### Vendor Dashboard
- Product listing management (add, edit, toggle stock)
- AI-powered product description generation (Google Gemini)
- Sales analytics and revenue overview
- Order management and fulfillment tracking
- Payout history and earnings breakdown
- Real-time chat with customers
- Store profile and settings

### Admin Panel
- Platform-wide metrics dashboard
- Store approval and rejection workflow with email notifications
- Product approval queue with analytics
- User management with role assignment and email invitations
- Commission configuration per category and seller model
- Shipping rules and weight-rate tariff table management
- Coupon creation and management
- Return request handling
- Invoice generation and email delivery
- Newsletter broadcast
- Homepage hero and announcement banner configuration
- Payment method configuration
- Audit log for all admin actions
- Real-time notifications

### Operational Role Dashboards
- **Financial Operations:** Payment oversight and financial reporting
- **Logistics Manager:** Shipping and fulfillment tracking
- **Warehouse Keeper:** Inventory and stock management

### Kigali Pooled Delivery
- Same-city pooled logistics: orders going to the same Kigali sector are batched into a shared **route corridor** and delivered by one company rider
- Customer chooses **Pooled Delivery** at checkout and adds a landmark + optional pinned location
- **On-demand batching** (no automatic schedule): logistics staff build routes manually from the dispatch board — **Batch now** sweeps sorted orders into per-sector corridors, or **Schedule route** hand-builds a corridor for a chosen date. Stops are ordered by a **nearest-neighbour route** from the hub and the route cost is split by **real distance** (closest stop pays least)
- **Rider onboarding & management** from the admin panel (`/admin/riders`)
- **Dispatch board** for logistics staff: schedule routes for a chosen date, batch on demand, assign riders, drive corridors through their lifecycle, resolve failed stops, and watch **every active rider live** on one map
- **Rider console** (mobile-first): ordered stop list, turn-by-turn hand-off to Google Maps, call-customer, live GPS broadcast (with screen wake-lock + offline retry), and OTP delivery confirmation
- **Live customer tracking page** with a real-time map, **road-based ETA and route line (OSRM)**, rider contact, delivery code, and a status timeline
- **Proactive notifications** — email to the customer on dispatch, arrival, delivery, and failed attempts (optional SMS, off by default)
- **OTP-verified handover** with brute-force lockout: the order completes only with the 4-digit code the customer shows the rider; confirmation releases escrow
- **Failed-delivery handling**: structured reason capture, plus re-pool (back to the queue) or refund from the dispatch board
- **Escrow status tracking** per order (HELD → RELEASED / REFUNDED); payment settlement is handled off-platform

### Platform Features
- Real-time messaging with Socket.IO (customer ↔ seller ↔ admin)
- Background jobs via Inngest (email dispatch, async workflows)
- Image hosting and optimization via ImageKit CDN
- Vercel Analytics integration
- SEO-ready with sitemap and robots.txt generation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App Router                    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Storefront  │  │Admin Dashboard│  │ Seller Dashboard │  │
│  │  (public)    │  │   /admin     │  │    /store        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                     API Routes (/api)                 │   │
│  │  Products · Orders · Cart · Store · Admin · Chat      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌────────────┐      ┌──────────────┐     ┌─────────────┐
  │   Clerk    │      │  PostgreSQL   │     │  Socket.IO  │
  │  Auth      │      │  (Neon) via  │     │  Real-time  │
  │            │      │  Prisma ORM  │     │  Server     │
  └────────────┘      └──────────────┘     └─────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌────────────┐      ┌──────────────┐     ┌─────────────┐
  │  ImageKit  │      │   Inngest    │     │   Resend    │
  │  Image CDN │      │  Background  │     │   Email     │
  │            │      │    Jobs      │     │  Delivery   │
  └────────────┘      └──────────────┘     └─────────────┘
```

**Request flow:** All requests pass through Clerk middleware for authentication. Protected routes verify user role via database lookup. API routes use server-side Clerk auth (`auth()`) and apply role-specific middleware (`authAdmin`, `authSeller`) before any data access.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| UI | [React 19](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com) |
| Icons | [Lucide React](https://lucide.dev) |
| Charts | [Recharts](https://recharts.org) |
| Authentication | [Clerk](https://clerk.com) (`@clerk/nextjs`) |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| ORM | [Prisma 6](https://www.prisma.io) with Neon adapter |
| State Management | [Redux Toolkit](https://redux-toolkit.js.org) + React-Redux |
| Real-time | [Socket.IO 4](https://socket.io) (custom Node.js server) |
| Image Hosting | [ImageKit](https://imagekit.io) |
| AI | [Google Gemini](https://aistudio.google.com) (via OpenAI-compatible API) |
| Background Jobs | [Inngest](https://www.inngest.com) |
| Email | [Resend](https://resend.com) |
| PDF Generation | [`@react-pdf/renderer`](https://react-pdf.org) |
| Analytics | [Vercel Analytics](https://vercel.com/analytics) |
| HTTP Client | [Axios](https://axios-http.com) |
| Date Utilities | [date-fns](https://date-fns.org) |
| Notifications | [React Hot Toast](https://react-hot-toast.com) |
| Font | [Outfit](https://fonts.google.com/specimen/Outfit) (via `next/font`) |

---

## User Roles

The platform supports seven distinct roles, each with dedicated access:

| Role | Access |
|---|---|
| `CUSTOMER` | Storefront, cart, orders, chat with sellers |
| `SELLER` | All of the above + seller dashboard (`/store`) |
| `ADMIN` | All dashboards + admin panel (`/admin`) |
| `FINANCIAL_OPERATIONAL` | Financial dashboard (`/financial`) |
| `LOGISTICS_MANAGER` | Logistics dashboard + dispatch board (`/logistics`) |
| `WAREHOUSE_KEEPER` | Warehouse dashboard (`/warehouse`) |
| `RIDER` | Rider console (`/rider`) — company delivery riders |

Role assignment is managed by admins via the Users page. Invitations are sent by email using Resend. Sellers are promoted from CUSTOMER after their store is approved.

> **Riders** are company staff. Onboard them from the admin **Riders** page (`/admin/riders`) — invite by email and manage their phone, vehicle type, and active status. A `RiderProfile` is created automatically on invite. Riders then sign in to the `/rider` console.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A PostgreSQL database (Neon recommended)
- Accounts for: Clerk, ImageKit, Resend, Inngest, Google AI Studio

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd the-quality-market

# Install dependencies
npm install
```

### Configuration

Copy the environment variable template and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section for a full description of each variable.

### Database Setup

```bash
# Apply migrations to your database
npx prisma migrate deploy

# (Optional) Open Prisma Studio to inspect your data
npx prisma studio
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** The development server runs a custom Node.js server (`server.js`) to support Socket.IO alongside Next.js.

### Build & Production

```bash
npm run build
npm start
```

The build step automatically runs `prisma generate` before compiling Next.js.

---

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_CURRENCY_SYMBOL=RWF

# --- Admin ---
# Comma-separated list of admin email addresses (fallback for role check)
ADMIN_EMAIL=admin@example.com

# --- Authentication (Clerk) ---
# Get these from https://dashboard.clerk.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# --- Database (Neon PostgreSQL) — https://neon.tech ---
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
DIRECT_URL=postgresql://user:pass@host/dbname?sslmode=require

# --- Background Jobs (Inngest) — https://app.inngest.com ---
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# --- Image Hosting (ImageKit) — https://imagekit.io/dashboard ---
IMAGEKIT_PUBLIC_KEY=public_...
IMAGEKIT_PRIVATE_KEY=private_...
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-id

# --- AI (Google Gemini) — https://aistudio.google.com ---
OPENAI_API_KEY=AIza...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-2.0-flash

# --- Email (Resend) — https://resend.com ---
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# --- Kigali Pooled Delivery (all optional) ---
# OSRM routing server for road-based ETA/route lines (defaults to the public demo server)
OSRM_URL=https://router.project-osrm.org
# SMS for delivery updates — OFF by default (email only). Set to true to enable.
DELIVERY_SMS_ENABLED=false
# Only used when DELIVERY_SMS_ENABLED=true; omit a provider to run SMS in mock mode (logs to console)
SMS_PROVIDER=pindo
SMS_SENDER_ID=QMarket
PINDO_API_TOKEN=...
```

---

## Database Setup

The platform uses Prisma with a Neon PostgreSQL database. The schema is located at `prisma/schema.prisma`.

### Core Models

| Model | Description |
|---|---|
| `User` | Platform users with role-based access |
| `Store` | Vendor stores with seller model type |
| `Product` | Product listings with approval workflow |
| `Order` | Purchase orders with full payment tracking |
| `OrderItem` | Line items per order |
| `Address` | User shipping addresses |
| `Rating` | Product reviews (one per user per product per order) |
| `Coupon` | Discount codes with usage limits |
| `ShippingRule` | Region and distance-based shipping costs |
| `WeightShippingRate` | Weight-band tariff table (Zones A/B/C, China→Rwanda) |
| `CategoryCommission` | Commission rates by category and seller model |
| `Conversation` | Chat threads between buyers, sellers, and admins |
| `Message` | Individual chat messages with read receipts |
| `Payout` | Seller earnings records |
| `DeliveryCorridor` | A pooled route grouping same-area orders, with rider assignment + live location |
| `RiderProfile` | Company rider details (phone, vehicle type, active flag) for dispatch |
| `Return` | Product return requests with approval workflow |
| `AuditLog` | Admin action history |
| `PaymentConfig` | Admin-managed payment method availability |
| `BannerConfig` | Announcement banner text and visibility |
| `HeroConfig` | Homepage hero slot images and links |
| `Category` | Product category taxonomy |
| `NewsletterSubscriber` | Email subscription list |

### Seller Models

Stores operate under one of two models:
- `FULL_MANAGED` — Platform manages logistics and fulfillment
- `LOCAL_SELLER` — Seller handles their own fulfillment

Commission rates are configured separately per category per seller model.

### Running Migrations

```bash
# Create a new migration after schema changes
npx prisma migrate dev --name describe-your-change

# Apply migrations in production
npx prisma migrate deploy
```

---

## Project Structure

```
.
├── app/                        # Next.js App Router
│   ├── (public)/               # Customer-facing storefront
│   │   ├── page.jsx            # Homepage
│   │   ├── product/[productId] # Product detail
│   │   ├── shop/               # All stores & vendor pages
│   │   ├── cart/               # Shopping cart
│   │   ├── orders/             # Order history & confirmation
│   │   ├── chat/               # Customer-seller messaging
│   │   ├── create-store/       # Seller registration
│   │   └── ...                 # About, contact, policy, terms
│   ├── admin/                  # Admin dashboard
│   │   ├── approve/            # Store approval queue
│   │   ├── categories/         # Category management
│   │   ├── commissions/        # Commission configuration
│   │   ├── orders/             # Order oversight
│   │   ├── products/           # Product moderation
│   │   ├── shipping/           # Shipping rules & weight rates
│   │   ├── users/              # User management & invitations
│   │   └── ...                 # Coupons, payouts, returns, etc.
│   ├── store/                  # Seller dashboard
│   │   ├── add-product/        # Create product listing
│   │   ├── edit-product/       # Edit existing product
│   │   ├── manage-product/     # Product list view
│   │   ├── orders/             # Seller orders
│   │   └── payouts/            # Payout history
│   ├── financial/              # Financial operations dashboard
│   ├── logistics/              # Logistics dispatch board (pooled delivery)
│   ├── rider/                  # Rider console (pooled delivery)
│   ├── warehouse/              # Warehouse keeper dashboard
│   └── api/                    # API route handlers (69 routes)
│       ├── admin/              # Admin-only API endpoints
│       ├── store/              # Seller API endpoints
│       ├── product/            # Product CRUD & search
│       ├── orders/             # Order lifecycle
│       ├── cart/               # Cart management
│       ├── chat/               # Messaging API
│       └── inngest/            # Background job webhook
│
├── components/                 # Shared React components
│   ├── admin/                  # Admin-specific components
│   ├── store/                  # Seller-specific components
│   ├── chat/                   # Messaging components
│   ├── delivery/               # Live map components (pooled delivery)
│   ├── logistics/              # Dispatch board
│   └── rider/                  # Rider console
│
├── lib/                        # Shared utilities
│   ├── prisma.js               # Prisma client singleton
│   ├── email.js                # Email dispatch (Resend)
│   ├── store.js                # Redux store configuration
│   └── features/               # Redux slices (cart, product, etc.)
│
├── middlewares/                # Role-check middleware
│   ├── authAdmin.js            # Admin role verification
│   ├── authSeller.js           # Seller store verification
│   ├── authLogistics.js        # Logistics-manager role verification
│   └── authRider.js            # Rider role verification
│
├── inngest/                    # Background job definitions
├── configs/                    # External service configuration
├── prisma/                     # Prisma schema & migrations
├── public/                     # Static assets
├── scripts/                    # Utility scripts
├── server.js                   # Custom Node.js server (Socket.IO)
├── middleware.ts               # Clerk auth middleware
└── next.config.mjs             # Next.js configuration
```

---

## Key Workflows

### Store Onboarding
1. Customer registers via Clerk
2. Customer submits store creation form at `/create-store`
3. Admin reviews store in `/admin/approve`
4. On approval: user role is updated to `SELLER`, approval email sent with contract PDF
5. Seller can now access `/store` dashboard

### Product Lifecycle
1. Seller creates product at `/store/add-product` (with optional AI description generation)
2. Product enters `PENDING` status
3. Admin reviews and approves/rejects at `/admin/products`
4. Approved products appear on the storefront

### Order Lifecycle
1. Customer adds products to cart and proceeds to checkout
2. Order created with `PENDING` status and payment proof upload
3. Admin verifies payment and updates order to `CONFIRMED`
4. Order fulfilled; seller earnings calculated after commission deduction
5. Seller requests payout; admin processes payout

### Kigali Pooled Delivery
1. At checkout the customer selects **Pooled Delivery** and provides a landmark (and optional pinned location)
2. The order is created with `deliveryType = KIGALI_POOL`, a 4-digit delivery OTP, escrow `HELD`, and status `PENDING_INTAKE`
3. Packages arrive at the hub; logistics marks each **sorted** (`PENDING_INTAKE → SORTING`)
4. Logistics batches the sorted orders into **corridors** — **Batch now** (groups un-routed pooled orders by sector) or **Schedule route** (hand-built for a chosen date) — assigning each stop a sequence + proportional fee share
5. Logistics assigns a **rider** to each corridor and **dispatches** it (`corridor + orders → IN_TRANSIT`)
6. The rider starts the route and shares live GPS; the customer watches the rider on a live map with ETA
7. At the door the rider marks **Arriving**, then enters the customer's **4-digit code** to confirm delivery
8. On OTP confirmation the order is marked `DELIVERED`, escrow is `RELEASED`, and an internal split-payout record is written (settlement happens off-platform)

See the dedicated [Kigali Pooled Delivery](#kigali-pooled-delivery) section for the full architecture and a hands-on walkthrough.

### Real-time Messaging
- Socket.IO server runs alongside Next.js via `server.js`
- Users authenticate to the socket server using their Clerk session token
- Conversations are persisted to the database; unread counts tracked per participant

---

## Kigali Pooled Delivery

A same-city logistics module that batches Kigali orders heading to the same area into one shared **route corridor**, assigns them to a company rider, and gives the customer live map tracking with an OTP-verified handover. It runs entirely inside the platform; only the final money settlement is handled off-platform.

### Concept

Rather than dispatching one rider per order, orders going to the same Kigali sector are pooled into a single corridor run. Stops are sequenced by a **greedy nearest-neighbour route** from the hub, and a fixed route cost (default **10,000 RWF**) is split across them weighted by each stop's **cumulative road distance** — the closest stop pays the least, the furthest pays the most. When coordinates are missing the cost falls back to an even split.

### Delivery lifecycle

`PoolDeliveryStatus`: **PENDING_INTAKE → SORTING → IN_TRANSIT → ARRIVING → DELIVERED** (or **FAILED**)

`EscrowStatus`: **HELD** (at order creation) → **RELEASED** (on OTP confirmation) — `REFUNDED` reserved for failed/cancelled flows.

`CorridorStatus`: **OPEN → CLOSED → IN_TRANSIT → COMPLETED** (corridors are created `CLOSED`, i.e. batched and ready to dispatch).

### Who does what

| Actor | Surface | Responsibilities |
|---|---|---|
| Customer | `/track/[orderId]` | Picks pooled delivery, watches live map + ETA, shows the rider the OTP |
| Logistics Manager | `/logistics` | Marks intake, assigns riders, dispatches/completes corridors, monitors all riders live |
| Rider (company staff) | `/rider` | Works the ordered stop list, navigates, broadcasts GPS, confirms delivery via OTP |

### Batching engine

Batching is **manual** — there is no automatic cron. Logistics staff create routes on demand from the dispatch board:

- **Batch now** (`POST /api/logistics/batch`) sweeps **every** sorted-but-un-corridored pooled order (`corridorId IS NULL`, not just today's), so an order is never orphaned. Orders are grouped by `address.sector` (district fallback), routed by nearest-neighbour from the hub, costed by distance, and written into one `DeliveryCorridor` per group (`Hub → <sector> (date)`), landing in `CLOSED` status ready to assign a rider. The day boundary used for naming is computed in `Africa/Kigali` so late-night orders are never mis-dated.
- **Schedule route** (`POST /api/logistics/corridors`) hand-builds a single corridor for a chosen run date: name it, optionally pre-assign a rider, and select specific un-routed pooled orders to load onto it (same nearest-neighbour ordering and distance-based cost split). A route loaded with stops is created `CLOSED`; an empty placeholder route stays `OPEN` until orders are added.

### Notifications, ETA & resilience

- **Customer notifications** fire on dispatch, arrival, delivery, and failed attempts — **email via Resend** by default. SMS is opt-in: set `DELIVERY_SMS_ENABLED=true` and configure a provider in `lib/sms.js` (a provider-agnostic sender, mock by default; `SMS_PROVIDER`/`PINDO_API_TOKEN` to go live).
- **ETA & route line** on the customer map come from **OSRM** road routing (`OSRM_URL`, public demo server by default), with the haversine estimate as a guaranteed fallback.
- **OTP** codes are cryptographically random and locked for 15 minutes after 5 wrong attempts.
- **Failed deliveries** capture a structured reason from the rider and can be **re-pooled** (returned to the batching queue) or **refunded** (escrow → REFUNDED) from the dispatch board.
- The **rider console** holds a screen wake-lock while on a route and queues GPS pings for retry when the signal drops.

### Real-time tracking

Live updates flow over the existing Socket.IO server (`server.js`) with per-purpose rooms, each guarded by a role/ownership check:

- `track-<orderId>` — the customer's own order
- `rider-<userId>` + `corridor-<id>` — the rider and their assigned corridor(s)
- `logistics-room` — the dispatch board (all riders/corridors live)

Riders broadcast GPS (throttled to ~10s) → fanned out to the corridor, each customer's track room, and the dispatch board. Customers can optionally share their own live location with the rider during the final approach. Every surface also polls (~20–25s) as a fallback for socket-disabled hosts, and a last-known rider position is persisted on the corridor to seed late-joiners.

### Trying it locally

> Prerequisites: the app running (`npm run dev`), at least one approved product, and an admin account.

1. **Provision a rider.** On the admin **Riders** page (`/admin/riders`), invite a rider by email and set their phone + vehicle. (Or invite as `RIDER` from the Users page.) The rider accepts the email invite and signs in.
2. **Provision a dispatcher.** From the admin Users page, invite a user as `LOGISTICS_MANAGER` (or use your admin account — admins can access every surface).
3. **Place a pooled order.** As a customer, add an approved product to the cart, go to checkout, choose **Pooled Delivery**, and enter a Kigali landmark (and pin a location if prompted). Complete the order.
4. **View the tracking page.** Open `/track/<orderId>` (or follow the link from your order). You'll see the 4-digit delivery code and a `PENDING_INTAKE` timeline.
5. **Sort + batch.** On `/logistics`, click **Mark sorted** for the order, then click **Batch now** to create the corridor (or use **Schedule route** to hand-build one for a chosen date). Batching is manual — there is no automatic schedule.
6. **Assign + dispatch.** On the dispatch board, pick your rider from the corridor's dropdown and click **Dispatch**. The corridor and its orders flip to `IN_TRANSIT`, and the customer is notified.
7. **Run the route.** Sign in as the rider, open `/rider`, tap **Start route & share location** (allow geolocation). The customer's track page now shows your live position and ETA.
8. **Deliver.** Tap **Arriving** (the customer sees an "arriving" banner), then **Deliver**, and enter the 4-digit code from the customer's track page. The order becomes `DELIVERED`, escrow `RELEASED`, and a payout record is written.

> **Tip:** Use two browser profiles (or a phone + desktop) so you can watch the customer track page update live while you act as the rider.

---

## API Overview

All API routes live under `/api`. Admin routes require `ADMIN` role; store routes require an approved seller store.

| Group | Base Path | Description |
|---|---|---|
| Products | `/api/product` | CRUD, search, filtering |
| Orders | `/api/orders` | Order creation and management |
| Delivery | `/api/delivery` | Pooled-delivery tracking, rider assignment/location/stop-status, OTP confirmation |
| Logistics | `/api/logistics` | Dispatch board: corridors, rider roster, intake, assign/dispatch (logistics role) |
| Cart | `/api/cart` | Persistent cart sync |
| Store | `/api/store` | Store creation, dashboard data, AI features |
| Admin | `/api/admin` | Full admin control surface |
| Categories | `/api/categories` | Category listing |
| Coupon | `/api/coupon` | Coupon validation |
| Rating | `/api/rating` | Product reviews |
| Chat | `/api/chat` | Conversation and message management |
| Newsletter | `/api/newsletter` | Subscriptions |
| Address | `/api/address` | User address CRUD |
| Hero | `/api/hero` | Homepage hero configuration |
| Banner | `/api/banner` | Announcement banner |
| Payment Config | `/api/payment-config` | Payment method settings |
| Background Jobs | `/api/inngest` | Inngest webhook receiver |
| Health | `/api/health` | Health check endpoint |

---

## Deployment

### Vercel (Recommended)

1. Push your repository to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add all environment variables from `.env` in the Vercel project settings
4. Set the build command to `npm run build` (default)
5. Deploy

> **Important:** The custom `server.js` (Socket.IO) is not compatible with Vercel's serverless runtime. For real-time messaging in production, deploy the Socket.IO server separately (e.g., Railway, Render, or a VPS) and point `NEXT_PUBLIC_APP_URL` to that host.

### Self-Hosted (Node.js)

```bash
npm run build
npm start
```

This starts the custom Node.js server on port 3000 with Socket.IO fully integrated.

### Database

Run migrations against your production database before deploying:

```bash
DATABASE_URL=your_production_url npx prisma migrate deploy
```

---

## License

This project is licensed under the **MIT License**. See [LICENSE.md](./LICENSE.md) for details.
