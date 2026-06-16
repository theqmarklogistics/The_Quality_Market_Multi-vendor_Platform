'use client'
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { PackagePlusIcon, RefreshCwIcon, CopyIcon, CheckIcon, MapPinIcon, FileTextIcon, UploadIcon, Loader2Icon } from "lucide-react";

const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "RWF";

const DELIVERY_BADGE = {
    PENDING_INTAKE: "bg-slate-100 text-slate-600",
    SORTING: "bg-indigo-100 text-indigo-700",
    IN_TRANSIT: "bg-blue-100 text-blue-700",
    ARRIVING: "bg-amber-100 text-amber-700",
    DELIVERED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
};

export default function ExternalDashboard() {
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [deliveries, setDeliveries] = useState([]);
    const [momo, setMomo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);
    const [uploadingId, setUploadingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [d, p] = await Promise.all([
                axios.get(`/api/delivery/external`, { headers: await authHeaders() }),
                axios.get(`/api/payment-config`),
            ]);
            setDeliveries(d.data.deliveries || []);
            setMomo(p.data || null);
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { load(); }, [load]);

    const copyLink = (id, token) => {
        navigator.clipboard?.writeText(`${APP_ORIGIN}/track/${id}?t=${token}`);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const uploadProof = async (orderId, file) => {
        if (!file) return;
        setUploadingId(orderId);
        try {
            const fd = new FormData();
            fd.append("orderId", orderId);
            fd.append("proofFile", file);
            await axios.post(`/api/orders/payment-proof`, fd, { headers: await authHeaders() });
            toast.success("Payment proof submitted — awaiting review");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally {
            setUploadingId(null);
        }
    };

    const paymentState = (d) => {
        if (d.isPaid) return { label: "Paid", cls: "bg-green-100 text-green-700" };
        if (d.paymentProofStatus === "SUBMITTED") return { label: "Payment under review", cls: "bg-amber-100 text-amber-700" };
        if (d.paymentProofStatus === "REJECTED") return { label: "Payment rejected — re-upload", cls: "bg-red-100 text-red-700" };
        return { label: "Awaiting payment", cls: "bg-slate-100 text-slate-600" };
    };

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">My Deliveries</h1>
                    <p className="text-sm text-slate-500">Book deliveries with The Quality Market and track them live.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={load} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-green-400"><RefreshCwIcon size={14} /> Refresh</button>
                    <Link href="/external/new" className="flex items-center gap-1.5 rounded-xl bg-green-600 text-white px-3 py-2 text-sm font-medium hover:bg-green-700"><PackagePlusIcon size={14} /> New delivery</Link>
                </div>
            </div>

            {momo?.momoConfigured && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    Pay the delivery fee to MoMo <b>{momo.momoPayCode}</b> ({momo.momoAccountName}), then upload your proof on the delivery below. We route it once payment is confirmed.
                </div>
            )}

            {loading ? (
                <p className="text-slate-400 text-center py-10">Loading…</p>
            ) : deliveries.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <PackagePlusIcon size={36} className="mx-auto mb-2 text-slate-300" />
                    <p>No deliveries yet. Book your first one.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {deliveries.map((d) => {
                        const pay = paymentState(d);
                        const needsProof = !d.isPaid && d.paymentProofStatus !== "SUBMITTED";
                        return (
                            <div key={d.orderId} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-slate-800">{d.recipientName || "Recipient"}</p>
                                            <span className="text-xs text-slate-400">{d.recipientSector || "—"}</span>
                                            {d.deliveryStatus && <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${DELIVERY_BADGE[d.deliveryStatus] || ""}`}>{d.deliveryStatus}</span>}
                                            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${pay.cls}`}>{pay.label}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{d.orderId}</p>
                                        {d.packageDescription && <p className="text-xs text-slate-500 mt-1">{d.packageDescription}</p>}
                                        <p className="text-sm text-slate-600 mt-1">Fee: <b>{currency} {d.total}</b> · Code: <b className="tracking-widest">{d.deliveryOtp}</b></p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => copyLink(d.orderId, d.trackingToken)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400">
                                                {copiedId === d.orderId ? <CheckIcon size={12} className="text-green-600" /> : <CopyIcon size={12} />} Track link
                                            </button>
                                            <Link href={`/track/${d.orderId}?t=${d.trackingToken}`} target="_blank" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400"><MapPinIcon size={12} /> Track</Link>
                                            <a href={`/api/delivery/external/label/${d.orderId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-green-400"><FileTextIcon size={12} /> Label</a>
                                        </div>
                                        {needsProof && (
                                            <label className="flex items-center gap-1 rounded-lg bg-slate-800 text-white px-2 py-1 text-xs font-medium hover:bg-slate-900 cursor-pointer">
                                                {uploadingId === d.orderId ? <Loader2Icon size={12} className="animate-spin" /> : <UploadIcon size={12} />} Upload payment proof
                                                <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploadingId === d.orderId} onChange={(e) => uploadProof(d.orderId, e.target.files?.[0])} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
