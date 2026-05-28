import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { paymentMethod } from "@/lib/constants";
import { calculateOrderShippingForStore, calculateItemCommission } from '@/lib/pricing';
import { getSocketServer } from "@/lib/socketServer";
import { createRateLimiter, getClientIp } from "@/lib/rateLimit";

const orderLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });

const PAYMENT_TIMEOUT_MINUTES = 30;


export async function POST(request) {
    const ip = getClientIp(request);
    const rl = orderLimiter(`orders:${ip}`);
    if (!rl.success) {
        return NextResponse.json(
            { error: 'Too many requests. Please wait before placing another order.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
        );
    }

    try {
        const { userId } = getAuth(request);
        if(!userId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { items, addressId, paymentMethod: selectedPaymentMethod, couponCode } = await request.json();

        if(!items || !addressId || !selectedPaymentMethod || !Array.isArray(items) || items.length === 0){
            return NextResponse.json({ error: "Missing order details" }, { status: 400 });
        }

        const allowedPaymentMethods = [paymentMethod.BANK_TRANSFER, paymentMethod.MTN_MOMO];
        if(!allowedPaymentMethods.includes(selectedPaymentMethod)){
            return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }

        const address = await prisma.address.findFirst({
            where: {
                id: addressId,
                userId
            }
        });

        if(!address){
            return NextResponse.json({ error: "Invalid address" }, { status: 400 });
        }

        let coupon = null;

        if(couponCode){
            coupon = await prisma.coupon.findUnique({
                where: { 
                    code: couponCode.toUpperCase()
                }
            });

            if(!coupon){
                return NextResponse.json({ error: "Coupon not found" }, { status: 400 });
            }

            if(coupon.expiresAt && coupon.expiresAt < new Date()){
                return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
            }

            if(coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses){
                return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
            }
        }

        // check if the coupon is valid for the new user

        if(couponCode && coupon.forNewUser){
            const userOrders = await prisma.order.findMany({
                where: { userId }
            });
            if(userOrders.length > 0){
                return NextResponse.json({ error: "Coupon valid for new users only" }, { status: 400 });
            }
        }

        // Group order items by product first so stock can be reserved atomically.
        const groupedItems = new Map();
        for (const item of items) {
            const quantity = Number(item.quantity);
            if (!item?.id || !Number.isInteger(quantity) || quantity < 1) {
                return NextResponse.json({ error: `Invalid cart item: ${item?.id || 'unknown'}` }, { status: 400 });
            }

            groupedItems.set(item.id, (groupedItems.get(item.id) || 0) + quantity);
        }

        // Batch-fetch all products + their stores (no include — avoids driverAdapters transaction)
        const productIds = [...groupedItems.keys()];
        const fetchedProducts = await prisma.product.findMany({
            where: { id: { in: productIds } }
        });
        const fetchedStoreIds = [...new Set(fetchedProducts.map(p => p.storeId).filter(Boolean))];
        const fetchedStores = fetchedStoreIds.length
            ? await prisma.store.findMany({ where: { id: { in: fetchedStoreIds } } })
            : [];
        const fetchedStoreMap = new Map(fetchedStores.map(s => [s.id, s]));
        const productMap = new Map(
            fetchedProducts.map(p => [p.id, { ...p, store: fetchedStoreMap.get(p.storeId) || null }])
        );

        // Group orders by storeId using Map
        const orderByStore = new Map();

        for(const [productId, quantity] of groupedItems.entries()){
            const product = productMap.get(productId);
            if(!product){
                return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 400 });
            }
            if(product.approvalStatus !== 'APPROVED' || !product.inStock || !product.store?.isActive){
                return NextResponse.json({ error: `Product not available for ordering: ${product.name}` }, { status: 400 });
            }

            if (product.warehouseQuantity < quantity) {
                return NextResponse.json({
                    error: `Insufficient stock for ${product.name}. Only ${product.warehouseQuantity} left.`
                }, { status: 400 });
            }

            const storeId = product.storeId;
            if(!orderByStore.has(storeId)){
                orderByStore.set(storeId, []);
            }
            const unitPrice =
                product.wholesalePrice &&
                product.wholesaleMinQty &&
                quantity >= product.wholesaleMinQty
                    ? product.wholesalePrice
                    : product.price;

            orderByStore.get(storeId).push({
                id: product.id,
                quantity,
                price: unitPrice,
                warehouseQuantity: product.warehouseQuantity,
                storeId: product.storeId,
                name: product.name,
                category: product.category,
                sellerModel: product.store?.sellerModel || 'LOCAL_SELLER',
                weightKg: product.weightKg,
                lengthCm: product.lengthCm,
                widthCm: product.widthCm,
                heightCm: product.heightCm,
                importOrigin: product.importOrigin
            })
        }

        const orderIds = [];
        const paymentExpiresAt = new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

        // ── Phase 1: Reserve stock (optimistic locking, no transaction) ──────────
        // Decrement each item atomically. If any decrement fails (race condition or
        // stale read), restore already-decremented items and abort.
        const decremented = []; // [{id, quantity}] — for rollback

        for (const [storeId, storeItems] of orderByStore.entries()) {
            for (const item of storeItems) {
                const stockUpdate = await prisma.product.updateMany({
                    where: {
                        id: item.id,
                        storeId,
                        approvalStatus: 'APPROVED',
                        inStock: true,
                        warehouseQuantity: { gte: item.quantity }
                    },
                    data: { warehouseQuantity: { decrement: item.quantity } }
                });

                if (stockUpdate.count !== 1) {
                    // Restore already-decremented items before aborting
                    if (decremented.length) {
                        await Promise.all(decremented.map(d =>
                            prisma.product.update({ where: { id: d.id }, data: { warehouseQuantity: { increment: d.quantity } } })
                        )).catch(console.error);
                    }
                    return NextResponse.json({ error: `Insufficient stock for ${item.name}` }, { status: 400 });
                }

                decremented.push({ id: item.id, quantity: item.quantity });

                const remaining = await prisma.product.findUnique({
                    where: { id: item.id },
                    select: { warehouseQuantity: true }
                });
                const qty = remaining?.warehouseQuantity ?? 0;
                if (qty <= 0) {
                    await prisma.product.update({ where: { id: item.id }, data: { inStock: false } });
                }
                if (qty > 0 && qty <= 5) {
                    try {
                        const io = getSocketServer();
                        io.to(`store-room-${storeId}`).emit('store-notification', {
                            key: 'lowStock', productId: item.id, productName: item.name,
                            warehouseQuantity: qty,
                            message: `Low stock: "${item.name}" has only ${qty} unit${qty !== 1 ? 's' : ''} left.`
                        });
                    } catch {}
                }
            }
        }

        // ── Phase 2: Create orders ────────────────────────────────────────────────
        // The Prisma JS engine (driverAdapters) wraps create() in an implicit
        // transaction even for flat inserts — PrismaNeonHttp rejects that.
        // Use $executeRaw so the driver gets a single INSERT with no transaction.
        // If any insert fails, restore all decremented stock.
        const now = new Date();
        try {
            for (const [storeId, storeItems] of orderByStore.entries()) {
                let total = storeItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                if (couponCode && coupon) total -= (total * coupon.discount / 100);

                const shippingRes = await calculateOrderShippingForStore(prisma, storeId, address, storeItems);
                const shippingCost = shippingRes?.cost || 0;
                const shippingRuleId = shippingRes?.ruleId || null;
                const shippingQuoted = shippingRes?.shippingQuoted ?? true;
                total += shippingCost;

                const commissionBreakdown = [];
                for (const item of storeItems) {
                    try {
                        const comm = await calculateItemCommission(prisma, { category: item.category }, item.price, item.sellerModel);
                        commissionBreakdown.push({
                            productId: item.id, quantity: item.quantity,
                            unitCommission: comm.commissionAmount,
                            commissionAmount: parseFloat((comm.commissionAmount * item.quantity).toFixed(2)),
                            commissionRate: comm.commissionRate, fixedAmount: comm.fixedAmount,
                            appliedRuleId: comm.appliedRuleId
                        });
                    } catch (err) { console.error('Commission calc error', err); }
                }

                const orderId = 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const commissionJson = JSON.stringify(commissionBreakdown.length ? commissionBreakdown : {});
                const couponJson = JSON.stringify(couponCode && coupon ? { code: coupon.code, discount: coupon.discount } : {});

                await prisma.$executeRaw`
                    INSERT INTO "Order" (
                        id, "userId", "storeId", "addressId",
                        total, status,
                        "shippingCost", "shippingQuoted", "shippingRuleId",
                        commission,
                        "paymentMethod", "paymentStatus", "paymentExpiresAt",
                        "isPaid", "isCouponUsed", coupon,
                        "invoiceRequested", "paymentProofStatus",
                        "createdAt", "updatedAt"
                    ) VALUES (
                        ${orderId}, ${userId}, ${storeId}, ${addressId},
                        ${parseFloat(total.toFixed(2))}, 'ORDER_PLACED'::"OrderStatus",
                        ${parseFloat((shippingCost || 0).toFixed(2))}, ${shippingQuoted}, ${shippingRuleId},
                        ${commissionJson}::jsonb,
                        ${selectedPaymentMethod}::"PaymentMethod", 'PENDING'::"PaymentStatus", ${paymentExpiresAt},
                        false, ${!!couponCode}, ${couponJson}::jsonb,
                        false, 'NOT_SUBMITTED'::"PaymentProofStatus",
                        ${now}, ${now}
                    )
                `;

                // Insert order items as individual raw statements (no transaction)
                for (const item of storeItems) {
                    await prisma.$executeRaw`
                        INSERT INTO "OrderItem" ("orderId", "productId", quantity, price)
                        VALUES (${orderId}, ${item.id}, ${item.quantity}, ${item.price})
                    `;
                }

                orderIds.push(orderId);
            }
        } catch (orderError) {
            // Restore stock if any insert failed
            await Promise.all(decremented.map(d =>
                prisma.product.update({ where: { id: d.id }, data: { warehouseQuantity: { increment: d.quantity }, inStock: true } })
            )).catch(console.error);
            throw orderError;
        }

        // ── Phase 3: Cleanup (non-critical, failures don't affect order) ─────────
        prisma.user.update({ where: { id: userId }, data: { cart: {} } }).catch(console.error);

        if (couponCode && coupon) {
            prisma.coupon.update({ where: { code: coupon.code }, data: { usedCount: { increment: 1 } } }).catch(console.error);
        }

        try {
            const io = getSocketServer();
            io.to('admin-room').emit('admin-notification', {
                key: 'newOrders',
                message: 'New order placed'
            });
        } catch (socketError) {
            console.error('Socket.IO admin notify error:', socketError.message);
        }

        return NextResponse.json({ message: "Order created successfully", orderIds }, { status: 200 });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }

}


// get all orders for a user
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if(!userId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const rawOrders = await prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        if (!rawOrders.length) return NextResponse.json({ orders: [] }, { status: 200 });

        const orderIds = rawOrders.map(o => o.id);
        const addressIds = [...new Set(rawOrders.map(o => o.addressId).filter(Boolean))];

        // Parallel: orderItems, addresses, returnRequests, user
        const [orderItems, addresses, returnRequests, user] = await Promise.all([
            prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
            prisma.address.findMany({ where: { id: { in: addressIds } } }),
            prisma.return.findMany({
                where: { orderId: { in: orderIds } },
                select: { id: true, status: true, reason: true, createdAt: true, orderId: true }
            }),
            prisma.user.findUnique({ where: { id: userId } })
        ]);

        // Fetch products for all order items
        const productIds = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
        const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } } }) : [];

        const productMap = new Map(products.map(p => [p.id, p]));
        const addressMap = new Map(addresses.map(a => [a.id, a]));
        const returnMap = new Map(returnRequests.map(r => [r.orderId, r]));
        const orderItemsByOrder = new Map();
        for (const item of orderItems) {
            if (!orderItemsByOrder.has(item.orderId)) orderItemsByOrder.set(item.orderId, []);
            orderItemsByOrder.get(item.orderId).push({ ...item, product: productMap.get(item.productId) || null });
        }

        const orders = rawOrders.map(o => ({
            ...o,
            orderItems: orderItemsByOrder.get(o.id) || [],
            user,
            address: addressMap.get(o.addressId) || null,
            returnRequest: returnMap.get(o.id) || null
        }));
        return NextResponse.json({ orders }, { status: 200 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}