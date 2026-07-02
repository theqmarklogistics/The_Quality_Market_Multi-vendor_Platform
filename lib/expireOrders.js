import prisma from "@/lib/prisma";

// Lazy order expiry — replaces the old every-10-minute Inngest cron that kept the
// database compute busy around the clock (and burned quota / stopped it idling).
//
// Instead of polling on a timer, we sweep stale orders on read paths (storefront /
// order list). The sweep runs at most once every SWEEP_INTERVAL_MS per server
// instance and does nothing when there are no expired orders, so the database is
// only touched while real users are active — and stays asleep when the app is idle.
//
// Concurrency-safe without an interactive transaction: each order is claimed with a
// guarded PENDING→EXPIRED update, and only the
// caller that actually flips the row (count === 1) restores that order's stock. A
// concurrent sweep sees count === 0 and skips, so stock is never double-restored.
// We claim before restoring, so the only possible failure mode is under-restore on a
// mid-sweep crash (safe — never oversells), which a later sweep does not retry.

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // throttle: at most once per 5 min per instance
let lastSweep = 0;
let inFlight = null;

export async function sweepExpiredOrders() {
  const now = new Date();
  let expiredCount = 0;

  // ── Platform orders: claim, then restore reserved stock. ───────────────────
  const expiredPlatform = await prisma.order.findMany({
    where: {
      paymentStatus: "PENDING",
      isPaid: false,
      paymentExpiresAt: { lte: now },
      isExternalDelivery: false,
    },
    include: { orderItems: true },
  });

  for (const order of expiredPlatform) {
    // Atomic claim: only the sweep that flips this row owns the stock restore.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: "PENDING", isPaid: false },
      data: { paymentStatus: "EXPIRED" },
    });
    if (claim.count !== 1) continue; // another sweep already expired it
    expiredCount++;

    for (const item of order.orderItems) {
      await prisma.product
        .update({
          where: { id: item.productId },
          data: { warehouseQuantity: { increment: item.quantity }, inStock: true },
        })
        .catch((e) => console.error("[expireOrders] stock restore failed:", e.message));
    }
  }

  // ── External delivery-only bookings: cancel abandoned (no stock to restore). ─
  const abandonedExternal = await prisma.order.findMany({
    where: {
      isExternalDelivery: true,
      isPaid: false,
      paymentStatus: "PENDING",
      paymentProofStatus: "NOT_SUBMITTED",
      paymentExpiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (abandonedExternal.length > 0) {
    const ext = await prisma.order.updateMany({
      where: {
        id: { in: abandonedExternal.map((o) => o.id) },
        paymentStatus: "PENDING",
        isPaid: false,
      },
      data: {
        paymentStatus: "EXPIRED",
        deliveryStatus: "FAILED",
        failureReason: "Booking expired — payment not received within 24 hours",
      },
    });
    expiredCount += ext.count;
  }

  return expiredCount;
}

// Throttled, fire-and-forget wrapper for read paths. At most one sweep per
// SWEEP_INTERVAL_MS per instance; never throws into the caller. Returns the
// in-flight/last promise so callers may optionally await it.
export function maybeSweepExpiredOrders() {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return Promise.resolve(0);
  lastSweep = now;
  inFlight = sweepExpiredOrders()
    .catch((e) => {
      console.error("[expireOrders] sweep failed:", e.message);
      return 0;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
