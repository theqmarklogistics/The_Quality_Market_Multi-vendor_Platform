import prisma from "@/lib/prisma";
import { getAuth } from "@clerk/nextjs/server";
import authSeller from "@/middlewares/authSeller";
import { NextResponse } from "next/server";



// Auth seller
export async function GET(request) {
    try {
        const {userId} = getAuth(request);
        const isSeller = await authSeller(userId);

        if(!isSeller){
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        const storeInfo = await prisma.store.findFirst({
            where: {
                userId
            }
        });
        
        return NextResponse.json({isSeller: true, storeInfo});

    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}