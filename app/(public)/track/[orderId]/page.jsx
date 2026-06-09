'use client'
import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import Loading from "@/components/Loading";
import { CheckCircleIcon, ClockIcon, PackageIcon, TruckIcon } from "lucide-react";

const DELIVERY_STEPS = [
    { key: "PENDING_INTAKE", label: "Pending Intake", icon: ClockIcon, description: "Your package is awaiting vendor drop-off or morning sweep pickup." },
    { key: "SORTING",        label: "Sorting",        icon: PackageIcon, description: "Package arrived at the hub and is being sorted into a route corridor." },
    { key: "IN_TRANSIT",     label: "In Transit",     icon: TruckIcon, description: "Your package is on the shared route corridor heading to you." },
    { key: "DELIVERED",      label: "Delivered",      icon: CheckCircleIcon, description: "Package delivered and escrow released." },
];

function StepIndex(status) {
    return DELIVERY_STEPS.findIndex(s => s.key === status);
}

export default function TrackOrderPage() {
    const { getToken } = useAuth();
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { orderId } = useParams();

    const [trackData, setTrackData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchTracking = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            const { data } = await axios.get(`/api/delivery/track/${orderId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTrackData(data);
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isLoaded) return;
        if (!user) { router.push('/'); return; }
        fetchTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, user]);

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF';

    if (!isLoaded || loading) return <div className="min-h-screen flex items-center justify-center"><Loading /></div>;

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
                <p className="text-red-600 font-medium">{error}</p>
                <button onClick={() => router.back()} className="text-sm text-slate-500 underline">Go back</button>
            </div>
        );
    }

    const currentStepIndex = StepIndex(trackData?.deliveryStatus);
    const isDelivered = trackData?.deliveryStatus === 'DELIVERED';

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
                                        {isCurrent && <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>}
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
