import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";



// Get store info & store products
export async function GET(request) {
    try {
        
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username").toLowerCase();

        if(!username){
            return NextResponse.json({error: "Invalid username"}, {status: 400});
        }

        // Get store info and inStock products with ratings
        const store = await prisma.store.findFirst({
            where: {
                username, isActive: true
            },
            include: {
                products: { include: { ratings: true }}
            }
        });

        if(!store){
            return NextResponse.json({error: "Store not found"}, {status: 400});
        }

        return NextResponse.json({store});



    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}