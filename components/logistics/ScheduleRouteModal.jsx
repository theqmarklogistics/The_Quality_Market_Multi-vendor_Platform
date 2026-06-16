'use client'
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { XIcon, CalendarPlusIcon, PackageIcon, Loader2Icon } from "lucide-react";

// Schedule a new delivery route (corridor): name it, pick a run date, optionally
// pre-assign a rider, and load specific un-corridored pooled orders onto it.
export default function ScheduleRouteModal({ open, onClose, onCreated, riders = [], defaultDate }) {
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [name, setName] = useState("");
    const [runDate, setRunDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
    const [riderId, setRiderId] = useState("");
    const [baseRouteCost, setBaseRouteCost] = useState(10000);
    const [poolable, setPoolable] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Reset and load the available order pool whenever the modal opens.
    useEffect(() => {
        if (!open) return;
        setName("");
        setRunDate(defaultDate || new Date().toISOString().slice(0, 10));
        setRiderId("");
        setBaseRouteCost(10000);
        setSelected(new Set());
        (async () => {
            setLoadingOrders(true);
            try {
                const { data } = await axios.get(`/api/logistics/orders/poolable`, { headers: await authHeaders() });
                setPoolable(data.orders || []);
            } catch (err) {
                toast.error(err?.response?.data?.error || err.message);
            } finally {
                setLoadingOrders(false);
            }
        })();
    }, [open, defaultDate, authHeaders]);

    const toggle = (orderId) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(orderId) ? next.delete(orderId) : next.add(orderId);
            return next;
        });
    };

    const allSelected = poolable.length > 0 && selected.size === poolable.length;
    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(poolable.map((o) => o.orderId)));
    };

    const grouped = useMemo(() => {
        const m = new Map();
        for (const o of poolable) {
            const key = o.sector || "Unsorted";
            if (!m.has(key)) m.set(key, []);
            m.get(key).push(o);
        }
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [poolable]);

    const submit = async () => {
        if (!name.trim()) return toast.error("Give the route a name");
        if (!runDate) return toast.error("Pick a run date");
        setSubmitting(true);
        try {
            const { data } = await axios.post(
                `/api/logistics/corridors`,
                {
                    name: name.trim(),
                    runDate,
                    riderId: riderId || null,
                    baseRouteCost: Number(baseRouteCost) || undefined,
                    orderIds: [...selected],
                },
                { headers: await authHeaders() }
            );
            toast.success(`Route scheduled${data.stops ? ` with ${data.stops} stop(s)` : ""}`);
            onCreated?.();
            onClose?.();
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-100 p-5">
                    <div className="flex items-center gap-2">
                        <CalendarPlusIcon size={20} className="text-slate-600" />
                        <h2 className="text-lg font-bold text-slate-800">Schedule a route</h2>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><XIcon size={18} /></button>
                </div>

                <div className="space-y-4 p-5">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Route name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Hub → Kimironko (morning)"
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Run date</label>
                            <input
                                type="date"
                                value={runDate}
                                onChange={(e) => setRunDate(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Route cost (RWF)</label>
                            <input
                                type="number"
                                min={0}
                                value={baseRouteCost}
                                onChange={(e) => setBaseRouteCost(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500">Assign rider (optional)</label>
                        <select
                            value={riderId}
                            onChange={(e) => setRiderId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
                        >
                            <option value="">Unassigned</option>
                            {riders.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}{r.vehicleType ? ` (${r.vehicleType})` : ""}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500">
                                Load orders {selected.size > 0 && <span className="text-green-600">· {selected.size} selected</span>}
                            </label>
                            {poolable.length > 0 && (
                                <button onClick={toggleAll} className="text-xs font-medium text-slate-500 hover:text-green-600">
                                    {allSelected ? "Clear all" : "Select all"}
                                </button>
                            )}
                        </div>
                        <div className="rounded-xl border border-slate-200">
                            {loadingOrders ? (
                                <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                                    <Loader2Icon size={14} className="animate-spin" /> Loading pooled orders…
                                </p>
                            ) : poolable.length === 0 ? (
                                <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
                                    <PackageIcon size={14} /> No un-routed pooled orders right now.
                                </p>
                            ) : (
                                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                                    {grouped.map(([sector, items]) => (
                                        <div key={sector}>
                                            <p className="bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{sector}</p>
                                            {items.map((o) => (
                                                <label key={o.orderId} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(o.orderId)}
                                                        onChange={() => toggle(o.orderId)}
                                                        className="accent-green-600"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium text-slate-700">{o.recipientName || "Customer"}</p>
                                                        <p className="truncate text-xs text-slate-400">
                                                            {o.storeName ? `${o.storeName} · ` : ""}{o.landmarkAddress || o.deliveryStatus}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">{o.deliveryStatus}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                            Stops are auto-ordered from the hub and the route cost split by distance. You can also leave this empty and batch orders in later.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
                    <button onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                    <button
                        onClick={submit}
                        disabled={submitting}
                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        {submitting ? <Loader2Icon size={14} className="animate-spin" /> : <CalendarPlusIcon size={14} />}
                        Schedule route
                    </button>
                </div>
            </div>
        </div>
    );
}
