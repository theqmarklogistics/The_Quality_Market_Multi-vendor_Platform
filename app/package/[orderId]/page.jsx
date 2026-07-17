import prisma from "@/lib/prisma";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PackageIcon, MapPinIcon, PhoneIcon, UserIcon, StoreIcon } from "lucide-react";

export const dynamic = "force-dynamic";

// Public package page — the target of the QR code printed on every package label.
// Shows who the package belongs to and where it's headed so anyone handling it
// (hub staff, riders, the recipient) can identify it. Deliberately NEVER shows
// the customer's delivery confirmation code.
const STATUS_LABELS = {
    PENDING_INTAKE: "Awaiting intake",
    SORTING: "At sorting hub",
    IN_TRANSIT: "Out for delivery",
    ARRIVING: "Arriving",
    DELIVERED: "Delivered",
    FAILED: "Delivery attempt failed",
};

export default async function PackagePage({ params }) {
    const { orderId } = await params;

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            address: true,
            store: { select: { name: true } },
            user: { select: { name: true } },
            dropHub: { select: { name: true, landmark: true } },
        },
    });

    if (!order) return notFound();

    const senderName = order.isExternalDelivery
        ? (order.user?.name || "Delivery partner")
        : (order.store?.name || "The Quality Market seller");

    const area = [order.address?.sector, order.address?.village, order.address?.city]
        .filter(Boolean)
        .join(", ");

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center px-4 py-10">
            <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.08)] overflow-hidden">
                {/* Brand header */}
                <div className="bg-[linear-gradient(135deg,_#0f172a_0%,_#16a34a_100%)] px-6 py-6 text-white flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0">
                        <Image src="/the-quality-market-logo.png" alt="The Quality Market" width={52} height={52} className="object-contain" />
                    </div>
                    <div>
                        <p className="font-bold text-lg leading-tight">The Quality Market</p>
                        <p className="text-xs text-white/70">Kigali Pooled Delivery</p>
                    </div>
                </div>

                <div className="p-6 space-y-5 text-sm text-slate-600">
                    {/* Tracking ID + status */}
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Package ID</p>
                            <p className="font-mono font-semibold text-slate-800 break-all">{order.id}</p>
                        </div>
                        {order.deliveryStatus && (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 whitespace-nowrap">
                                {STATUS_LABELS[order.deliveryStatus] || order.deliveryStatus}
                            </span>
                        )}
                    </div>

                    {/* Package owner (recipient) */}
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Package owner</p>
                        <p className="flex items-center gap-2 font-semibold text-slate-800">
                            <UserIcon size={15} className="text-green-600" /> {order.address?.name || "—"}
                        </p>
                        {(order.contactPhone || order.address?.phone) && (
                            <p className="flex items-center gap-2">
                                <PhoneIcon size={15} className="text-green-600" />
                                <a className="hover:underline" href={`tel:${order.contactPhone || order.address?.phone}`}>{order.contactPhone || order.address?.phone}</a>
                            </p>
                        )}
                        {(area || order.landmarkAddress) && (
                            <p className="flex items-start gap-2">
                                <MapPinIcon size={15} className="text-green-600 shrink-0 mt-0.5" />
                                <span>{[area, order.landmarkAddress].filter(Boolean).join(" · ")}</span>
                            </p>
                        )}
                    </section>

                    {/* Sender */}
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Sender</p>
                        <p className="flex items-center gap-2 font-semibold text-slate-800">
                            <StoreIcon size={15} className="text-green-600" /> {senderName}
                        </p>
                        {order.isExternalDelivery && order.pickupLandmark && (
                            <p className="text-xs text-slate-500">Pickup: {order.pickupLandmark}</p>
                        )}
                    </section>

                    {/* Package details */}
                    {(order.packageDescription || order.intakeMethod) && (
                        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Package</p>
                            {order.packageDescription && (
                                <p className="flex items-center gap-2 text-slate-700">
                                    <PackageIcon size={15} className="text-green-600" /> {order.packageDescription}
                                </p>
                            )}
                            {order.intakeMethod && (
                                <p className="text-xs text-slate-500">
                                    Intake: {order.intakeMethod === "HUB_DROP_OFF" ? "Hub drop-off" : "Driver sweep"}
                                    {order.intakeMethod === "HUB_DROP_OFF" && order.dropHub?.name && (
                                        <span className="text-slate-700"> · {order.dropHub.name}</span>
                                    )}
                                </p>
                            )}
                        </section>
                    )}

                    <p className="text-[11px] text-slate-400 text-center">
                        Deliveries are confirmed with the recipient&apos;s private code — it is never shown on this page or the label.
                    </p>
                </div>
            </div>
            <p className="mt-6 text-xs text-slate-400">thequalitymarket.com</p>
        </div>
    );
}
