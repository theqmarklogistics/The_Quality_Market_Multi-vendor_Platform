import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authSeller from "@/middlewares/authSeller";
import prisma from "@/lib/prisma";




// Toggle stock status of a product
export async function POST(request) {
    try {
        
        const {userId} = getAuth(request);
        const body = await request.json();
        const productId = body?.productId;

        if(!productId){
            return NextResponse.json({error: "Product ID is required"}, {status: 400});
        }

        const storeId = await authSeller(userId);

        if(!storeId){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        // check if the product exists

        const product = await prisma.product.findFirst({
            where: {
                id: productId,
                storeId
            }
        });

        if(!product){
            return NextResponse.json({error: "Product not found"}, {status: 404});
        }

        await prisma.product.update({
            where: {
                id: productId
            },
            data: {
                inStock: !product.inStock
            }
        });

        return NextResponse.json({message: "Product stock updated successfully"});

    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.message}, {status: 400});
    
    }
}