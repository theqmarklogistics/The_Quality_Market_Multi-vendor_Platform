import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";


// auth admin

export async function GET(request) {
    try {
        const {userId} = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if(!isAdmin){
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        return NextResponse.json({isAdmin: true});

    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}