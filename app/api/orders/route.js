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

        const allowedPaymentMethods = [paymentMethod.BANK_TRANSFER];
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

        // Batch-fetch all products in one query to avoid N+1
        const productIds = [...groupedItems.keys()];
        const fetchedProducts = await prisma.product.findMany({
            where: { id: { in: productIds } },
            include: { store: true }
        });
        const productMap = new Map(fetchedProducts.map(p => [p.id, p]));

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

        let orderIds = [];

        let isShippingFeeAdded = false;
        const paymentExpiresAt = new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

        await prisma.$transaction(async (tx) => {
            // Create orders for each seller
            for(const [storeId, storeItems] of orderByStore.entries()){
                for (const item of storeItems) {
                    const stockUpdate = await tx.product.updateMany({
                        where: {
                            id: item.id,
                            storeId,
                            approvalStatus: 'APPROVED',
                            inStock: true,
                            warehouseQuantity: {
                                gte: item.quantity
                            }
                        },
                        data: {
                            warehouseQuantity: {
                                decrement: item.quantity
                            }
                        }
                    });

                    if (stockUpdate.count !== 1) {
                        throw new Error(`Insufficient stock for ${item.name}`);
                    }

                    const remainingProduct = await tx.product.findUnique({
                        where: { id: item.id },
                        select: { warehouseQuantity: true }
                    });

                    const remaining = remainingProduct?.warehouseQuantity ?? 0;
                    if (remaining <= 0) {
                        await tx.product.update({ where: { id: item.id }, data: { inStock: false } });
                    }

                    // Low-stock alert: notify seller via socket when quantity hits threshold
                    if (remaining > 0 && remaining <= 5) {
                        try {
                            const io = getSocketServer();
                            io.to(`store-room-${storeId}`).emit('store-notification', {
                                key: 'lowStock',
                                productId: item.id,
                                productName: item.name,
                                warehouseQuantity: remaining,
                                message: `Low stock: "${item.name}" has only ${remaining} unit${remaining !== 1 ? 's' : ''} left.`
                            });
                        } catch {}
                    }
                }

                let total = storeItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                if(couponCode && coupon){
                    total -= (total * coupon.discount / 100);
                }

                // Calculate shipping cost for this store (per-store shipping)
                const shippingRes = await calculateOrderShippingForStore(tx, storeId, address, storeItems);
                const shippingCost = shippingRes?.cost || 0;
                const shippingRuleId = shippingRes?.ruleId || null;

                // Add shipping cost once per store order
                total += shippingCost;

                // Calculate commission breakdown per item and persist with order
                const commissionBreakdown = [];
                for (const item of storeItems) {
                    try {
                        const comm = await calculateItemCommission(tx, { category: item.category }, item.price, item.sellerModel);
                        const commissionAmountTotal = parseFloat((comm.commissionAmount * item.quantity).toFixed(2));
                        commissionBreakdown.push({
                            productId: item.id,
                            quantity: item.quantity,
                            unitCommission: comm.commissionAmount,
                            commissionAmount: commissionAmountTotal,
                            commissionRate: comm.commissionRate,
                            fixedAmount: comm.fixedAmount,
                            appliedRuleId: comm.appliedRuleId
                        });
                    } catch (err) {
                        console.error('Commission calc error', err);
                    }
                }

                const order = await tx.order.create({
                    data: {
                        userId,
                        storeId,
                        addressId,
                        total: parseFloat(total.toFixed(2)),
                        shippingCost: parseFloat((shippingCost || 0).toFixed(2)),
                        shippingRuleId: shippingRuleId,
                        commission: commissionBreakdown.length ? commissionBreakdown : {},
                        paymentMethod: selectedPaymentMethod,
                        paymentStatus: "PENDING",
                        paymentExpiresAt,
                        isPaid: false,
                        isCouponUsed: !!couponCode,
                        coupon: couponCode && coupon ? { code: coupon.code, discount: coupon.discount } : {},
                        orderItems: {
                            create: storeItems.map(item => ({
                                productId: item.id,
                                quantity: item.quantity,
                                price: item.price
                            }))
                        }
                    }
                });
                orderIds.push(order.id);
            }

            await tx.user.update({
                where: { id: userId },
                data: { cart: {} }
            });

            if(couponCode && coupon){
                await tx.coupon.update({
                    where: { code: coupon.code },
                    data: { usedCount: { increment: 1 } }
                });
            }
        });

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
        const orders = await prisma.order.findMany({
            where: { userId },
            include: {
                orderItems: {include: {product: true}},
                user: true,
                address: true,
                returnRequest: { select: { id: true, status: true, reason: true, createdAt: true } }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return NextResponse.json({ orders }, { status: 200 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}