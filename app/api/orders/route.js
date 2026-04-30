import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { paymentMethod } from "@/lib/constants";
import { shippingFee } from "@/lib/constants";
import { getSocketServer } from "@/lib/socketServer";

const PAYMENT_TIMEOUT_MINUTES = 30;


export async function POST(request) {
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

        // Group orders by storeId using Map
        const orderByStore = new Map();

        for(const [productId, quantity] of groupedItems.entries()){
            const product = await prisma.product.findUnique({
                where: { id: productId },
                include: { store: true }
            });
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
            orderByStore.get(storeId).push({
                id: product.id,
                quantity,
                price: product.price,
                warehouseQuantity: product.warehouseQuantity,
                storeId: product.storeId,
                name: product.name,
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

                    if ((remainingProduct?.warehouseQuantity || 0) <= 0) {
                        await tx.product.update({
                            where: { id: item.id },
                            data: { inStock: false }
                        });
                    }
                }

                let total = storeItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                if(couponCode && coupon){
                    total -= (total * coupon.discount / 100);
                }

                if(!isShippingFeeAdded && !couponCode){
                    total += shippingFee;
                    isShippingFeeAdded = true;
                }

                const order = await tx.order.create({
                    data: {
                        userId,
                        storeId,
                        addressId,
                        total: parseFloat(total.toFixed(2)),
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
                address: true
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