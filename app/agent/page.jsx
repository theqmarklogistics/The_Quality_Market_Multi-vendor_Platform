import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
    PackagePlusIcon,
    CalendarClockIcon,
    MapPinnedIcon,
    PhoneIcon,
    MapPinIcon,
    ContactIcon,
    PackageIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_BADGE = {
    PENDING_INTAKE: "bg-amber-100 text-amber-700",
    SORTING: "bg-blue-100 text-blue-700",
    IN_TRANSIT: "bg-indigo-100 text-indigo-700",
    ARRIVING: "bg-violet-100 text-violet-700",
    DELIVERED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
};

// Agent console: their public contact card, quick actions (record a walk-up
// delivery, check departures), and the walk-up deliveries they recorded.
export default async function AgentPage() {
    const { userId } = await auth();
    if (!userId) return redirect("/sign-in");

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, name: true, staffProfile: true },
    });
    if (!user || (user.role !== "AGENT" && user.role !== "ADMIN")) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
                <h2 className="text-xl font-semibold">Agents only</h2>
                <p className="text-sm text-slate-600 mt-1">This area is for our location agents. Ask an admin to grant you the AGENT role.</p>
            </div>
        );
    }

    const recentDeliveries = await prisma.order.findMany({
        where: { userId, isExternalDelivery: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            id: true,
            createdAt: true,
            total: true,
            deliveryStatus: true,
            packageDescription: true,
            senderName: true,
        },
    });

    const profile = user.staffProfile;

    return (
        <div className="max-w-4xl mx-auto px-6 py-10 mb-20">
            <h1 className="text-2xl text-slate-500">
                Agent <span className="text-slate-800 font-medium">Console</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
                Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""} — record walk-up packages and keep an eye on departures.
            </p>

            {/* Public contact card */}
            <div className="mt-6 rounded-2xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700 flex items-center gap-1.5">
                    <ContactIcon size={13} /> Your public contact card
                </p>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-slate-700">
                    <span className="flex items-center gap-1.5">
                        <PhoneIcon size={14} className="text-green-600" />
                        {profile?.phone || <span className="text-amber-600">No phone recorded — ask an admin to add it</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <MapPinIcon size={14} className="text-green-600" />
                        {[profile?.sector, profile?.landmark].filter(Boolean).join(" · ") || <span className="text-amber-600">No location recorded</span>}
                    </span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    {profile?.isPublic === false
                        ? "Currently hidden from the public delivery-network page."
                        : "Shown publicly on the delivery-network page so senders near you can call."}
                </p>
            </div>

            {/* Quick actions */}
            <div className="grid sm:grid-cols-3 gap-4 mt-6">
                <Link href="/external/new" className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-green-300 hover:shadow-md transition">
                    <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center group-hover:scale-105 transition">
                        <PackagePlusIcon size={18} />
                    </div>
                    <p className="font-medium text-slate-700 mt-3">Record a delivery</p>
                    <p className="text-sm text-slate-500 mt-1 leading-6">Someone walked up with a package? Book it into the pooled pipeline.</p>
                </Link>
                <Link href="/delivery-schedule" className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-green-300 hover:shadow-md transition">
                    <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center group-hover:scale-105 transition">
                        <CalendarClockIcon size={18} />
                    </div>
                    <p className="font-medium text-slate-700 mt-3">Departure schedule</p>
                    <p className="text-sm text-slate-500 mt-1 leading-6">When riders leave each hub — tell senders the next run.</p>
                </Link>
                <Link href="/delivery-network" className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-green-300 hover:shadow-md transition">
                    <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center group-hover:scale-105 transition">
                        <MapPinnedIcon size={18} />
                    </div>
                    <p className="font-medium text-slate-700 mt-3">Delivery network</p>
                    <p className="text-sm text-slate-500 mt-1 leading-6">All hubs and fellow agents — where your card is published.</p>
                </Link>
            </div>

            {/* Recent walk-up deliveries */}
            <div className="mt-8">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><PackageIcon size={16} /></span>
                    Walk-ups you recorded
                </h2>
                {recentDeliveries.length === 0 ? (
                    <div className="mt-4 flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                        <PackageIcon size={34} className="text-slate-300 mb-2" />
                        <p className="font-medium text-slate-500">Nothing recorded yet</p>
                        <p className="text-sm text-slate-400 mt-1">Walk-up deliveries you book will appear here.</p>
                    </div>
                ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-sm text-left text-slate-600">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Sender</th>
                                    <th className="px-4 py-3">Package</th>
                                    <th className="px-4 py-3 text-right">Fee (Rwf)</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {recentDeliveries.map((d) => (
                                    <tr key={d.id}>
                                        <td className="px-4 py-3 whitespace-nowrap">{new Date(d.createdAt).toLocaleDateString()}</td>
                                        <td className="px-4 py-3">{d.senderName || "—"}</td>
                                        <td className="px-4 py-3 max-w-56 truncate">{d.packageDescription || "—"}</td>
                                        <td className="px-4 py-3 text-right">{Number(d.total || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[d.deliveryStatus] || "bg-slate-100 text-slate-500"}`}>
                                                {(d.deliveryStatus || "PENDING").replace(/_/g, " ").toLowerCase()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
