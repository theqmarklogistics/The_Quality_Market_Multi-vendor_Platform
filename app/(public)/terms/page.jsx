export const metadata = {
    title: 'Terms & Conditions — The Quality Market',
    description: 'Read the Terms and Conditions for using The Quality Market platform.',
}

export default function TermsPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-16 text-slate-600">
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Terms &amp; Conditions</h1>
            <p className="text-sm text-slate-400 mb-10">Last updated: May 2026</p>

            <Section title="1. Acceptance of Terms">
                <p>By accessing or using The Quality Market platform ("Platform"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the Platform.</p>
            </Section>

            <Section title="2. Use of the Platform">
                <p>The Quality Market is a multi-vendor marketplace operating in Rwanda. The Platform connects verified sellers ("Stores") with buyers for the purchase of physical goods. You agree to use the Platform only for lawful purposes and in accordance with these Terms.</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li>You must be at least 18 years old to create an account or place an order.</li>
                    <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                    <li>You must not use the Platform to engage in fraudulent, deceptive, or abusive activity.</li>
                </ul>
            </Section>

            <Section title="3. Seller Obligations">
                <p>Sellers who open a store on the Platform agree to the following:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li>All products listed must be genuine, accurately described, and legally permitted for sale in Rwanda.</li>
                    <li>Sellers must fulfil approved orders in a timely manner and maintain adequate stock levels.</li>
                    <li>Sellers must provide accurate pricing, including applicable taxes and any wholesale pricing terms.</li>
                    <li>The Quality Market reserves the right to review, approve, or reject any product listing at its discretion.</li>
                    <li>Sellers agree to pay the applicable platform commission on each completed sale.</li>
                </ul>
            </Section>

            <Section title="4. Buyer Obligations">
                <p>Buyers using the Platform agree to:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li>Provide accurate delivery and contact information when placing orders.</li>
                    <li>Complete payment within the specified payment window for each order.</li>
                    <li>Use the return and dispute process in good faith.</li>
                    <li>Not place fraudulent orders or abuse promotional offers.</li>
                </ul>
            </Section>

            <Section title="5. Payments">
                <p>All transactions on the Platform are processed in Rwandan Francs (RWF) unless otherwise stated. Accepted payment methods include bank transfer and mobile money (MTN MoMo, Airtel Money). Payment must be completed within the time window shown at checkout. Failure to pay within that window will result in automatic order cancellation and stock restoration.</p>
            </Section>

            <Section title="6. Pricing — Retail &amp; Wholesale">
                <p>Products on the Platform may display both a retail price and a wholesale price. The wholesale price applies only when the minimum quantity threshold set by the seller is met. Prices are set by individual sellers and may change at any time. The price displayed and confirmed at checkout is the price charged.</p>
            </Section>

            <Section title="7. Returns &amp; Refunds">
                <p>Buyers may request a return within the period specified on the product page after the order is delivered. Returns are subject to review and approval by the Platform. Approved returns will result in a refund processed via the original payment method. The Quality Market is not liable for items that are damaged due to buyer misuse.</p>
            </Section>

            <Section title="8. Intellectual Property">
                <p>All content on the Platform — including logos, graphics, text, and software — is the property of The Quality Market or its licensors. You may not reproduce, distribute, or create derivative works from any Platform content without prior written permission.</p>
            </Section>

            <Section title="9. Limitation of Liability">
                <p>The Quality Market acts as an intermediary marketplace. We are not responsible for the quality, safety, or legality of items listed by sellers, or the accuracy of seller-provided descriptions. To the maximum extent permitted by Rwandan law, The Quality Market shall not be liable for any indirect, incidental, or consequential damages.</p>
            </Section>

            <Section title="10. Governing Law">
                <p>These Terms are governed by the laws of the Republic of Rwanda. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of Kigali, Rwanda.</p>
            </Section>

            <Section title="11. Changes to Terms">
                <p>We reserve the right to modify these Terms at any time. Continued use of the Platform after changes are posted constitutes your acceptance of the revised Terms. We will notify registered users of material changes via email or an in-app notification.</p>
            </Section>

            <Section title="12. Contact">
                <p>If you have questions about these Terms, please contact us:</p>
                <div className="mt-3 space-y-1 text-sm">
                    <p><span className="font-medium">Email:</span> support@thequalitymarket.com</p>
                    <p><span className="font-medium">Phone:</span> +250 783 610 209</p>
                    <p><span className="font-medium">Address:</span> Kigali, KN 82 St, Tropical plaza, C26, Rwanda</p>
                </div>
            </Section>
        </div>
    )
}

function Section({ title, children }) {
    return (
        <section className="mb-10">
            <h2 className="text-lg font-semibold text-slate-700 mb-3">{title}</h2>
            <div className="text-sm leading-7 space-y-2">{children}</div>
        </section>
    )
}
