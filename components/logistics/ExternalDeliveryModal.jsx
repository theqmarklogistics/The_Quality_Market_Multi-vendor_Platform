'use client'
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { KIGALI_SECTORS } from "@/lib/constants";
import { XIcon, PackagePlusIcon, Loader2Icon, CopyIcon, CheckIcon, CrosshairIcon, MapPinIcon, CheckCircleIcon } from "lucide-react";
import LocationPicker from "@/components/delivery/LocationPicker";

const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "RWF";

// Staff-side booking of an off-platform (external) delivery on a partner's behalf.
export default function ExternalDeliveryModal({ open, onClose, onCreated }) {
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [partners, setPartners] = useState([]);
    const [partnerId, setPartnerId] = useState("");
    const [newPartnerName, setNewPartnerName] = useState("");
    const [creatingPartner, setCreatingPartner] = useState(false);

    const [form, setForm] = useState(blankForm());
    const [quote, setQuote] = useState(null);
    const [locating, setLocating] = useState(false);
    const [markPaid, setMarkPaid] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);

    function blankForm() {
        return {
            recipientName: "", recipientPhone: "", recipientEmail: "", recipientSector: "", recipientLandmark: "",
            intakeMethod: "HUB_DROP_OFF", pickupContactName: "", pickupPhone: "", pickupLandmark: "",
            packageDescription: "", declaredValue: "", paymentMethod: "MTN_MOMO",
            packageWeightKg: "", packageLengthCm: "", packageWidthCm: "", packageHeightCm: "",
            recipientLat: null, recipientLng: null,
        };
    }
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const hasPin = form.recipientLat != null && form.recipientLng != null;

    const loadPartners = useCallback(async () => {
        try {
            const { data } = await axios.get(`/api/logistics/partners`, { headers: await authHeaders() });
            setPartners(data.partners || []);
        } catch (err) { toast.error(err?.response?.data?.error || err.message); }
    }, [authHeaders]);

    useEffect(() => {
        if (!open) return;
        setForm(blankForm()); setPartnerId(""); setNewPartnerName(""); setMarkPaid(true); setResult(null); setCopied(false); setQuote(null);
        loadPartners();
    }, [open, loadPartners]);

    // Live quote whenever a pricing input changes (sector, weight, dims, or pin).
    useEffect(() => {
        if (!open) return;
        const sector = form.recipientSector;
        const w = form.packageWeightKg;
        const lat = form.recipientLat, lng = form.recipientLng;
        if (!sector && !(w && lat != null)) { setQuote(null); return; }
        let active = true;
        (async () => {
            try {
                const params = new URLSearchParams();
                if (sector) params.set("sector", sector);
                if (w) params.set("weightKg", w);
                if (form.packageLengthCm) params.set("lengthCm", form.packageLengthCm);
                if (form.packageWidthCm) params.set("widthCm", form.packageWidthCm);
                if (form.packageHeightCm) params.set("heightCm", form.packageHeightCm);
                if (lat != null) params.set("dropLat", String(lat));
                if (lng != null) params.set("dropLng", String(lng));
                const { data } = await axios.get(`/api/delivery/external/quote?${params.toString()}`, { headers: await authHeaders() });
                if (active) setQuote(data);
            } catch (_) { if (active) setQuote(null); }
        })();
        return () => { active = false; };
    }, [open, form.recipientSector, form.packageWeightKg, form.packageLengthCm, form.packageWidthCm, form.packageHeightCm, form.recipientLat, form.recipientLng, authHeaders]);

    const onPick = (lat, lng) => setForm((f) => ({ ...f, recipientLat: lat, recipientLng: lng }));

    const useMyLocation = () => {
        if (!("geolocation" in navigator)) { toast.error("Location not supported on this device."); return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => { onPick(pos.coords.latitude, pos.coords.longitude); setLocating(false); toast.success("Location pinned"); },
            () => { setLocating(false); toast.error("Could not access your location."); },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    const quickCreatePartner = async () => {
        if (!newPartnerName.trim()) return toast.error("Enter a partner name");
        setCreatingPartner(true);
        try {
            const { data } = await axios.post(`/api/logistics/partners`, { name: newPartnerName.trim() }, { headers: await authHeaders() });
            setPartners((p) => [...p, data.partner]);
            setPartnerId(data.partner.id);
            setNewPartnerName("");
            toast.success("Partner added");
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setCreatingPartner(false); }
    };

    const submit = async () => {
        if (!partnerId) return toast.error("Select or create a partner");
        if (!form.recipientName || !form.recipientPhone || !form.recipientSector || !form.recipientLandmark) {
            return toast.error("Recipient name, phone, sector and landmark are required");
        }
        if (!hasPin) return toast.error("Pin the delivery location on the map");
        if (!form.packageWeightKg || Number(form.packageWeightKg) <= 0) return toast.error("Enter the package weight (kg)");
        if (form.intakeMethod === "DRIVER_SWEEP" && (!form.pickupContactName || !form.pickupPhone || !form.pickupLandmark)) {
            return toast.error("Pickup contact, phone and location are required for a sweep");
        }
        setSubmitting(true);
        try {
            const num = (v) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : undefined);
            const payload = {
                partnerId,
                ...form,
                declaredValue: num(form.declaredValue),
                packageWeightKg: num(form.packageWeightKg),
                packageLengthCm: num(form.packageLengthCm),
                packageWidthCm: num(form.packageWidthCm),
                packageHeightCm: num(form.packageHeightCm),
                // Staff collect payment manually — don't auto-spend the partner's credit.
                applyCredit: false,
            };
            const { data } = await axios.post(`/api/delivery/external`, payload, { headers: await authHeaders() });
            if (markPaid) {
                await axios.post(`/api/logistics/orders/${data.orderId}/mark-paid`, {}, { headers: await authHeaders() });
            }
            setResult({ ...data, paid: markPaid });
            toast.success("External delivery booked");
            onCreated?.();
        } catch (err) { toast.error(err?.response?.data?.error || err.message); } finally { setSubmitting(false); }
    };

    if (!open) return null;

    const trackUrl = result ? `${APP_ORIGIN}/track/${result.orderId}?t=${result.trackingToken}` : "";
    const copyLink = () => { navigator.clipboard?.writeText(trackUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };
    const inp = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-100 p-5">
                    <div className="flex items-center gap-2">
                        <PackagePlusIcon size={20} className="text-slate-600" />
                        <h2 className="text-lg font-bold text-slate-800">New external delivery</h2>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><XIcon size={18} /></button>
                </div>

                {result ? (
                    <div className="space-y-4 p-5">
                        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                            Delivery <span className="font-mono">{result.orderId}</span> booked · fee <b>{result.fee} {currency}</b> · {result.paid ? "marked paid" : "awaiting payment"}.
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-semibold text-slate-500">Recipient delivery code (OTP)</p>
                            <p className="text-2xl font-bold tracking-widest text-slate-800">{result.deliveryOtp}</p>
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-semibold text-slate-500">Share this tracking link with the recipient</p>
                            <div className="flex items-center gap-2">
                                <input readOnly value={trackUrl} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" />
                                <button onClick={copyLink} className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium hover:border-green-400">
                                    {copied ? <CheckIcon size={14} className="text-green-600" /> : <CopyIcon size={14} />} {copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </div>
                        {!result.paid && (
                            <p className="text-[11px] text-amber-600">This delivery won&apos;t be routed until it&apos;s marked paid (here) or the partner&apos;s payment proof is approved.</p>
                        )}
                        <div className="flex justify-end">
                            <button onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">Done</button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 p-5">
                        {/* Partner */}
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-500">Delivery partner (off-platform seller)</label>
                            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                <option value="">Select a partner…</option>
                                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <div className="mt-2 flex items-center gap-2">
                                <input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} placeholder="…or add a new partner name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                <button onClick={quickCreatePartner} disabled={creatingPartner} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium hover:border-green-400 disabled:opacity-50">{creatingPartner ? "Adding…" : "Add"}</button>
                            </div>
                        </div>

                        {/* Recipient */}
                        <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipient</p>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={form.recipientName} onChange={(e) => set("recipientName", e.target.value)} placeholder="Name" className={inp} />
                                <input value={form.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} placeholder="Phone" className={inp} />
                            </div>
                            <input value={form.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} placeholder="Email (optional — for tracking link)" className={`w-full ${inp}`} />
                            <select value={form.recipientSector} onChange={(e) => set("recipientSector", e.target.value)} className={`w-full ${inp}`}>
                                <option value="">Kigali sector…</option>
                                {KIGALI_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <input value={form.recipientLandmark} onChange={(e) => set("recipientLandmark", e.target.value)} placeholder="Landmark / directions" className={`w-full ${inp}`} />
                        </div>

                        {/* Delivery location pin */}
                        <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivery location</p>
                                <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-50">
                                    {locating ? <Loader2Icon size={13} className="animate-spin" /> : <CrosshairIcon size={13} />} Use my location
                                </button>
                            </div>
                            <LocationPicker value={hasPin ? { lat: form.recipientLat, lng: form.recipientLng } : null} onPick={onPick} height={200} />
                            <p className={`text-[11px] ${hasPin ? "text-green-600" : "text-slate-400"}`}>
                                {hasPin
                                    ? <><CheckCircleIcon size={12} className="inline -mt-0.5 mr-1" />Pinned at {form.recipientLat.toFixed(5)}, {form.recipientLng.toFixed(5)}</>
                                    : <><MapPinIcon size={12} className="inline -mt-0.5 mr-1" />Tap the recipient&apos;s spot — sets the delivery distance for pricing.</>}
                            </p>
                        </div>

                        {/* Pickup */}
                        <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pickup</p>
                            <div className="flex gap-2 text-sm">
                                <label className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 ${form.intakeMethod === "HUB_DROP_OFF" ? "border-green-400 bg-green-50" : "border-slate-200"}`}>
                                    <input type="radio" name="intake" className="mr-2 accent-green-600" checked={form.intakeMethod === "HUB_DROP_OFF"} onChange={() => set("intakeMethod", "HUB_DROP_OFF")} />
                                    Drop at hub
                                </label>
                                <label className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 ${form.intakeMethod === "DRIVER_SWEEP" ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
                                    <input type="radio" name="intake" className="mr-2 accent-amber-600" checked={form.intakeMethod === "DRIVER_SWEEP"} onChange={() => set("intakeMethod", "DRIVER_SWEEP")} />
                                    Sweep pickup
                                </label>
                            </div>
                            {form.intakeMethod === "DRIVER_SWEEP" && (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <input value={form.pickupContactName} onChange={(e) => set("pickupContactName", e.target.value)} placeholder="Pickup contact" className={inp} />
                                        <input value={form.pickupPhone} onChange={(e) => set("pickupPhone", e.target.value)} placeholder="Pickup phone" className={inp} />
                                    </div>
                                    <input value={form.pickupLandmark} onChange={(e) => set("pickupLandmark", e.target.value)} placeholder="Pickup location / landmark" className={`w-full ${inp}`} />
                                </div>
                            )}
                        </div>

                        {/* Package */}
                        <div className="rounded-2xl border border-slate-100 p-3 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Package</p>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={form.packageDescription} onChange={(e) => set("packageDescription", e.target.value)} placeholder="Description" className={inp} />
                                <input type="number" min="0" step="0.1" value={form.packageWeightKg} onChange={(e) => set("packageWeightKg", e.target.value)} placeholder="Weight (kg)" className={inp} />
                            </div>
                            <p className="text-[11px] text-slate-400">Dimensions (cm) — optional, used when a bulky-but-light package costs more by volume (1 m³ = 200 kg).</p>
                            <div className="grid grid-cols-3 gap-2">
                                <input type="number" min="0" value={form.packageLengthCm} onChange={(e) => set("packageLengthCm", e.target.value)} placeholder="Length" className={inp} />
                                <input type="number" min="0" value={form.packageWidthCm} onChange={(e) => set("packageWidthCm", e.target.value)} placeholder="Width" className={inp} />
                                <input type="number" min="0" value={form.packageHeightCm} onChange={(e) => set("packageHeightCm", e.target.value)} placeholder="Height" className={inp} />
                            </div>
                            <input type="number" min="0" value={form.declaredValue} onChange={(e) => set("declaredValue", e.target.value)} placeholder="Declared value (optional)" className={`w-full ${inp}`} />
                        </div>

                        <select value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className={`w-full ${inp}`}>
                            <option value="MTN_MOMO">MTN MoMo</option>
                            <option value="BANK_TRANSFER">Bank transfer</option>
                        </select>

                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500">Delivery fee</span>
                                <span className="text-lg font-bold text-slate-800">{quote?.fee != null ? `${currency} ${Number(quote.fee).toLocaleString()}` : "—"}</span>
                            </div>
                            {quote?.basis === "formula" && (
                                <p className="text-[11px] text-slate-400 mt-1">Chargeable {quote.chargeableKg} kg · {quote.distanceKm} km from hub</p>
                            )}
                            {quote?.basis === "flat" && (
                                <p className="text-[11px] text-slate-400 mt-1">Flat sector rate — add a weight and pin the location for distance pricing.</p>
                            )}
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} className="accent-green-600" />
                            Payment received — mark paid now (required before routing)
                        </label>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                            <button onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                            <button onClick={submit} disabled={submitting} className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                                {submitting ? <Loader2Icon size={14} className="animate-spin" /> : <PackagePlusIcon size={14} />} Book delivery
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
