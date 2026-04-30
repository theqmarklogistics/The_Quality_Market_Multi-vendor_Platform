import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";



// Get store info & store products
export async function GET(request) {
    try {
        
        const { searchParams } = new URL(request.url);
        const usernameParam = searchParams.get("username");

        if(!usernameParam){
            return NextResponse.json({error: "Invalid username"}, {status: 400});
        }

        const username = usernameParam.toLowerCase();

        // Get store info and inStock products with ratings
        const store = await prisma.store.findFirst({
            where: {
                username, isActive: true
            },
            select: {
                id: true,
                name: true,
                description: true,
                username: true,
                address: true,
                logo: true,
                email: true,
                Product: {
                    where: {
                        inStock: true,
                        approvalStatus: "APPROVED"
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        mrp: true,
                        price: true,
                        images: true,
                        category: true,
                        inStock: true,
                        createdAt: true,
                        rating: true
                    }
                }
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