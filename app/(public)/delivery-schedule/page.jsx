import Link from "next/link";
import DeliverySchedule from "@/components/external/DeliverySchedule";
import {
    CalendarClockIcon,
    PackageIcon,
    RouteIcon,
    SmartphoneIcon,
    MapPinnedIcon,
    ArrowRightIcon,
} from "lucide-react";

export const metadata = {
    title: "Rider Departure Schedule — The Quality Market",
    description: "Public schedule of rider departures per hub and corridor for Kigali Pooled Delivery.",
};

// How a pooled delivery run works, start to finish.
const HOW_IT_WORKS = [
    {
        icon: PackageIcon,
        title: '1 · Drop your package',
        body: 'Bring it to any hub — or hand it to the agent nearest you — before the corridor’s departure time.',
    },
    {
        icon: RouteIcon,
        title: '2 · The rider runs the corridor',
        body: 'Your package shares the route with others heading the same way, so everyone pays less.',
    },
    {
        icon: SmartphoneIcon,
        title: '3 · Track it live to the door',
        body: 'The recipient follows the rider on a live map and confirms handover with a one-time code.',
    },
];

// Public page: anyone (customers, senders, partners) can see when riders depart
// each hub along each corridor — no account needed.
export default function DeliverySchedulePage() {
    return (
        <div className="min-h-[70vh] mx-6 md:mx-16 lg:mx-32 my-10 max-w-3xl xl:mx-auto">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] p-8 sm:p-10 mb-8">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 text-green-700 text-xs font-semibold px-3 py-1">
                    <CalendarClockIcon size={14} /> Kigali Pooled Delivery
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mt-4">
                    Rider departure schedule
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-7 mt-3 max-w-xl">
                    When our riders leave each hub along each corridor. Drop your package before the
                    departure time and it makes that run — shared routes, smaller fees.
                </p>
            </div>

            {/* How it works */}
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
                {HOW_IT_WORKS.map((step) => (
                    <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-green-200 transition">
                        <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                            <step.icon size={18} />
                        </div>
                        <p className="font-medium text-slate-700 mt-3 text-sm">{step.title}</p>
                        <p className="text-sm text-slate-500 mt-1 leading-6">{step.body}</p>
                    </div>
                ))}
            </div>

            {/* Find hubs & agents */}
            <Link
                href="/delivery-network"
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-900 p-5 mb-10 hover:bg-slate-800 transition"
            >
                <div className="flex items-center gap-4 min-w-0">
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-white/10 text-green-400 flex items-center justify-center">
                        <MapPinnedIcon size={20} />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-white">Find hubs &amp; agents near you</p>
                        <p className="text-sm text-white/60 mt-0.5">Every drop-off point and the phone number of the agent closest to you.</p>
                    </div>
                </div>
                <ArrowRightIcon size={18} className="shrink-0 text-green-400 group-hover:translate-x-1 transition-transform" />
            </Link>

            <h2 className="text-lg font-semibold text-slate-800 mb-4">Departures by hub</h2>
            <DeliverySchedule />
        </div>
    );
}
