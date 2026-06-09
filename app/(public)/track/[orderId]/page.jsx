'use client'
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import Loading from "@/components/Loading";
import LiveMap from "@/components/delivery/LiveMap";
import { initializeSocket } from "@/lib/socketClient";
import { CheckCircleIcon, ClockIcon, PackageIcon, TruckIcon, MapPinIcon, PhoneIcon, NavigationIcon, AlertTriangleIcon } from "lucide-react";

const DELIVERY_STEPS = [
    { key: "PENDING_INTAKE", label: "Pending Intake", icon: ClockIcon, description: "Your package is awaiting vendor drop-off or morning sweep pickup." },
    { key: "SORTING",        label: "Sorting",        icon: PackageIcon, description: "Package arrived at the hub and is being sorted into a route corridor." },
    { key: "IN_TRANSIT",     label: "In Transit",     icon: TruckIcon, description: "Your package is on the shared route corridor heading to you." },
    { key: "DELIVERED",      label: "Delivered",      icon: CheckCircleIcon, description: "Package delivered and escrow released." },
];

// ARRIVING is a sub-state of IN_TRANSIT for the timeline.
function StepIndex(status) {
    if (status === "ARRIVING") return DELIVERY_STEPS.findIndex(s => s.key === "IN_TRANSIT");
    return DELIVERY_STEPS.findIndex(s => s.key === status);
}

const POLL_MS = 20000;       // fallback refresh cadence
const SHARE_MIN_MS = 15000;  // throttle for customer location posts

export default function TrackOrderPage() {
    const { getToken } = useAuth();
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { orderId } = useParams();

    const [trackData, setTrackData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sharing, setSharing] = useState(false);

    const watchIdRef = useRef(null);
    const lastShareRef = useRef(0);
    const deliveredRef = useRef(false);

    const fetchTracking = useCallback(async ({ silent } = {}) => {
        if (!silent) setLoading(true);
        try {
            const token = await getToken();
            const { data } = await axios.get(`/api/delivery/track/${orderId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTrackData(data);
            deliveredRef.current = data?.deliveryStatus === 'DELIVERED';
            setError(null);
        } catch (err) {
            if (!silent) setError(err?.response?.data?.error || err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [getToken, orderId]);

    // Initial load + auth gate
    useEffect(() => {
        if (!isLoaded) return;
        if (!user) { router.push('/'); return; }
        fetchTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, user]);

    // Realtime subscription (Socket.IO) with a polling fallback.
    useEffect(() => {
        if (!isLoaded || !user) return;
        let socket = null;
        let active = true;

        const start = async () => {
            try {
                const token = await getToken();
                if (!active || !token) return;
                socket = initializeSocket(token);
                if (socket) {
                    socket.emit('join-track-room', orderId);
                    socket.on('rider-location-update', (p) => {
                        if (p?.orderId && p.orderId !== orderId) return;
                        setTrackData(prev => prev ? { ...prev, riderLat: p.lat, riderLng: p.lng, riderLocationAt: p.at } : prev);
                    });
                    socket.on('delivery-status-update', (p) => {
                        if (p?.orderId && p.orderId !== orderId) return;
                        fetchTracking({ silent: true });
                    });
                    socket.on('corridor-update', () => fetchTracking({ silent: true }));
                }
            } catch (_) { /* fall back to polling */ }
        };
        start();

        // Always poll as a fallback (covers socket-disabled hosts + ETA refresh).
        const poll = setInterval(() => {
            if (!deliveredRef.current) fetchTracking({ silent: true });
        }, POLL_MS);

        return () => {
            active = false;
            clearInterval(poll);
            if (socket) {
                socket.emit('leave-track-room', orderId);
                socket.off('rider-location-update');
                socket.off('delivery-status-update');
                socket.off('corridor-update');
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, user, orderId]);

    const postLocation = useCallback(async (lat, lng) => {
        const now = Date.now();
        if (now - lastShareRef.current < SHARE_MIN_MS) return;
        lastShareRef.current = now;
        try {
            const token = await getToken();
            await axios.post(`/api/delivery/track/${orderId}/share-location`, { lat, lng }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (_) { /* best effort */ }
    }, [getToken, orderId]);

    const toggleShare = () => {
        if (sharing) {
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setSharing(false);
            return;
        }
        if (!('geolocation' in navigator)) {
            setError('Location is not supported on this device.');
            return;
        }
        lastShareRef.current = 0; // allow an immediate first post
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
            () => { setSharing(false); setError('Could not access your location.'); },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
        );
        setSharing(true);
    };

    useEffect(() => () => {
        if (watchIdRef.current != null && 'geolocation' in navigator) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    }, []);

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF';

    if (!isLoaded || loading) return <div className="min-h-screen flex items-center justify-center"><Loading /></div>;

    if (error && !trackData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
                <p className="text-red-600 font-medium">{error}</p>
                <button onClick={() => router.back()} className="text-sm text-slate-500 underline">Go back</button>
            </div>
        );
    }

    const currentStepIndex = StepIndex(trackData?.deliveryStatus);
    const isDelivered = trackData?.deliveryStatus === 'DELIVERED';
    const isFailed = trackData?.deliveryStatus === 'FAILED';
    const isArriving = trackData?.deliveryStatus === 'ARRIVING';
    const enRoute = ['IN_TRANSIT', 'ARRIVING'].includes(trackData?.deliveryStatus);

    const riderPos = (trackData?.riderLat != null && trackData?.riderLng != null)
        ? { lat: trackData.riderLat, lng: trackData.riderLng } : null;
    const customerPos = (trackData?.recipientLat != null && trackData?.recipientLng != null)
        ? { lat: trackData.recipientLat, lng: trackData.recipientLng } : null;

    return (
        <div className="min-h-screen bg-slate-50 py-10 px-4">
            <div className="max-w-lg mx-auto space-y-6">
                {/* Header card */}
                <div className="rounded-3xl bg-[linear-gradient(135deg,_#0f172a_0%,_#16a34a_100%)] p-6 text-white shadow-lg">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-1">Kigali Pooled Delivery</p>
                    <h1 className="text-xl font-bold">Track Your Package</h1>
                    <p className="mt-1 text-sm text-white/70 font-mono">{trackData?.orderId}</p>
                    {trackData?.store?.name && (
                        <p className="mt-2 text-sm text-white/80">From <span className="font-semibold text-white">{trackData.store.name}</span></p>
                    )}
                </div>

                {/* Arriving banner */}
                {isArriving && (
                    <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 flex items-center gap-4">
                        <NavigationIcon size={28} className="text-amber-600 shrink-0" />
                        <div>
                            <p className="font-semibold text-amber-800">Your rider is arriving!</p>
                            <p className="text-sm text-slate-600">Have your 4-digit code ready to confirm delivery.</p>
                        </div>
                    </div>
                )}

                {/* Live map + ETA — once the package is on the road */}
                {enRoute && (
                    <div className="rounded-3xl bg-white border border-slate-200 p-3 shadow-sm">
                        <div className="flex items-center justify-between px-2 pt-1 pb-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Live location</p>
                            {trackData?.etaMinutes != null && (
                                <span className="text-sm font-semibold text-green-700">ETA ~{trackData.etaMinutes} min</span>
                            )}
                        </div>
                        <LiveMap riderPos={riderPos} customerPos={customerPos} height={260} />
                        {!riderPos && (
                            <p className="text-xs text-slate-400 text-center mt-2">Waiting for the rider to start sharing location…</p>
                        )}
                        {/* Share my live location */}
                        <button
                            onClick={toggleShare}
                            className={`mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                                sharing ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                        >
                            <MapPinIcon size={16} />
                            {sharing ? 'Stop sharing my location' : 'Share my live location with rider'}
                        </button>
                        {sharing && <p className="text-[11px] text-slate-400 text-center mt-1.5">Your location is shared only with your rider while this is on.</p>}
                    </div>
                )}

                {/* Rider contact */}
                {enRoute && trackData?.rider?.name && (
                    <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-slate-400">Your rider</p>
                            <p className="font-semibold text-slate-800">{trackData.rider.name}{trackData.rider.vehicleType ? ` · ${trackData.rider.vehicleType}` : ''}</p>
                        </div>
                        {trackData.rider.phone && (
                            <a href={`tel:${trackData.rider.phone}`} className="flex items-center gap-2 rounded-xl bg-green-600 text-white px-4 py-2 text-sm font-semibold hover:bg-green-700">
                                <PhoneIcon size={16} /> Call
                            </a>
                        )}
                    </div>
                )}

                {/* OTP Display — only visible before delivery */}
                {!isDelivered && trackData?.deliveryOtp && (
                    <div className="rounded-3xl border-2 border-green-300 bg-green-50 p-6 text-center shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-widest text-green-600 mb-2">Your Delivery Code</p>
                        <p className="text-5xl font-black tracking-[0.3em] text-green-800">{trackData.deliveryOtp}</p>
                        <p className="mt-3 text-sm text-slate-600">Show this code to the rider at your door to confirm delivery.</p>
                        <p className="mt-1 text-xs text-slate-400">The order cannot be marked complete without this code.</p>
                    </div>
                )}

                {isDelivered && (
                    <div className="rounded-3xl border-2 border-green-300 bg-green-50 p-5 flex items-center gap-4">
                        <CheckCircleIcon size={36} className="text-green-600 shrink-0" />
                        <div>
                            <p className="font-semibold text-green-800">Delivered!</p>
                            <p className="text-sm text-slate-600">Your package has been delivered and payment released.</p>
                        </div>
                    </div>
                )}

                {isFailed && (
                    <div className="rounded-3xl border-2 border-red-300 bg-red-50 p-5 flex items-center gap-4">
                        <AlertTriangleIcon size={32} className="text-red-600 shrink-0" />
                        <div>
                            <p className="font-semibold text-red-800">Delivery attempt failed</p>
                            <p className="text-sm text-slate-600">{trackData?.failureReason || 'We will retry or contact you shortly.'}</p>
                        </div>
                    </div>
                )}

                {/* Delivery info */}
                <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm space-y-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Delivery Details</p>
                    {trackData?.address?.name && (
                        <div className="flex justify-between">
                            <span className="text-slate-500">Recipient</span>
                            <span className="font-medium text-slate-800">{trackData.address.name}</span>
                        </div>
                    )}
                    {trackData?.landmarkAddress && (
                        <div className="flex justify-between gap-4">
                            <span className="text-slate-500 shrink-0">Landmark</span>
                            <span className="font-medium text-slate-800 text-right">{trackData.landmarkAddress}</span>
                        </div>
                    )}
                    {trackData?.intakeMethod && (
                        <div className="flex justify-between">
                            <span className="text-slate-500">Intake</span>
                            <span className="font-medium text-slate-800">
                                {trackData.intakeMethod === 'HUB_DROP_OFF' ? 'Hub Drop-Off' : 'Driver Sweep'}
                            </span>
                        </div>
                    )}
                    {trackData?.deliveryFeeShare != null && (
                        <div className="flex justify-between">
                            <span className="text-slate-500">Your delivery fee</span>
                            <span className="font-medium text-green-700">{currency} {Number(trackData.deliveryFeeShare).toLocaleString()}</span>
                        </div>
                    )}
                    {trackData?.escrowStatus && (
                        <div className="flex justify-between">
                            <span className="text-slate-500">Escrow</span>
                            <span className={`font-medium ${trackData.escrowStatus === 'RELEASED' ? 'text-green-700' : 'text-amber-600'}`}>
                                {trackData.escrowStatus}
                            </span>
                        </div>
                    )}
                </div>

                {/* Status timeline */}
                <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Delivery Progress</p>
                    <div className="space-y-4">
                        {DELIVERY_STEPS.map((step, index) => {
                            const isDone = index <= currentStepIndex;
                            const isCurrent = index === currentStepIndex;
                            const Icon = step.icon;
                            return (
                                <div key={step.key} className="flex gap-4 items-start">
                                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                                        isDone ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                        <Icon size={16} />
                                    </div>
                                    <div>
                                        <p className={`font-medium text-sm ${isCurrent ? 'text-green-700' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                                            {step.label}
                                            {isCurrent && <span className="ml-2 text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-semibold">Current</span>}
                                        </p>
                                        {isCurrent && <p className="text-xs text-slate-500 mt-0.5">{isArriving && step.key === 'IN_TRANSIT' ? 'Your rider is arriving now.' : step.description}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <p className="text-center text-xs text-slate-400 pb-4">
                    Ordered on {trackData?.createdAt ? new Date(trackData.createdAt).toLocaleDateString() : '—'}
                </p>
            </div>
        </div>
    );
}
