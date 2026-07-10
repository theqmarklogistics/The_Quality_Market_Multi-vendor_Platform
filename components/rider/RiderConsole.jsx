'use client'
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import toast from "react-hot-toast";
import LiveMap from "@/components/delivery/LiveMap";
import { initializeSocket } from "@/lib/socketClient";
import Link from "next/link";
import { PhoneIcon, NavigationIcon, CheckCircleIcon, XCircleIcon, MapPinIcon, PlayIcon, SquareIcon, PackageIcon, CameraIcon, Loader2Icon, QrCodeIcon, PlusIcon } from "lucide-react";

const LOCATION_MIN_MS = 10000;

// Preset reasons keep failure data clean and consistent across riders.
const FAILURE_REASONS = [
    "Customer unreachable",
    "Wrong / incomplete address",
    "Customer not available",
    "Customer refused delivery",
    "Access blocked / gated",
    "Other",
];

const STATUS_BADGE = {
    SORTING: "bg-slate-100 text-slate-600",
    IN_TRANSIT: "bg-blue-100 text-blue-700",
    ARRIVING: "bg-amber-100 text-amber-700",
    DELIVERED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
};

export default function RiderConsole() {
    const { getToken } = useAuth();
    const [corridor, setCorridor] = useState(null);
    const [stops, setStops] = useState([]);
    const [loading, setLoading] = useState(true);
    const [riderPos, setRiderPos] = useState(null);
    const [tracking, setTracking] = useState(false);
    const [otpModal, setOtpModal] = useState(null); // { orderId }
    const [otpInput, setOtpInput] = useState("");
    const [failModal, setFailModal] = useState(null); // { orderId }
    const [failReason, setFailReason] = useState(FAILURE_REASONS[0]);
    const [failNote, setFailNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [scanModal, setScanModal] = useState(false);
    const [scanInput, setScanInput] = useState("");
    const [scanning, setScanning] = useState(false);
    const scanVideoRef = useRef(null);
    const scanStreamRef = useRef(null);
    const scanLoopRef = useRef(null);

    const watchIdRef = useRef(null);
    const lastPostRef = useRef(0);
    const pendingPosRef = useRef(null); // last position not yet confirmed sent
    const wakeLockRef = useRef(null);
    const flushTimerRef = useRef(null);

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

    const load = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        try {
            const { data } = await axios.get("/api/delivery/rider/assignment", { headers: await authHeaders() });
            setCorridor(data.corridor);
            setStops(data.stops || []);
            if (data.corridor?.riderLat != null && data.corridor?.riderLng != null) {
                setRiderPos(prev => prev || { lat: data.corridor.riderLat, lng: data.corridor.riderLng });
            }
        } catch (err) {
            if (!silent) toast.error(err?.response?.data?.error || err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { load(); }, [load]);

    // Realtime: receive customer location shares + status changes
    useEffect(() => {
        let socket = null, active = true;
        (async () => {
            try {
                const token = await getToken();
                if (!active || !token) return;
                socket = initializeSocket(token);
                if (!socket) return;
                socket.emit("join-rider-room");
                socket.on("customer-location-update", (p) => {
                    setStops(prev => prev.map(s => s.orderId === p.orderId ? { ...s, lat: p.lat, lng: p.lng } : s));
                });
                socket.on("delivery-status-update", () => load({ silent: true }));
                socket.on("corridor-update", () => load({ silent: true }));
            } catch (_) { /* polling fallback below */ }
        })();
        const poll = setInterval(() => load({ silent: true }), 25000);
        return () => {
            active = false;
            clearInterval(poll);
            if (socket) { socket.off("customer-location-update"); socket.off("delivery-status-update"); socket.off("corridor-update"); }
        };
    }, [getToken, load]);

    // Try to flush the latest unsent position. Throttled to LOCATION_MIN_MS; on
    // failure the position stays queued and a timer retries it (covers signal drops
    // and a stationary rider whose watchPosition won't fire again).
    const flushLocation = useCallback(async () => {
        const pending = pendingPosRef.current;
        if (!pending) return;
        const now = Date.now();
        if (now - lastPostRef.current < LOCATION_MIN_MS) return;
        lastPostRef.current = now;
        try {
            await axios.post("/api/delivery/rider/location", pending, { headers: await authHeaders() });
            // Only clear if a newer position hasn't replaced it meanwhile.
            if (pendingPosRef.current === pending) pendingPosRef.current = null;
        } catch (_) {
            // Leave queued; allow a quicker retry than the normal cadence.
            lastPostRef.current = now - LOCATION_MIN_MS / 2;
        }
    }, [authHeaders]);

    const postLocation = useCallback((lat, lng) => {
        setRiderPos({ lat, lng });
        pendingPosRef.current = { lat, lng };
        flushLocation();
    }, [flushLocation]);

    // Keep the screen awake while a rider is actively on a route.
    const acquireWakeLock = useCallback(async () => {
        try {
            if ("wakeLock" in navigator && !wakeLockRef.current) {
                wakeLockRef.current = await navigator.wakeLock.request("screen");
                wakeLockRef.current.addEventListener?.("release", () => { wakeLockRef.current = null; });
            }
        } catch (_) { /* non-fatal: device may deny or not support it */ }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        try { await wakeLockRef.current?.release?.(); } catch (_) {}
        wakeLockRef.current = null;
    }, []);

    // Re-acquire the wake lock when returning to the tab (the OS drops it on hide).
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === "visible" && tracking) acquireWakeLock(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [tracking, acquireWakeLock]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current != null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        if (flushTimerRef.current) clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
        pendingPosRef.current = null;
        releaseWakeLock();
        setTracking(false);
    }, [releaseWakeLock]);

    const toggleTracking = () => {
        if (tracking) { stopTracking(); return; }
        if (corridor?.status !== "IN_TRANSIT") {
            toast.error("Your corridor hasn't been dispatched yet.");
            return;
        }
        if (!("geolocation" in navigator)) { toast.error("Geolocation unavailable on this device."); return; }
        lastPostRef.current = 0;
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
            () => { toast.error("Location access denied."); stopTracking(); },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        // Retry timer flushes queued positions even when the rider isn't moving.
        flushTimerRef.current = setInterval(() => flushLocation(), LOCATION_MIN_MS);
        acquireWakeLock();
        setTracking(true);
        toast.success("Live tracking on — customers can see you now.");
    };

    useEffect(() => () => {
        if (watchIdRef.current != null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchIdRef.current);
        if (flushTimerRef.current) clearInterval(flushTimerRef.current);
        releaseWakeLock();
    }, [releaseWakeLock]);

    const setStopStatus = async (orderId, status, failureReason) => {
        setBusy(true);
        try {
            await axios.post("/api/delivery/rider/stop-status", { orderId, status, failureReason }, { headers: await authHeaders() });
            toast.success(status === "ARRIVING" ? "Customer notified you're arriving." : "Stop marked failed.");
            load({ silent: true });
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally { setBusy(false); }
    };

    const openFailModal = (orderId) => {
        setFailModal({ orderId });
        setFailReason(FAILURE_REASONS[0]);
        setFailNote("");
    };

    const confirmFail = async () => {
        const reason = failReason === "Other"
            ? (failNote.trim() || "Other")
            : (failNote.trim() ? `${failReason} — ${failNote.trim()}` : failReason);
        await setStopStatus(failModal.orderId, "FAILED", reason);
        setFailModal(null);
    };

    // ── Scan a package QR → get assigned to it ─────────────────────────────
    const submitScan = useCallback(async (code) => {
        const value = (code || "").trim();
        if (!value) { toast.error("Scan a QR code or enter the package code."); return; }
        setBusy(true);
        try {
            const { data } = await axios.post("/api/delivery/rider/scan", { code: value }, { headers: await authHeaders() });
            toast.success(`Package assigned to you${data?.stop?.recipientName ? ` — ${data.stop.recipientName}` : ""}.`);
            setScanModal(false);
            setScanInput("");
            load({ silent: true });
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally { setBusy(false); }
    }, [authHeaders, load]);

    const stopScanner = useCallback(() => {
        if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
        scanLoopRef.current = null;
        scanStreamRef.current?.getTracks?.().forEach(t => t.stop());
        scanStreamRef.current = null;
        setScanning(false);
    }, []);

    // Camera QR scanning via the native BarcodeDetector (Android Chrome). Falls
    // back to manual entry where unsupported (e.g. iOS Safari without the API).
    const startScanner = useCallback(async () => {
        if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
            toast("Camera scanning isn't supported here — type the code instead.", { icon: "⌨️" });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            scanStreamRef.current = stream;
            setScanning(true);
            const video = scanVideoRef.current;
            if (!video) { stopScanner(); return; }
            video.srcObject = stream;
            await video.play();
            const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
            const tick = async () => {
                if (!scanStreamRef.current) return;
                try {
                    const codes = await detector.detect(video);
                    if (codes?.length) {
                        stopScanner();
                        submitScan(codes[0].rawValue);
                        return;
                    }
                } catch (_) { /* keep scanning */ }
                scanLoopRef.current = requestAnimationFrame(tick);
            };
            scanLoopRef.current = requestAnimationFrame(tick);
        } catch (_) {
            toast.error("Could not access the camera — type the code instead.");
            stopScanner();
        }
    }, [stopScanner, submitScan]);

    useEffect(() => () => stopScanner(), [stopScanner]);

    const confirmDelivery = async () => {
        if (!/^\d{4}$/.test(otpInput)) { toast.error("Enter the 4-digit code from the customer."); return; }
        setBusy(true);
        try {
            await axios.post("/api/delivery/verify-otp", { orderId: otpModal.orderId, inputOtp: otpInput }, { headers: await authHeaders() });
            toast.success("Delivery confirmed!");
            setOtpModal(null); setOtpInput("");
            load({ silent: true });
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally { setBusy(false); }
    };

    // Fallback: confirm delivery with a captured photo when the customer can't
    // produce the OTP (e.g. left at reception/gate, recipient absent).
    const confirmWithPhoto = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData();
            fd.append("orderId", otpModal.orderId);
            fd.append("photoFile", file);
            await axios.post("/api/delivery/rider/confirm-photo", fd, { headers: await authHeaders() });
            toast.success("Delivery confirmed with photo!");
            setOtpModal(null); setOtpInput("");
            load({ silent: true });
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message);
        } finally { setBusy(false); }
    };

    const mapStops = stops.filter(s => s.lat != null && s.lng != null).map(s => ({
        id: s.orderId, lat: s.lat, lng: s.lng, stopSequence: s.stopSequence, label: `#${s.stopSequence} ${s.recipientName || ""}`,
    }));

    const pending = stops.filter(s => !["DELIVERED", "FAILED"].includes(s.deliveryStatus)).length;

    // Scan-a-package modal: live camera QR scan (when supported) + manual entry.
    const renderScanModal = () => (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => { stopScanner(); setScanModal(false); }}>
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-slate-800">Scan a package</h3>
                <p className="text-sm text-slate-500 mt-1">Point the camera at the QR code on the label to assign the package to you.</p>

                <div className={`mt-4 overflow-hidden rounded-2xl bg-slate-900 ${scanning ? "" : "hidden"}`}>
                    <video ref={scanVideoRef} className="w-full aspect-square object-cover" muted playsInline />
                </div>

                {!scanning ? (
                    <button onClick={startScanner} className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white py-3 text-sm font-semibold hover:bg-green-700">
                        <CameraIcon size={16} /> Open camera scanner
                    </button>
                ) : (
                    <button onClick={stopScanner} className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Stop camera</button>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Or type the package code / order ID:</p>
                    <div className="flex gap-2">
                        <input
                            value={scanInput}
                            onChange={e => setScanInput(e.target.value)}
                            placeholder="ord_…"
                            className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                        />
                        <button disabled={busy} onClick={() => submitScan(scanInput)} className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                            Assign
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading your route…</div>;

    if (!corridor) {
        return (
            <>
                <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-2">
                    <PackageIcon size={40} className="text-slate-300" />
                    <h2 className="text-lg font-semibold text-slate-700">No route assigned yet</h2>
                    <p className="text-sm text-slate-500">When dispatch assigns you a corridor for today, it will appear here — or scan a package to assign yourself.</p>
                    <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
                        <button onClick={() => setScanModal(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 text-white py-3 text-sm font-semibold hover:bg-green-700">
                            <QrCodeIcon size={16} /> Scan a package
                        </button>
                        <Link href="/external/new" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 text-slate-700 py-3 text-sm font-semibold hover:border-green-400">
                            <PlusIcon size={16} /> Record a new delivery
                        </Link>
                        <button onClick={() => load()} className="mt-1 text-sm text-green-700 underline">Refresh</button>
                    </div>
                </div>
                {scanModal && renderScanModal()}
            </>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-28">
            {/* Header */}
            <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#16a34a_100%)] text-white px-5 py-5">
                <p className="text-xs uppercase tracking-widest text-white/60">Rider Console</p>
                <h1 className="text-xl font-bold">{corridor.name}</h1>
                <p className="text-sm text-white/80 mt-0.5">
                    {pending} stop{pending === 1 ? "" : "s"} remaining · {corridor.status === "IN_TRANSIT" ? "Dispatched" : corridor.status}
                </p>
                <div className="mt-3 flex gap-2">
                    <button onClick={() => setScanModal(true)} className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25">
                        <QrCodeIcon size={14} /> Scan package
                    </button>
                    <Link href="/external/new" className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25">
                        <PlusIcon size={14} /> Record delivery
                    </Link>
                </div>
            </div>

            <div className="px-4 py-4 space-y-4 max-w-xl mx-auto">
                {/* Map */}
                <div className="rounded-3xl bg-white border border-slate-200 p-3 shadow-sm">
                    <LiveMap riderPos={riderPos} stops={mapStops} showRoute height={260} />
                </div>

                {/* Stops */}
                <div className="space-y-3">
                    {stops.map((s) => {
                        const done = s.deliveryStatus === "DELIVERED";
                        const failed = s.deliveryStatus === "FAILED";
                        return (
                            <div key={s.orderId} className={`rounded-2xl border p-4 shadow-sm ${done ? "border-green-200 bg-green-50/50" : failed ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">{s.stopSequence}</div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{s.recipientName || "Customer"}</p>
                                            {s.landmarkAddress && <p className="text-xs text-slate-500 mt-0.5">{s.landmarkAddress}</p>}
                                            <p className="text-xs text-slate-400 mt-0.5">{[s.sector, s.city].filter(Boolean).join(", ")}</p>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${STATUS_BADGE[s.deliveryStatus] || "bg-slate-100 text-slate-600"}`}>
                                        {s.deliveryStatus}
                                    </span>
                                </div>

                                {!done && !failed && (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {s.recipientPhone && (
                                            <a href={`tel:${s.recipientPhone}`} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:border-green-400">
                                                <PhoneIcon size={14} /> Call
                                            </a>
                                        )}
                                        {s.lat != null && s.lng != null && (
                                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:border-green-400">
                                                <NavigationIcon size={14} /> Navigate
                                            </a>
                                        )}
                                        <button disabled={busy} onClick={() => setStopStatus(s.orderId, "ARRIVING")} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-white py-2 text-xs font-semibold hover:bg-amber-600 disabled:opacity-50">
                                            <MapPinIcon size={14} /> Arriving
                                        </button>
                                        <button disabled={busy} onClick={() => { setOtpModal({ orderId: s.orderId }); setOtpInput(""); }} className="flex items-center justify-center gap-1.5 rounded-xl bg-green-600 text-white py-2 text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                                            <CheckCircleIcon size={14} /> Deliver
                                        </button>
                                        <button disabled={busy} onClick={() => openFailModal(s.orderId)} className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 text-red-600 py-2 text-xs font-medium hover:bg-red-50">
                                            <XCircleIcon size={14} /> Mark failed
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Start/stop tracking — sticky */}
            <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <div className="max-w-xl mx-auto">
                    <button
                        onClick={toggleTracking}
                        className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-sm transition ${
                            tracking ? "bg-red-50 text-red-600 border border-red-200" : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                    >
                        {tracking ? <><SquareIcon size={16} /> Stop sharing location</> : <><PlayIcon size={16} /> Start route &amp; share location</>}
                    </button>
                </div>
            </div>

            {/* Scan-a-package modal */}
            {scanModal && renderScanModal()}

            {/* OTP modal */}
            {otpModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setOtpModal(null)}>
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">Confirm delivery</h3>
                        <p className="text-sm text-slate-500 mt-1">Enter the 4-digit code the customer shows you.</p>
                        <input
                            value={otpInput}
                            onChange={e => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            inputMode="numeric"
                            autoFocus
                            placeholder="0000"
                            className="mt-4 w-full text-center text-3xl font-black tracking-[0.4em] rounded-xl border border-slate-300 py-3 outline-none focus:border-green-500"
                        />
                        <div className="mt-5 flex gap-3">
                            <button onClick={() => setOtpModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
                            <button disabled={busy} onClick={confirmDelivery} className="flex-1 rounded-xl bg-green-600 text-white py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50">Confirm</button>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-xs text-slate-500 mb-2">Customer can&apos;t provide the code?</p>
                            <label className={`flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 ${busy ? "opacity-50" : "hover:border-green-400 cursor-pointer"}`}>
                                {busy ? <Loader2Icon size={16} className="animate-spin" /> : <CameraIcon size={16} />} Confirm with delivery photo
                                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy} onChange={(e) => confirmWithPhoto(e.target.files?.[0])} />
                            </label>
                            <p className="mt-1.5 text-[11px] text-slate-400">Use this only if the recipient can&apos;t give the code. The photo is logged as proof of delivery.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Failed-delivery modal */}
            {failModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4" onClick={() => setFailModal(null)}>
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-slate-800">Mark delivery failed</h3>
                        <p className="text-sm text-slate-500 mt-1">Pick a reason so dispatch can re-pool or follow up.</p>
                        <div className="mt-4 space-y-2">
                            {FAILURE_REASONS.map((r) => (
                                <label key={r} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer text-sm transition ${failReason === r ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}>
                                    <input type="radio" name="fail-reason" value={r} checked={failReason === r} onChange={() => setFailReason(r)} className="accent-red-600" />
                                    {r}
                                </label>
                            ))}
                        </div>
                        <input
                            value={failNote}
                            onChange={e => setFailNote(e.target.value)}
                            placeholder={failReason === "Other" ? "Describe the reason…" : "Add a note (optional)"}
                            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-400"
                        />
                        <div className="mt-5 flex gap-3">
                            <button onClick={() => setFailModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
                            <button disabled={busy} onClick={confirmFail} className="flex-1 rounded-xl bg-red-600 text-white py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">Mark failed</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
