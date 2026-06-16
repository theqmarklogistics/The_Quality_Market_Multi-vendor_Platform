'use client'
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import { KIGALI_SECTORS } from "@/lib/constants";
import { XIcon, PackagePlusIcon, Loader2Icon, CopyIcon, CheckIcon } from "lucide-react";

const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

// Staff-side booking of an off-platform (external) delivery on a partner's behalf.
export default function ExternalDeliveryModal({ open, onClose, onCreated }) {
    const { getToken } = useAuth();
    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const [partners, setPartners] = useState([]);
    const [partnerId, setPartnerId] = useState("");
    const [newPartnerName, setNewPartnerName] = useState("");
    const [creatingPartner, setCreatingPartner] = useState(false);

    const [form, setForm] = useState(blankForm());
    const [markPaid, setMarkPaid] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);

    function blankForm() {
        return {
            recipientName: "", recipientPhone: "", recipientEmail: "", recipientSector: "", recipientLandmark: "",
            intakeMethod: "HUB_DROP_OFF", pickupContactName: "", pickupPhone: "", pickupLandmark: "",
            packageDescription: "", declaredValue: "", paymentMethod: "MTN_MOMO",
        };
    }
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const loadPartners = useCallback(async () => {
        try {
            const { data } = await axios.get(`/api/logistics/partners`, { headers: await authHeaders() });
            setPartners(data.partners || []);
        } catch (err) { toast.error(err?.response?.data?.error || err.message); }
    }, [authHeaders]);

    useEffect(() => {
        if (!open) return;
        setForm(blankForm()); setPartnerId(""); setNewPartnerName(""); setMarkPaid(true); setResult(null); setCopied(false);
        loadPartners();
    }, [open, loadPartners]);

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
        if (form.intakeMethod === "DRIVER_SWEEP" && (!form.pickupContactName || !form.pickupPhone || !form.pickupLandmark)) {
            return toast.error("Pickup contact, phone and location are required for a sweep");
        }
        setSubmitting(true);
        try {
            const payload = {
                partnerId,
                ...form,
                declaredValue: form.declaredValue ? Number(form.declaredValue) : undefined,
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
                            Delivery <span className="font-mono">{result.orderId}</span> booked · fee <b>{result.fee} RWF</b> · {result.paid ? "marked paid" : "awaiting payment"}.
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
                                <input value={form.recipientName} onChange={(e) => set("recipientName", e.target.value)} placeholder="Name" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                <input value={form.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            </div>
                            <input value={form.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} placeholder="Email (optional — for tracking link)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            <select value={form.recipientSector} onChange={(e) => set("recipientSector", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                <option value="">Kigali sector…</option>
                                {KIGALI_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <input value={form.recipientLandmark} onChange={(e) => set("recipientLandmark", e.target.value)} placeholder="Landmark / directions" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
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
                                        <input value={form.pickupContactName} onChange={(e) => set("pickupContactName", e.target.value)} placeholder="Pickup contact" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                        <input value={form.pickupPhone} onChange={(e) => set("pickupPhone", e.target.value)} placeholder="Pickup phone" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                    </div>
                                    <input value={form.pickupLandmark} onChange={(e) => set("pickupLandmark", e.target.value)} placeholder="Pickup location / landmark" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* Package + payment */}
                        <div className="grid grid-cols-2 gap-2">
                            <input value={form.packageDescription} onChange={(e) => set("packageDescription", e.target.value)} placeholder="Package description" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                            <input type="number" value={form.declaredValue} onChange={(e) => set("declaredValue", e.target.value)} placeholder="Declared value (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </div>
                        <select value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                            <option value="MTN_MOMO">MTN MoMo</option>
                            <option value="BANK_TRANSFER">Bank transfer</option>
                        </select>
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
