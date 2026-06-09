import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import RiderConsole from "@/components/rider/RiderConsole";

export const dynamic = "force-dynamic";

export default async function RiderPage() {
    const { userId } = await auth();
    if (!userId) return redirect("/sign-in");

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || (user.role !== "RIDER" && user.role !== "ADMIN")) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
                <h2 className="text-xl font-semibold">Riders only</h2>
                <p className="text-sm text-slate-600 mt-1">This area is for delivery riders. Ask an admin to grant you the RIDER role.</p>
            </div>
        );
    }

    return <RiderConsole />;
}
