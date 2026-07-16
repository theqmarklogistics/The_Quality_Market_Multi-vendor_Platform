import Link from "next/link";
import { CalendarClockIcon, MapPinnedIcon } from "lucide-react";
import DeliveryNetwork from "@/components/external/DeliveryNetwork";

export const metadata = {
    title: "Delivery Network — Hubs & Agents | The Quality Market",
    description: "Find every registered hub, our agents around the city with their phone numbers, and the logistics manager's contact for Kigali Pooled Delivery.",
};

// Public page: anyone can find the nearest hub or agent — no account needed.
export default function DeliveryNetworkPage() {
    return (
        <div className="min-h-[70vh] mx-6 md:mx-16 lg:mx-32 my-10 max-w-5xl xl:mx-auto">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] p-8 sm:p-10 mb-10">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 text-green-700 text-xs font-semibold px-3 py-1">
                    <MapPinnedIcon size={14} /> Our delivery network
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mt-4">
                    Hubs &amp; agents, wherever you are
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-7 mt-3 max-w-2xl">
                    Every registered hub and every agent on the ground — with the phone number to call.
                    Drop a package at the nearest hub, or reach the agent closest to you and we take it from there.
                </p>
                <Link
                    href="/delivery-schedule"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-800 text-white text-sm font-medium px-5 py-2.5 hover:bg-slate-900 active:scale-95 transition"
                >
                    <CalendarClockIcon size={15} /> See rider departure times
                </Link>
            </div>

            <DeliveryNetwork />
        </div>
    );
}
