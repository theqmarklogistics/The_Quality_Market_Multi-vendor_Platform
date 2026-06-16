import Link from 'next/link'
import { TruckIcon, MapPinIcon, BadgeCheckIcon, PhoneIcon, MailIcon, MessageCircleIcon } from 'lucide-react'

// Shown at /external when a signed-in user does not yet hold the EXTERNAL_SELLER
// role. Rather than a bare "Unauthorized" wall, it pitches the delivery service
// and routes prospects to request access. Granting the role stays with admins.
const PERKS = [
    { icon: MapPinIcon, title: 'Shared Kigali routes', body: 'We pool your package onto a route already heading that way — no minimums, no fleet of your own.' },
    { icon: BadgeCheckIcon, title: 'Pay by MoMo, track live', body: 'Settle the fee by mobile money after booking, then follow every drop with a live tracking link.' },
    { icon: TruckIcon, title: 'Hub drop-off or sweep pickup', body: 'Drop at our hub or have a driver sweep your packages up — whichever suits your day.' },
]

export default function DeliveryAccessInvite() {
    return (
        <div className="max-w-3xl mx-auto px-6 py-12">
            <div className="relative overflow-hidden rounded-3xl border border-green-100/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_45%),linear-gradient(135deg,_#f8fafc_0%,_#ecfdf5_100%)] p-8 sm:p-10 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-600/10 text-green-700 text-xs font-semibold px-3 py-1">
                    <TruckIcon size={14} /> Delivery partner access
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mt-4">Deliver your own packages with The Quality Market</h1>
                <p className="text-sm sm:text-base text-slate-600 leading-7 mt-3 max-w-xl">
                    Our delivery service is open to off-platform sellers. Your account doesn&apos;t have partner access yet — request it below and our team will switch it on, usually within 24&ndash;48 hours.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-6">
                    <Link href="/contact" className="inline-flex items-center gap-2 bg-green-600 text-white text-sm py-3 px-7 rounded-full hover:bg-green-700 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-green-600/20">
                        Request delivery access <TruckIcon size={16} />
                    </Link>
                    <a href="tel:+250783610209" className="inline-flex items-center gap-2 bg-white/80 backdrop-blur text-slate-800 text-sm py-3 px-7 rounded-full border border-slate-200 hover:bg-white transition">
                        <PhoneIcon size={16} /> +250 783 610 209
                    </a>
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-8">
                {PERKS.map((perk) => (
                    <div key={perk.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                            <perk.icon size={18} />
                        </div>
                        <p className="font-medium text-slate-700 mt-3">{perk.title}</p>
                        <p className="text-sm text-slate-500 mt-1 leading-6">{perk.body}</p>
                    </div>
                ))}
            </div>

            <p className="text-sm text-slate-500 mt-8 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-slate-400">Already a partner on another account?</span>
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
