'use client'
// Public rider departure schedule: which corridors run from which hub, on which
// weekday, at what time. Rendered on the public delivery-schedule page and the
// external partner dashboard. Data: GET /api/delivery/schedule (no auth).
import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarClockIcon, MapPinIcon, RouteIcon, WarehouseIcon } from "lucide-react";

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function DeliverySchedule() {
    const [hubs, setHubs] = useState(null);

    useEffect(() => {
        axios.get('/api/delivery/schedule')
            .then(res => setHubs(res.data.hubs || []))
            .catch(() => setHubs([]));
    }, []);

    if (hubs === null) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
        );
    }

    const hasSchedules = hubs.some(h => h.corridorRoutes.some(c => c.schedules.length > 0));

    if (!hasSchedules) {
        return (
            <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                <CalendarClockIcon size={36} className="text-slate-300 mb-3" />
                <p className="font-medium text-slate-500">No published departures yet</p>
                <p className="text-sm text-slate-400 mt-1">The rider departure schedule will appear here once routes are planned.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {hubs.filter(h => h.corridorRoutes.some(c => c.schedules.length > 0)).map(hub => (
                <div key={hub.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-3">
                        <WarehouseIcon size={16} className="text-green-400" />
                        <p className="font-semibold text-sm">{hub.name}</p>
                        {(hub.sector || hub.landmark) && (
                            <p className="text-xs text-white/60 flex items-center gap-1 ml-2">
                                <MapPinIcon size={11} /> {[hub.sector, hub.landmark].filter(Boolean).join(' · ')}
                            </p>
                        )}
                    </div>
                    <div className="divide-y divide-slate-100">
                        {hub.corridorRoutes.filter(c => c.schedules.length > 0).map(corridor => (
                            <div key={corridor.id} className="px-4 py-3">
                                <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                    <RouteIcon size={14} className="text-green-600" /> {corridor.name}
                                </p>
                                {corridor.areas?.length > 0 && (
                                    <p className="text-xs text-slate-400 mt-0.5">Serves: {corridor.areas.join(', ')}</p>
                                )}
                                {corridor.landmarks?.length > 0 && (
                                    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                                        <MapPinIcon size={11} className="text-green-600 shrink-0" />
                                        {corridor.landmarks.map((l, i) => (
                                            <span key={`${l}-${i}`}>{i > 0 && <span className="text-slate-300"> → </span>}{l}</span>
                                        ))}
                                    </p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {corridor.schedules.map(s => (
                                        <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-800">
                                            <CalendarClockIcon size={12} />
                                            {DAYS[s.dayOfWeek]} {s.departTime}
                                            {s.riderName && <span className="text-green-600/70">· {s.riderName}</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            <p className="text-[11px] text-slate-400">Drop your package at the hub before the departure time to make that run.</p>
        </div>
    );
}
