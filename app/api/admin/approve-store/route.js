import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";
import { sendStoreStatusEmail } from "@/lib/email";


// Approve Seller (store)

export async function POST(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if(!isAdmin) {
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        const { storeId, status, notes } = await request.json();

        // Fetch store details before update so we can email the owner
        const storeRecord = await prisma.store.findUnique({
            where: { id: storeId },
            select: { email: true, name: true }
        });

        if(status === 'approved') {
            await prisma.store.update({
                where: { id: storeId },
                data: { status: 'approved', isActive: true, rejectionNotes: null }
            })
        } else if(status === 'rejected') {
            await prisma.store.update({
                where: { id: storeId },
                data: { status: 'rejected', rejectionNotes: notes || null }
            });
        }

        // Notify store owner by email (non-blocking — don't fail the request if email errors)
        if (storeRecord?.email) {
            sendStoreStatusEmail({
                to: storeRecord.email,
                storeName: storeRecord.name,
                status,
                rejectionReason: notes || null
            }).catch(err => console.error('Store status email failed:', err.message));
        }

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: `STORE_${status.toUpperCase()}`, targetType: 'Store', targetId: storeId, notes });

        return NextResponse.json({message: `Store ${status} successfully`});
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}


// get all pending and rejected stores

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if(!isAdmin) {
            return NextResponse.json({error: "Not Unauthorized"}, {status: 401});
        }

        const stores = await prisma.store.findMany({
            where: {
                status: { in: ['pending', 'rejected'] }
            },
            include: {
                user: true
            }
        });

        return NextResponse.json({stores});
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: error.message || error.code}, {status: 400});
    }
}