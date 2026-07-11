'use client'
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { KIGALI_SECTORS } from "@/lib/constants";
import { ArrowLeftIcon, PackagePlusIcon, Loader2Icon, MapPinIcon, CrosshairIcon, CheckCircleIcon, CopyIcon, CheckIcon, LinkIcon, AlertTriangleIcon } from "lucide-react";
import LocationPicker from "@/components/delivery/LocationPicker";

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "RWF";
const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

export default function ExternalBookingForm() {
    const router = useRouter();
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [form, setForm] = useState({
        recipientName: "", recipientPhone: "", recipientEmail: "", recipientSector: "", recipientLandmark: "",
        intakeMethod: "HUB_DROP_OFF", pickupContactName: "", pickupPhone: "", pickupLandmark: "",
        packageDescription: "", declaredValue: "", paymentMethod: "MTN_MOMO",
        packageWeightKg: "", packageLengthCm: "", packageWidthCm: "", packageHeightCm: "",
        recipientLat: null, recipientLng: null,
        pickupLat: null, pickupLng: null,
    });
    const [quote, setQuote] = useState(null);
    const [creditBalance, setCreditBalance] = useState(0);
    const [applyCredit, setApplyCredit] = useState(true);
    const [locating, setLocating] = useState(false);
    const [pickupLocating, setPickupLocating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Set after a successful booking → shows the "send this link to your client" panel.
    const [booked, setBooked] = useState(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const hasPin = form.recipientLat != null && form.recipientLng != null;

    // Load the partner's redeemable pooling credit once.
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data } = await axios.get(`/api/delivery/external`, { headers: await authHeaders() });
                if (active) setCreditBalance(data.creditBalance || 0);
            } catch (_) { /* non-fatal */ }
        })();
        return () => { active = false; };
    }, [authHeaders]);

    // Live quote whenever a pricing input changes (sector, weight, dims, or pin).
    useEffect(() => {
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
    }, [form.recipientSector, form.packageWeightKg, form.packageLengthCm, form.packageWidthCm, form.packageHeightCm, form.recipientLat, form.recipientLng, authHeaders]);

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

    const usePickupLocation = () => {
        if (!("geolocation" in navigator)) { toast.error("Location not supported on this device."); return; }
        setPickupLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setForm((f) => ({ ...f, pickupLat: pos.coords.latitude, pickupLng: pos.coords.longitude }));
                setPickupLocating(false);
                toast.success("Pickup point recorded — the distance is measured from here");
            },
            () => { setPickupLocating(false); toast.error("Could not access your location."); },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    const submit = async () => {
        if (!form.recipientName || !form.recipientPhone || !form.recipientSector || !form.recipientLandmark) {
            return toast.error("Recipient name, phone, sector and landmark are required");
        }
        if (!form.packageWeightKg || Number(form.packageWeightKg) <= 0) return toast.error("Enter the package weight (kg)");
        if (form.intakeMethod === "DRIVER_SWEEP" && (!form.pickupContactName || !form.pickupPhone || !form.pickupLandmark)) {
            return toast.error("Pickup contact, phone and location are required for a sweep");
        }
        setSubmitting(true);
        try {
            const num = (v) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : undefined);
            const { data } = await axios.post(`/api/delivery/external`, {
                ...form,
                declaredValue: num(form.declaredValue),
                packageWeightKg: num(form.packageWeightKg),
                packageLengthCm: num(form.packageLengthCm),
                packageWidthCm: num(form.packageWidthCm),
                packageHeightCm: num(form.packageHeightCm),
                applyCredit,
            }, { headers: await authHeaders() });
            setBooked(data);
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const clientLink = booked ? `${APP_ORIGIN}/track/${booked.orderId}?t=${booked.trackingToken}` : "";
    const copyClientLink = () => {
        navigator.clipboard?.writeText(clientLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
    };

    const input = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none";

    // ── Booked: hand the partner the client link before anything else ────────
    if (booked) {
        return (
            <div className="p-4 sm:p-6 max-w-lg mx-auto">
                <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-5 text-center">
                    <CheckCircleIcon size={36} className="mx-auto text-green-600" />
                    <h1 className="text-xl font-bold text-slate-800 mt-2">Delivery booked</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Fee: <b>{currency} {Number(booked.fee).toLocaleString()}</b>
                        {booked.amountDue != null && booked.amountDue !== booked.fee && <> · you pay <b>{currency} {Number(booked.amountDue).toLocaleString()}</b></>}
                    </p>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 p-5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><LinkIcon size={15} className="text-green-600" /> Send this link to your client first</p>
                    <p className="text-xs text-slate-500 mt-1.5">
                        Your client opens it to <b>share their exact location</b> and track the package.
                        Their shared location is what the <b>delivery fee is calculated from</b> — if it changes the
                        distance, the fee updates before you pay.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <input readOnly value={clientLink} className={`${input} font-mono text-xs bg-slate-50`} onFocus={(e) => e.target.select()} />
                        <button onClick={copyClientLink} className="shrink-0 flex items-center gap-1 rounded-xl bg-slate-800 text-white px-3 py-2 text-xs font-medium hover:bg-slate-900">
                            {linkCopied ? <CheckIcon size={13} className="text-green-400" /> : <CopyIcon size={13} />} Copy
                        </button>
                    </div>
                </div>

                <button onClick={() => router.push("/external")} className="mt-4 w-full rounded-xl bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700">
                    Go to my deliveries (pay &amp; print documents)
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 max-w-lg mx-auto">
            <Link href="/external" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"><ArrowLeftIcon size={14} /> Back to my deliveries</Link>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Book a delivery</h1>
            <p className="text-sm text-slate-500 mb-5">We pool your package onto a shared Kigali route. After booking you get a link for your client — their shared location sets the final fee, paid before dispatch.</p>

            <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100 p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipient</p>
                    <div className="grid grid-cols-2 gap-2">
                        <input className={input} placeholder="Name" value={form.recipientName} onChange={(e) => set("recipientName", e.target.value)} />
                        <input className={input} placeholder="Phone" value={form.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} />
                    </div>
                    <input className={input} placeholder="Email (optional — for tracking link)" value={form.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} />
                    <select className={input} value={form.recipientSector} onChange={(e) => set("recipientSector", e.target.value)}>
                        <option value="">Kigali sector…</option>
                        {KIGALI_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input className={input} placeholder="Landmark / directions to recipient" value={form.recipientLandmark} onChange={(e) => set("recipientLandmark", e.target.value)} />
                </div>

                <div className="rounded-2xl border border-slate-100 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivery location</p>
                        <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-50">
                            {locating ? <Loader2Icon size={13} className="animate-spin" /> : <CrosshairIcon size={13} />} Use my location
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-400">Tap the recipient&apos;s exact spot on the map — it sets the delivery distance used for pricing and routing.</p>
                    <LocationPicker value={hasPin ? { lat: form.recipientLat, lng: form.recipientLng } : null} onPick={onPick} height={220} />
                    <p className={`text-[11px] ${hasPin ? "text-green-600" : "text-slate-400"}`}>
                        {hasPin
                            ? <><CheckCircleIcon size={12} className="inline -mt-0.5 mr-1" />Pinned at {form.recipientLat.toFixed(5)}, {form.recipientLng.toFixed(5)}</>
                            : <><MapPinIcon size={12} className="inline -mt-0.5 mr-1" />No pin yet (optional)</>}
                    </p>
                    {!hasPin && (
                        <p className="text-[11px] rounded-lg bg-green-50 border border-green-100 text-green-800 px-2.5 py-2">
                            Don&apos;t know the exact spot? Book anyway — after booking you get a <b>link to send your client</b>.
                            The location they share sets the final delivery fee before you pay.
                        </p>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-100 p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pickup</p>
                    <div className="flex gap-2 text-sm">
                        <label className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 ${form.intakeMethod === "HUB_DROP_OFF" ? "border-green-400 bg-green-50" : "border-slate-200"}`}>
                            <input type="radio" name="intake" className="mr-2 accent-green-600" checked={form.intakeMethod === "HUB_DROP_OFF"} onChange={() => set("intakeMethod", "HUB_DROP_OFF")} /> I drop at the hub
                        </label>
                        <label className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 ${form.intakeMethod === "DRIVER_SWEEP" ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
                            <input type="radio" name="intake" className="mr-2 accent-amber-600" checked={form.intakeMethod === "DRIVER_SWEEP"} onChange={() => set("intakeMethod", "DRIVER_SWEEP")} /> Sweep pickup
                        </label>
                    </div>
                    {form.intakeMethod === "DRIVER_SWEEP" && (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <input className={input} placeholder="Pickup contact" value={form.pickupContactName} onChange={(e) => set("pickupContactName", e.target.value)} />
                                <input className={input} placeholder="Pickup phone" value={form.pickupPhone} onChange={(e) => set("pickupPhone", e.target.value)} />
                            </div>
                            <input className={input} placeholder="Pickup location / landmark" value={form.pickupLandmark} onChange={(e) => set("pickupLandmark", e.target.value)} />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={usePickupLocation}
                        disabled={pickupLocating}
                        className={`w-full flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-medium transition ${
                            form.pickupLat != null ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:border-green-400"
                        } disabled:opacity-50`}
                    >
                        {pickupLocating ? <Loader2Icon size={13} className="animate-spin" /> : form.pickupLat != null ? <CheckCircleIcon size={13} /> : <CrosshairIcon size={13} />}
                        {form.pickupLat != null ? "Pickup point recorded (tap to update)" : "Record pickup at my current location"}
                    </button>
                    <p className="text-[11px] text-slate-400">
                        When a pickup point is recorded (e.g. a rider logging a package in the field), the delivery
                        distance — and the fee — is measured <b>from that point instead of the hub</b>.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-100 p-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Package</p>
                    <input className={input} placeholder="Package description" value={form.packageDescription} onChange={(e) => set("packageDescription", e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                        <input className={input} type="number" min="0" step="0.1" placeholder="Weight (kg)" value={form.packageWeightKg} onChange={(e) => set("packageWeightKg", e.target.value)} />
                        <input className={input} type="number" min="0" placeholder="Declared value (optional)" value={form.declaredValue} onChange={(e) => set("declaredValue", e.target.value)} />
                    </div>
                    <p className="text-[11px] text-slate-400">Dimensions (cm) — optional, used when a bulky-but-light package costs more by volume (1 m³ = 200 kg).</p>
                    <div className="grid grid-cols-3 gap-2">
                        <input className={input} type="number" min="0" placeholder="Length" value={form.packageLengthCm} onChange={(e) => set("packageLengthCm", e.target.value)} />
                        <input className={input} type="number" min="0" placeholder="Width" value={form.packageWidthCm} onChange={(e) => set("packageWidthCm", e.target.value)} />
                        <input className={input} type="number" min="0" placeholder="Height" value={form.packageHeightCm} onChange={(e) => set("packageHeightCm", e.target.value)} />
                    </div>
                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                        <AlertTriangleIcon size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed text-amber-800">
                            <span className="font-semibold">Declare the weight and dimensions accurately.</span> Every package is
                            verified at intake. If the actual weight or volume is higher than declared, the package is
                            <span className="font-semibold"> held until you pay the difference</span> — and if you don&apos;t,
                            the delivery is cancelled and <span className="font-semibold">your payment is not refunded</span>.
                        </p>
                    </div>
                </div>

                <select className={input} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                    <option value="MTN_MOMO">MTN MoMo</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                </select>

                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
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
                    {creditBalance > 0 && quote?.fee != null && (
                        <>
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                                <input type="checkbox" checked={applyCredit} onChange={(e) => setApplyCredit(e.target.checked)} className="accent-green-600" />
                                Apply my delivery credit ({currency} {Number(creditBalance).toLocaleString()})
                            </label>
                            {applyCredit && (() => {
                                const applied = Math.min(creditBalance, quote.fee);
                                const net = Math.max(0, quote.fee - applied);
                                return (
                                    <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                                        <span className="text-slate-500">Credit −{currency} {Number(applied).toLocaleString()} · you pay</span>
                                        <span className="font-bold text-green-700">{net <= 0 ? "Fully covered" : `${currency} ${Number(net).toLocaleString()}`}</span>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>

                <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {submitting ? <Loader2Icon size={14} className="animate-spin" /> : <PackagePlusIcon size={14} />} Book delivery
                </button>
            </div>
        </div>
    );
}
