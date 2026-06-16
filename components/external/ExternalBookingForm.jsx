'use client'
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { KIGALI_SECTORS } from "@/lib/constants";
import { ArrowLeftIcon, PackagePlusIcon, Loader2Icon } from "lucide-react";

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "RWF";

export default function ExternalBookingForm() {
    const router = useRouter();
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [form, setForm] = useState({
        recipientName: "", recipientPhone: "", recipientEmail: "", recipientSector: "", recipientLandmark: "",
        intakeMethod: "HUB_DROP_OFF", pickupContactName: "", pickupPhone: "", pickupLandmark: "",
        packageDescription: "", declaredValue: "", paymentMethod: "MTN_MOMO",
    });
    const [fee, setFee] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    // Live quote when the recipient sector changes.
    useEffect(() => {
        if (!form.recipientSector) { setFee(null); return; }
        let active = true;
        (async () => {
            try {
                const { data } = await axios.get(`/api/delivery/external/quote?sector=${encodeURIComponent(form.recipientSector)}`, { headers: await authHeaders() });
                if (active) setFee(data.fee);
            } catch (_) { if (active) setFee(null); }
        })();
        return () => { active = false; };
    }, [form.recipientSector, authHeaders]);

    const submit = async () => {
        if (!form.recipientName || !form.recipientPhone || !form.recipientSector || !form.recipientLandmark) {
            return toast.error("Recipient name, phone, sector and landmark are required");
        }
        if (form.intakeMethod === "DRIVER_SWEEP" && (!form.pickupContactName || !form.pickupPhone || !form.pickupLandmark)) {
            return toast.error("Pickup contact, phone and location are required for a sweep");
        }
        setSubmitting(true);
        try {
            await axios.post(`/api/delivery/external`, {
                ...form,
                declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
            }, { headers: await authHeaders() });
            toast.success("Delivery booked — upload your payment proof to start it");
            router.push("/external");
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const input = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none";

    return (
        <div className="p-4 sm:p-6 max-w-lg mx-auto">
            <Link href="/external" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"><ArrowLeftIcon size={14} /> Back to my deliveries</Link>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">Book a delivery</h1>
            <p className="text-sm text-slate-500 mb-5">We pool your package onto a shared Kigali route. Pay the fee after booking to start it.</p>

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
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="Package description" value={form.packageDescription} onChange={(e) => set("packageDescription", e.target.value)} />
                    <input className={input} type="number" placeholder="Declared value (optional)" value={form.declaredValue} onChange={(e) => set("declaredValue", e.target.value)} />
                </div>

                <select className={input} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                    <option value="MTN_MOMO">MTN MoMo</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                </select>

                <div className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-200 p-4">
                    <span className="text-sm text-slate-500">Delivery fee</span>
                    <span className="text-lg font-bold text-slate-800">{fee != null ? `${currency} ${fee}` : "—"}</span>
                </div>

                <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {submitting ? <Loader2Icon size={14} className="animate-spin" /> : <PackagePlusIcon size={14} />} Book delivery
                </button>
            </div>
        </div>
    );
}
