export const metadata = {
    title: 'About Us — The Quality Market',
    description: 'Learn about The Quality Market — Rwanda\'s trusted multi-vendor e-commerce platform connecting verified sellers with buyers.',
}

export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-16 text-slate-600">
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">About The Quality Market</h1>
            <p className="text-sm text-slate-400 mb-10">Rwanda&apos;s trusted online marketplace</p>

            <div className="space-y-10">
                <section>
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">Who We Are</h2>
                    <p className="leading-relaxed">
                        The Quality Market is a Rwandan multi-vendor e-commerce platform built to connect verified local sellers
                        with buyers across the country. We bring together a wide range of products — from electronics and fashion
                        to groceries and home goods — all in one place, with the trust and convenience you deserve.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">Our Mission</h2>
                    <p className="leading-relaxed">
                        We believe that shopping online should be simple, safe, and accessible to every Rwandan. Our mission is
                        to empower local businesses by giving them a professional storefront, and to give buyers the confidence
                        of shopping from verified, quality-checked sellers.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">Why Shop With Us</h2>
                    <div className="grid sm:grid-cols-2 gap-4 mt-4">
                        {[
                            { title: 'Verified Sellers', desc: 'Every store is reviewed and approved by our team before going live.' },
                            { title: 'Secure Payments', desc: 'Pay by MTN MoMo or bank transfer — your money is safe with us.' },
                            { title: 'Local Delivery', desc: 'Fast delivery across Kigali with competitive shipping rates.' },
                            { title: 'Quality Guaranteed', desc: 'Products are reviewed and must meet our quality standards.' },
                        ].map(({ title, desc }) => (
                            <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <p className="font-semibold text-slate-700 mb-1">{title}</p>
                                <p className="text-sm">{desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">Based in Kigali</h2>
                    <p className="leading-relaxed">
                        We are headquartered in Kigali, Rwanda — at Tropical Plaza, KN 82 St, C26. We are proud to be a
                        Rwandan business serving Rwandan communities.
                    </p>
                </section>
            </div>
        </div>
    )
}
