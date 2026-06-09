'use client'
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import LiveMap from "@/components/delivery/LiveMap";
import { initializeSocket } from "@/lib/socketClient";
import { TruckIcon, CheckCircleIcon, PackageIcon, RefreshCwIcon } from "lucide-react";

const CORRIDOR_BADGE = {
    OPEN: "bg-slate-100 text-slate-600",
    CLOSED: "bg-amber-100 text-amber-700",
    IN_TRANSIT: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DispatchBoard() {
    const { getToken } = useAuth();
    const [date, setDate] = useState(todayStr());
    const [corridors, setCorridors] = useState([]);
    const [riders, setRiders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        try {
            const headers = await authHeaders();
            const [c, r] = await Promise.all([
                axios.get(`/api/logistics/corridors?date=${date}`, { headers }),
                axios.get(`/api/logistics/riders`, { headers }),
            ]);
            setCorridors(c.data.corridors || []);
            setRiders(r.data.riders || []);
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

    // Aggregate map: every dispatched rider pin + every stop across corridors
    const { mapRider, mapStops } = useMemo(() => {
        const allStops = [];
        let firstRider = null;
        corridors.forEach(c => {
            if (c.riderLat != null && c.riderLng != null && !firstRider) firstRider = { lat: c.riderLat, lng: c.riderLng };
            c.stops.forEach(s => { if (s.lat != null && s.lng != null) allStops.push({ id: s.orderId, lat: s.lat, lng: s.lng, stopSequence: s.stopSequence, label: `${c.name} · #${s.stopSequence}` }); });
        });
        return { mapRider: firstRider, mapStops: allStops };
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
                    <button onClick={() => load()} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-green-400"><RefreshCwIcon size={14} /> Refresh</button>
                </div>
            </div>

            {/* Live overview map */}
            <div className="rounded-3xl bg-white border border-slate-200 p-3 shadow-sm mb-6">
                <LiveMap riderPos={mapRider} stops={mapStops} showRoute height={300} />
            </div>

            {loading ? (
                <p className="text-slate-400 text-center py-10">Loading corridors…</p>
            ) : corridors.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <PackageIcon size={36} className="mx-auto mb-2 text-slate-300" />
                    <p>No corridors for this date. Pooled orders are batched daily at 11:00 AM.</p>
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
                                    {c.stops.map(s => (
                                        <div key={s.orderId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold">{s.stopSequence}</span>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-slate-800 truncate">{s.recipientName || "Customer"} · <span className="text-slate-400">{s.sector || "—"}</span></p>
                                                    {s.landmarkAddress && <p className="text-xs text-slate-400 truncate">{s.landmarkAddress}</p>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] font-semibold text-slate-500">{s.deliveryStatus}</span>
                                                {s.deliveryStatus === "PENDING_INTAKE" && (
                                                    <button disabled={busy} onClick={() => markIntake(s.orderId)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400">Mark sorted</button>
                                                )}
                                                {s.deliveryStatus === "DELIVERED" && <CheckCircleIcon size={16} className="text-green-600" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
