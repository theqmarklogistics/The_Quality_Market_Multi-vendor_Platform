import Link from 'next/link'
import { MailIcon, PhoneIcon, MapPinIcon, MessageCircleIcon } from 'lucide-react'

export const metadata = {
    title: 'Contact Us — The Quality Market',
    description: 'Get in touch with The Quality Market team. We\'re here to help with orders, seller inquiries, and general support.',
}

export default function ContactPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-16 text-slate-600">
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Contact Us</h1>
            <p className="text-sm text-slate-400 mb-10">We&apos;re here to help — reach out any time</p>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Contact details */}
                <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-slate-700">Get in Touch</h2>

                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <PhoneIcon size={18} className="text-green-600" />
                        </div>
                        <div>
                            <p className="font-medium text-slate-700">Phone</p>
                            <a href="tel:+250783610209" className="text-green-600 hover:underline">+250 783 610 209</a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <MailIcon size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <p className="font-medium text-slate-700">Email</p>
                            <a href="mailto:support@thequalitymarket.com" className="text-blue-600 hover:underline">
                                support@thequalitymarket.com
                            </a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <MapPinIcon size={18} className="text-slate-600" />
                        </div>
                        <div>
                            <p className="font-medium text-slate-700">Address</p>
                            <p className="text-slate-500">Kigali, KN 82 St<br />Tropical Plaza, C26<br />Rwanda</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                            <MessageCircleIcon size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <p className="font-medium text-slate-700">Live Chat</p>
                            <p className="text-sm text-slate-500 mb-1">Already have an account? Chat with us directly.</p>
                            <Link href="/chat" className="text-sm text-purple-600 hover:underline font-medium">
                                Open live chat →
                            </Link>
                        </div>
                    </div>
                </div>

                {/* FAQ */}
                <div>
                    <h2 className="text-lg font-semibold text-slate-700 mb-4">Common Questions</h2>
                    <div className="space-y-4">
                        {[
                            {
                                q: 'How do I track my order?',
                                a: 'Log in and visit My Orders to see real-time status updates for all your purchases.',
                            },
                            {
                                q: 'How do I become a seller?',
                                a: 'Click "Open a Store" in the navigation menu and submit your store application. Our team reviews it within 24–48 hours.',
                            },
                            {
                                q: 'What payment methods do you accept?',
                                a: 'We accept MTN MoMo Pay and Bank Transfer. Payment details are provided after placing an order.',
                            },
                            {
                                q: 'Can I return a product?',
                                a: 'Yes. Visit My Orders and request a return within the allowed return window. Our team will guide you through the process.',
                            },
                        ].map(({ q, a }) => (
                            <div key={q} className="border border-slate-200 rounded-xl p-4">
                                <p className="font-medium text-slate-700 mb-1">{q}</p>
                                <p className="text-sm text-slate-500">{a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
