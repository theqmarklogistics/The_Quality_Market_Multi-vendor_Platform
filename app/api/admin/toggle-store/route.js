import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";


// Toggle store isActive
export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if(!isAdmin) {
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        const { storeId } = await request.json();

        if(!storeId) {
            return NextResponse.json({error: "missing store id"}, {status: 400});
        }

        // Find the store
        const store = await prisma.store.findUnique({
            where: {
                id: storeId
            }
        });

        if(!store) {
            return NextResponse.json({error: "store not found"}, {status: 404});
        }

        // Toggle the store isActive
        await prisma.store.update({
            where: { id: storeId },
            data: { isActive: !store.isActive }
        });

        return NextResponse.json({message: "store updated successfully"});
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}