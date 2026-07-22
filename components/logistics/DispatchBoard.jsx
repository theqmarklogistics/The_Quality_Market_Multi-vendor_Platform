'use client'
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import LiveMap from "@/components/delivery/LiveMap";
import ScheduleRouteModal from "@/components/logistics/ScheduleRouteModal";
import ExternalDeliveryModal from "@/components/logistics/ExternalDeliveryModal";
import { initializeSocket } from "@/lib/socketClient";
import { haversineKm, KIGALI_HUB } from "@/lib/deliveryEta";
import Link from "next/link";
import { TruckIcon, CheckCircleIcon, PackageIcon, RefreshCwIcon, LayersIcon, RotateCcwIcon, BanknoteIcon, CalendarPlusIcon, PackagePlusIcon, FileTextIcon, BarChart3Icon } from "lucide-react";

const CORRIDOR_BADGE = {
    OPEN: "bg-slate-100 text-slate-600",
    CLOSED: "bg-amber-100 text-amber-700",
    IN_TRANSIT: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

// The four staff-issued documents for an external booking (partners no longer
// print these themselves). Plain links — the PDF routes authenticate via the
// signed-in Clerk session.
const EXTERNAL_DOCS = [
    { label: "Invoice", href: (id) => `/api/delivery/external/docs/${id}?type=invoice` },
    { label: "Label", href: (id) => `/api/delivery/external/label/${id}` },
    { label: "Sender receipt", href: (id) => `/api/delivery/external/docs/${id}?type=sender` },
    { label: "Delivery confirmation", href: (id) => `/api/delivery/external/docs/${id}?type=receiver` },
];

function ExternalDocLinks({ orderId }) {
    return (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {EXTERNAL_DOCS.map((d) => (
                <a key={d.label} href={d.href(orderId)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-green-400">
                    <FileTextIcon size={11} /> {d.label}
                </a>
            ))}
        </div>
    );
}

export default function DispatchBoard() {
    const { getToken } = useAuth();
    const [date, setDate] = useState(todayStr());
    const [corridors, setCorridors] = useState([]);
    const [poolable, setPoolable] = useState([]);
    const [riders, setRiders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [externalOpen, setExternalOpen] = useState(false);

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        try {
            const headers = await authHeaders();
            const [c, r, p] = await Promise.all([
                axios.get(`/api/logistics/corridors?date=${date}`, { headers }),
                axios.get(`/api/logistics/riders`, { headers }),
                axios.get(`/api/logistics/orders/poolable`, { headers }),
            ]);
            setCorridors(c.data.corridors || []);
            setRiders(r.data.riders || []);
            setPoolable(p.data.orders || []);
        } catch (err) {
            if (!silent) toast.error(err?.response?.data?.error || err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [authHeaders, date]);

    useEffect(() => { load(); }, [load]);

    // Realtime board updates
    useEffect(() => {
        let socket = null, active = true;
        (async () => {
            try {
                const token = await getToken();
                if (!active || !token) return;
                socket = initializeSocket(token);
                if (!socket) return;
                socket.emit("join-logistics-room");
                socket.on("rider-location-update", (p) => {
                    setCorridors(prev => prev.map(c => c.id === p.corridorId ? { ...c, riderLat: p.lat, riderLng: p.lng, riderLocationAt: p.at } : c));
                });
                socket.on("delivery-status-update", () => load({ silent: true }));
                socket.on("corridor-update", () => load({ silent: true }));
                socket.on("customer-location-update", () => load({ silent: true }));
            } catch (_) { /* polling fallback */ }
        })();
        const poll = setInterval(() => load({ silent: true }), 25000);
        return () => {
            active = false; clearInterval(poll);
            if (socket) { socket.emit("leave-logistics-room"); socket.off("rider-location-update"); socket.off("delivery-status-update"); socket.off("corridor-update"); socket.off("customer-location-update"); }
        };
    }, [getToken, load]);

    const assignRider = async (corridorId, riderId) => {
        setBusy(true);
        try {
            await axios.post(`/api/logistics/corridors/${corridorId}/assign-rider`, { riderId: riderId || null }, { headers: await authHeaders() });
            load({ silent: true });
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setBusy(false); }
    };

    const corridorAction = async (corridorId, action) => {
        setBusy(true);
        try {
            await axios.post(`/api/logistics/corridors/${corridorId}/status`, { action }, { headers: await authHeaders() });
            toast.success(`Corridor ${action}ed`);
            load({ silent: true });
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setBusy(false); }
    };

    const markIntake = async (orderId) => {
        setBusy(true);
        try {
            await axios.post(`/api/logistics/orders/${orderId}/intake`, {}, { headers: await authHeaders() });
            load({ silent: true });
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setBusy(false); }
    };

    const resolveFailed = async (orderId, action) => {
        setBusy(true);
        try {
            await axios.post(`/api/logistics/orders/${orderId}/resolve`, { action }, { headers: await authHeaders() });
            toast.success(action === "repool" ? "Order sent back to the batching queue" : "Order refunded");
            load({ silent: true });
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setBusy(false); }
    };

    const runBatching = async () => {
        setBusy(true);
        try {
            const { data } = await axios.post(`/api/logistics/batch`, {}, { headers: await authHeaders() });
            toast.success(data.batched ? `Batched ${data.batched} order(s) into ${data.corridors} corridor(s)` : "No pending orders to batch");
            load({ silent: true });
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setBusy(false); }
    };

    // Aggregate map: every dispatched rider pin + every stop across corridors
    const { mapRiders, mapStops } = useMemo(() => {
        const allStops = [];
        const allRiders = [];
        corridors.forEach(c => {
            if (c.riderLat != null && c.riderLng != null) {
                allRiders.push({ id: c.id, lat: c.riderLat, lng: c.riderLng, label: `${c.rider?.name || "Rider"} · ${c.name}` });
            }
            c.stops.forEach(s => { if (s.lat != null && s.lng != null) allStops.push({ id: s.orderId, lat: s.lat, lng: s.lng, stopSequence: s.stopSequence, label: `${c.name} · #${s.stopSequence}` }); });
        });
        return { mapRiders: allRiders, mapStops: allStops };
    }, [corridors]);

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dispatch Board</h1>
                    <p className="text-sm text-slate-500">Assign riders, dispatch corridors, and monitor deliveries live.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <button onClick={() => setScheduleOpen(true)} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-green-600 text-white px-3 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"><CalendarPlusIcon size={14} /> Schedule route</button>
                    <button onClick={() => setExternalOpen(true)} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:border-green-400"><PackagePlusIcon size={14} /> External delivery</button>
                    <button onClick={runBatching} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-slate-800 text-white px-3 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-50"><LayersIcon size={14} /> Batch now</button>
                    <Link href="/logistics/reports" className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-green-400"><BarChart3Icon size={14} /> Reports</Link>
                    <button onClick={() => load()} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-green-400"><RefreshCwIcon size={14} /> Refresh</button>
                </div>
            </div>

            {/* Live overview map */}
            <div className="rounded-3xl bg-white border border-slate-200 p-3 shadow-sm mb-6">
                <LiveMap riders={mapRiders} stops={mapStops} showRoute height={300} />
            </div>

            {/* Available deliveries — un-batched pooled packages (internal + external)
                awaiting intake/sorting at the hub. "Batch now" sweeps the routable
                ones into corridors; unpaid external bookings show a Payment pending
                badge and are held out of routing until paid. */}
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm mb-6 overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <PackageIcon size={18} className="text-slate-500" />
                        <p className="font-semibold text-slate-800">Available deliveries</p>
                        <span className="text-xs text-slate-400">({poolable.length})</span>
                    </div>
                    <button onClick={runBatching} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-slate-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-900 disabled:opacity-50"><LayersIcon size={14} /> Batch now</button>
                </div>
                {poolable.length === 0 ? (
                    <p className="text-sm text-slate-400 px-4 py-6 text-center">No packages awaiting intake. New drop-offs and external bookings appear here.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {poolable.map(o => (
                            <div key={o.orderId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-800 truncate">
                                        {o.recipientName || "Recipient"} · <span className="text-slate-400">{o.sector || "—"}</span>
                                    </p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        {o.isExternalDelivery
                                            ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">External</span>
                                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{o.storeName || "Store"}</span>}
                                        {o.intakeMethod && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                                {o.intakeMethod === "DRIVER_SWEEP" ? "Driver sweep" : "Hub drop-off"}
                                            </span>
                                        )}
                                        {o.paymentPending && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Payment pending</span>
                                        )}
                                    </div>
                                    {(o.landmarkAddress || o.packageDescription) && (
                                        <p className="mt-0.5 text-xs text-slate-400 truncate">{o.packageDescription || o.landmarkAddress}</p>
                                    )}
                                    {o.isExternalDelivery && <ExternalDocLinks orderId={o.orderId} />}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-semibold text-slate-500">{o.deliveryStatus}</span>
                                    {o.deliveryStatus === "PENDING_INTAKE" && (
                                        <button disabled={busy} onClick={() => markIntake(o.orderId)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400">Mark sorted</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {loading ? (
                <p className="text-slate-400 text-center py-10">Loading corridors…</p>
            ) : corridors.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <PackageIcon size={36} className="mx-auto mb-2 text-slate-300" />
                    <p>No corridors for this date. Use <span className="font-medium text-slate-500">Schedule route</span> or <span className="font-medium text-slate-500">Batch now</span> to create one.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {corridors.map(c => {
                        const delivered = c.stops.filter(s => s.deliveryStatus === "DELIVERED").length;
                        return (
                            <div key={c.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <TruckIcon size={20} className="text-slate-500" />
                                        <div>
                                            <p className="font-semibold text-slate-800">{c.name}</p>
                                            <p className="text-xs text-slate-400">{delivered}/{c.stops.length} delivered</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${CORRIDOR_BADGE[c.status] || ""}`}>{c.status}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            value={c.rider?.id || ""}
                                            onChange={e => assignRider(c.id, e.target.value)}
                                            disabled={busy}
                                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm"
                                        >
                                            <option value="">Unassigned</option>
                                            {riders.map(r => <option key={r.id} value={r.id}>{r.name}{r.vehicleType ? ` (${r.vehicleType})` : ""}</option>)}
                                        </select>
                                        {(c.status === "CLOSED" || c.status === "OPEN") && (
                                            <button disabled={busy} onClick={() => corridorAction(c.id, "dispatch")} className="rounded-xl bg-blue-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Dispatch</button>
                                        )}
                                        {c.status === "IN_TRANSIT" && (
                                            <button disabled={busy} onClick={() => corridorAction(c.id, "complete")} className="rounded-xl bg-green-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50">Complete</button>
                                        )}
                                    </div>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {c.stops.map(s => {
                                    const hubKm = (s.lat != null && s.lng != null) ? haversineKm(KIGALI_HUB, { lat: s.lat, lng: s.lng }) : null;
                                    return (
                                        <div key={s.orderId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold">{s.stopSequence}</span>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-slate-800 truncate">
                                                        {s.recipientName || "Customer"} · <span className="text-slate-400">{s.sector || "—"}</span>
                                                        {hubKm != null && <span className="ml-2 text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{hubKm.toFixed(1)} km from hub</span>}
                                                    </p>
                                                    {s.landmarkAddress && <p className="text-xs text-slate-400 truncate">{s.landmarkAddress}</p>}
                                                    {s.isExternalDelivery && <ExternalDocLinks orderId={s.orderId} />}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] font-semibold text-slate-500">{s.deliveryStatus}</span>
                                                {s.deliveryStatus === "PENDING_INTAKE" && (
                                                    <button disabled={busy} onClick={() => markIntake(s.orderId)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400">Mark sorted</button>
                                                )}
                                                {s.deliveryStatus === "FAILED" && (
                                                    <>
                                                        <button disabled={busy} onClick={() => resolveFailed(s.orderId, "repool")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-blue-400 text-blue-600"><RotateCcwIcon size={12} /> Re-pool</button>
                                                        <button disabled={busy} onClick={() => resolveFailed(s.orderId, "refund")} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-red-400 text-red-600"><BanknoteIcon size={12} /> Refund</button>
                                                    </>
                                                )}
                                                {s.deliveryStatus === "DELIVERED" && <CheckCircleIcon size={16} className="text-green-600" />}
                                            </div>
                                        </div>
                                    );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ScheduleRouteModal
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                onCreated={() => load({ silent: true })}
                riders={riders}
                defaultDate={date}
            />

            <ExternalDeliveryModal
                open={externalOpen}
                onClose={() => setExternalOpen(false)}
                onCreated={() => load({ silent: true })}
            />
        </div>
    );
}
