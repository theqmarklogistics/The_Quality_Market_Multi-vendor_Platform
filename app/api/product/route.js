import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";


export async function GET(request) {
    try {
        let products = await prisma.product.findMany({
            where: { inStock: true, approvalStatus: 'APPROVED' },
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
                rating: {
                    select: {
                        createdAt: true,
                        rating: true,
                        review: true,
                        user: { select: { name: true, image: true } }
                    }
                },
                store: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        logo: true,
                        isActive: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        // remove products with store isActive is false
        products = products.filter(product => product.store.isActive);
        return NextResponse.json({products} );

    } catch (error) {
        console.error(error);
        return NextResponse.json({error: 'An internal server error occurred'}, {status: 500});
    }
}