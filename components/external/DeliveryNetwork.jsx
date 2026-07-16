'use client'
// Public delivery network directory: active hubs (with map links), agents
// stationed around the city, and the logistics manager's contact. Rendered on
// the public /delivery-network page. Data: GET /api/delivery/network (no auth).
import { useEffect, useState } from "react";
import Image from "next/image";
import axios from "axios";
import {
    WarehouseIcon,
    MapPinIcon,
    PhoneIcon,
    UsersIcon,
    HeadsetIcon,
    ExternalLinkIcon,
} from "lucide-react";

function PhoneLink({ phone, className = "" }) {
    if (!phone) return null;
    return (
        <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className={`inline-flex items-center gap-1.5 rounded-full bg-green-600 text-white text-xs font-semibold px-3.5 py-2 hover:bg-green-700 active:scale-95 transition ${className}`}
        >
            <PhoneIcon size={13} /> {phone}
        </a>
    );
}

function StaffCard({ person, roleLabel }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
                {person.image ? (
                    <Image src={person.image} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover border border-slate-100" />
                ) : (
                    <div className="h-11 w-11 rounded-full bg-green-50 text-green-700 flex items-center justify-center font-semibold">
                        {(person.name || '?').charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{person.name}</p>
                    <p className="text-xs text-slate-400">{roleLabel}</p>
                </div>
            </div>
            {(person.sector || person.landmark) && (
                <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-500">
                    <MapPinIcon size={14} className="text-green-600 shrink-0 mt-0.5" />
                    {[person.sector, person.landmark].filter(Boolean).join(' · ')}
                </p>
            )}
            <div className="mt-3">
                {person.phone
                    ? <PhoneLink phone={person.phone} />
                    : <span className="text-xs text-slate-400">Phone coming soon</span>}
            </div>
        </div>
    );
}

export default function DeliveryNetwork() {
    const [data, setData] = useState(null);

    useEffect(() => {
        axios.get('/api/delivery/network')
            .then(res => setData(res.data))
            .catch(() => setData({ hubs: [], agents: [], managers: [] }));
    }, []);

    if (data === null) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
        );
    }

    const { hubs = [], agents = [], managers = [] } = data;
    const isEmpty = hubs.length === 0 && agents.length === 0 && managers.length === 0;

    if (isEmpty) {
        return (
            <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                <WarehouseIcon size={36} className="text-slate-300 mb-3" />
                <p className="font-medium text-slate-500">Network details coming soon</p>
                <p className="text-sm text-slate-400 mt-1">Our hubs and agents will be published here shortly.</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* Logistics manager(s) */}
            {managers.length > 0 && (
                <section>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><HeadsetIcon size={16} /></span>
                        Logistics manager
                    </h2>
                    <p className="text-sm text-slate-400 mt-1 mb-4">The person coordinating every delivery run — call for anything a hub or agent can&apos;t solve.</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {managers.map(m => <StaffCard key={m.id} person={m} roleLabel="Logistics manager" />)}
                    </div>
                </section>
            )}

            {/* Agents */}
            {agents.length > 0 && (
                <section>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><UsersIcon size={16} /></span>
                        Our agents
                    </h2>
                    <p className="text-sm text-slate-400 mt-1 mb-4">Stationed across the city — call the agent nearest to you to hand over or receive a package.</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {agents.map(a => <StaffCard key={a.id} person={a} roleLabel="Agent" />)}
                    </div>
                </section>
            )}

            {/* Hubs */}
            {hubs.length > 0 && (
                <section>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><WarehouseIcon size={16} /></span>
                        Registered hubs
                    </h2>
                    <p className="text-sm text-slate-400 mt-1 mb-4">Drop-off and dispatch points. Bring your package before the corridor departure time.</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {hubs.map(hub => (
                            <div key={hub.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-slate-900 text-green-400 flex items-center justify-center">
                                        <WarehouseIcon size={20} />
                                    </div>
                                    <p className="font-semibold text-slate-800">{hub.name}</p>
                                </div>
                                {(hub.sector || hub.landmark) && (
                                    <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-500">
                                        <MapPinIcon size={14} className="text-green-600 shrink-0 mt-0.5" />
                                        {[hub.sector, hub.landmark].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                                {hub.latitude != null && hub.longitude != null && (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${hub.latitude},${hub.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 text-green-700 text-xs font-semibold px-3.5 py-2 hover:bg-green-50 active:scale-95 transition"
                                    >
                                        <ExternalLinkIcon size={13} /> Open in Maps
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
