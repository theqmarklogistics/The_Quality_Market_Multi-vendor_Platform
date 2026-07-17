import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
    try {
        const { productId } = await params;

        const product = await prisma.product.findFirst({
            where: {
                id: productId,
                inStock: true,
                approvalStatus: 'APPROVED',
                store: { isActive: true },
            },
            select: {
                id: true, name: true, description: true,
                mrp: true, price: true, wholesalePrice: true, wholesaleMinQty: true, images: true,
                category: true, inStock: true, createdAt: true,
                weightKg: true, lengthCm: true, widthCm: true, heightCm: true, importOrigin: true,
                rating: {
                    select: {
                        createdAt: true, rating: true, review: true,
                        user: { select: { name: true, image: true } }
                    }
                },
                store: {
                    select: { id: true, name: true, username: true, logo: true, isActive: true }
                }
            }
        });

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        return NextResponse.json({ product });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
    }
}
