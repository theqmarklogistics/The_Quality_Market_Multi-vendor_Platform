import Link from 'next/link'
import { TruckIcon, MapPinIcon, BadgeCheckIcon, MailIcon, MessageCircleIcon, CalendarClockIcon, MapPinnedIcon, ArrowRightIcon } from 'lucide-react'
import EnableDeliveryButton from './EnableDeliveryButton'

// Shown at /external when a signed-in user does not yet hold the EXTERNAL_SELLER
// role. Rather than a bare "Unauthorized" wall, it pitches the delivery service
// and lets them switch it on instantly (self-serve enrolment). `redirectTo` is
// where they land once enabled — the booking page passes its own path so they
// continue straight into a booking.
const PERKS = [
    { icon: MapPinIcon, title: 'Shared Kigali routes', body: 'We pool your package onto a route already heading that way — no minimums, no fleet of your own.' },
    { icon: BadgeCheckIcon, title: 'Pay by MoMo, track live', body: 'Settle the fee by mobile money after booking, then follow every drop with a live tracking link.' },
    { icon: TruckIcon, title: 'Hub drop-off or sweep pickup', body: 'Drop at our hub or have a driver sweep your packages up — whichever suits your day.' },
]

// Booking → delivery, in four short steps.
const STEPS = [
    { title: 'Book online', body: 'Enter sender, recipient and package details — get the fee instantly.' },
    { title: 'Hand it over', body: 'Drop at a hub or agent, or let a driver sweep it from you.' },
    { title: 'We pool & ride', body: 'Your package joins a corridor run with others going the same way.' },
    { title: 'Delivered with proof', body: 'Live map for the recipient, one-time code at handover.' },
]

export default function DeliveryAccessInvite({ redirectTo = '/external' }) {
    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="relative overflow-hidden rounded-3xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] p-8 sm:p-10 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 text-green-700 text-xs font-semibold px-3 py-1">
                    <TruckIcon size={14} /> Delivery partner access
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mt-4">Deliver your own packages with The Quality Market</h1>
                <p className="text-sm sm:text-base text-slate-600 leading-7 mt-3 max-w-xl">
                    Our delivery service is open to off-platform sellers. Turn it on for your account and start booking right away — no application, no waiting.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-6">
                    <EnableDeliveryButton redirectTo={redirectTo} label="Enable delivery & book" />
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-8">
                {PERKS.map((perk) => (
                    <div key={perk.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-green-200 transition">
                        <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                            <perk.icon size={18} />
                        </div>
                        <p className="font-medium text-slate-700 mt-3">{perk.title}</p>
                        <p className="text-sm text-slate-500 mt-1 leading-6">{perk.body}</p>
                    </div>
                ))}
            </div>

            {/* How it works */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
                <p className="font-semibold text-slate-800 mb-5">How it works</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {STEPS.map((step, i) => (
                        <div key={step.title}>
                            <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-green-400 text-sm font-bold">{i + 1}</span>
                                {i < STEPS.length - 1 && <span className="hidden lg:block h-px flex-1 bg-slate-200" aria-hidden="true" />}
                            </div>
                            <p className="font-medium text-slate-700 mt-3 text-sm">{step.title}</p>
                            <p className="text-xs text-slate-500 mt-1 leading-5">{step.body}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Network & schedule shortcuts */}
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
                <Link href="/delivery-network" className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 p-5 hover:bg-slate-800 transition">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-white/10 text-green-400 flex items-center justify-center">
                            <MapPinnedIcon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-white text-sm">Hubs &amp; agents near you</p>
                            <p className="text-xs text-white/60 mt-0.5">Drop points and agent phone numbers.</p>
                        </div>
                    </div>
                    <ArrowRightIcon size={16} className="shrink-0 text-green-400 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link href="/delivery-schedule" className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:border-green-300 hover:shadow-md transition">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                            <CalendarClockIcon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm">Rider departure times</p>
                            <p className="text-xs text-slate-500 mt-0.5">Know the next run before you drop off.</p>
                        </div>
                    </div>
                    <ArrowRightIcon size={16} className="shrink-0 text-green-600 group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>

            <p className="text-sm text-slate-500 mt-8 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-slate-400">Account already has another role, or need a hand?</span>
                <Link href="/chat" className="inline-flex items-center gap-1.5 text-green-700 font-medium hover:underline">
                    <MessageCircleIcon size={15} /> Chat with us
                </Link>
                <a href="mailto:support@thequalitymarket.com" className="inline-flex items-center gap-1.5 text-green-700 font-medium hover:underline">
                    <MailIcon size={15} /> support@thequalitymarket.com
                </a>
            </p>
        </div>
    )
}
