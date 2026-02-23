import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import { paymentMethod } from "@/lib/constants";
import { shippingFee } from "@/lib/constants";


export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        if(!userId){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { items, addressId, paymentMethod, couponCode } = await request.json();

        if(!items || !addressId || !paymentMethod || !Array.isArray(items) || items.length === 0){
            return NextResponse.json({ error: "Missing order details" }, { status: 400 });
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

        //Group orders by storeId using Map
        const orderByStore = new Map();

        for(const item of items){
            const product = await prisma.product.findUnique({
                where: { id: item.id }
            });
            if(!product){
                return NextResponse.json({ error: `Product not found: ${item.id}` }, { status: 400 });
            }
            const storeId = product.storeId;
            if(!orderByStore.has(storeId)){
                orderByStore.set(storeId, []);
            }
            orderByStore.get(storeId).push({...item, price : product.price})
        }

        let orderIds = [];
        let fullamount = 0;

        let isShippingFeeAdded = false;

        // Create orders for each seller
        for(const [storeId, storeItems] of orderByStore.entries()){
            let total = storeItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            if(couponCode && coupon){
                total -= (total * coupon.discount / 100);
            }

            if(!isShippingFeeAdded && !couponCode){
                total += shippingFee;
                isShippingFeeAdded = true;
            }
            fullamount += parseFloat(total.toFixed(2));

            const order = await prisma.order.create({
                data: {
                    userId,
                    storeId,
                    addressId,
                    total: parseFloat(total.toFixed(2)),
                    paymentMethod,
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

        await prisma.user.update({
            where: { id: userId },
            data: { cart: {} }
        });
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
            where: { userId, OR: [{paymentMethod: paymentMethod.COD}, {AND: [{paymentMethod: paymentMethod.STRIPE}, {isPaid: true}]}] },
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