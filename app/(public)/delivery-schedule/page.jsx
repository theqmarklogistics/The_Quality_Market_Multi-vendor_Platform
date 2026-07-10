import DeliverySchedule from "@/components/external/DeliverySchedule";

export const metadata = {
    title: "Rider Departure Schedule — The Quality Market",
    description: "Public schedule of rider departures per hub and corridor for Kigali Pooled Delivery.",
};

// Public page: anyone (customers, senders, partners) can see when riders depart
// each hub along each corridor — no account needed.
export default function DeliverySchedulePage() {
    return (
        <div className="min-h-[70vh] mx-6 md:mx-16 lg:mx-32 my-10 max-w-3xl xl:mx-auto">
            <h1 className="text-2xl md:text-3xl text-slate-500">
                Rider <span className="text-slate-800 font-medium">Departure Schedule</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 mb-8">
                When our riders leave each hub along each corridor. Drop your package at the hub before the departure time to make that run.
            </p>
            <DeliverySchedule />
        </div>
    );
}
