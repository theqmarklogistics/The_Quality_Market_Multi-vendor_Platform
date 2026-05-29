import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";




const authAdmin = async (userId) => {
    try {
        if(!userId) return false;

        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        })

        if (userRecord?.role === 'ADMIN') {
            return true
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        const adminEmails = (process.env.ADMIN_EMAIL || '')
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean);

        const primaryEmail = user.emailAddresses
            .find(e => e.id === user.primaryEmailAddressId)
            ?.emailAddress?.toLowerCase()

        return !!primaryEmail && adminEmails.includes(primaryEmail)

    } catch (error) {
        console.error(error);
        return false;
    }
}

export default authAdmin;