export const metadata = {
    title: 'Privacy Policy — The Quality Market',
    description: 'Learn how The Quality Market collects, uses, and protects your personal data.',
}

export default function PrivacyPolicyPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-16 text-slate-600">
            <h1 className="text-3xl font-semibold text-slate-800 mb-2">Privacy Policy</h1>
            <p className="text-sm text-slate-400 mb-10">Last updated: May 2026</p>

            <Section title="1. Introduction">
                <p>The Quality Market ("we", "us", or "our") is committed to protecting your personal data. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your data when you use our platform.</p>
            </Section>

            <Section title="2. Information We Collect">
                <p>We collect the following categories of personal information:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li><span className="font-medium">Account information:</span> Name, email address, and profile photo provided when you register.</li>
                    <li><span className="font-medium">Order information:</span> Delivery address, phone number, items purchased, and payment method.</li>
                    <li><span className="font-medium">Store information (sellers):</span> Business name, TIN number, national ID photo, RDB certificate, store address, and contact details.</li>
                    <li><span className="font-medium">Usage data:</span> Pages visited, search queries, and interaction with products.</li>
                    <li><span className="font-medium">Communication data:</span> Messages exchanged with sellers or our support team via the in-app chat.</li>
                </ul>
            </Section>

            <Section title="3. How We Use Your Information">
                <p>We use your personal data to:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li>Process and fulfil your orders, including calculating and applying shipping costs.</li>
                    <li>Verify seller identity and ensure compliance with our platform policies.</li>
                    <li>Communicate with you about your account, orders, and support requests.</li>
                    <li>Improve the Platform through analytics and usage insights.</li>
                    <li>Send you promotional emails and offers where you have consented.</li>
                    <li>Prevent fraud, abuse, and violations of our Terms and Conditions.</li>
                </ul>
            </Section>

            <Section title="4. Sharing Your Information">
                <p>We do not sell your personal data. We may share it with:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li><span className="font-medium">Sellers:</span> Your delivery name, address, and phone number are shared with the seller to fulfil your order.</li>
                    <li><span className="font-medium">Payment processors:</span> Payment reference information is shared with mobile money or banking partners to process transactions.</li>
                    <li><span className="font-medium">Service providers:</span> Trusted third-party services (e.g., authentication, image hosting, analytics) that process data on our behalf under strict confidentiality agreements.</li>
                    <li><span className="font-medium">Legal authorities:</span> When required by Rwandan law or a valid legal process.</li>
                </ul>
            </Section>

            <Section title="5. Cookies &amp; Tracking">
                <p>We use cookies and similar technologies to keep you signed in, remember your cart, and understand how the Platform is used. You can control cookie settings through your browser, but disabling certain cookies may affect Platform functionality.</p>
            </Section>

            <Section title="6. Data Retention">
                <p>We retain your personal data for as long as your account is active or as needed to provide services. Order records are retained for a minimum of five (5) years for accounting and legal compliance purposes. You may request deletion of your account and associated data at any time, subject to retention obligations.</p>
            </Section>

            <Section title="7. Data Security">
                <p>We take reasonable technical and organisational measures to protect your personal data against unauthorised access, loss, or misuse. All data is transmitted over HTTPS. However, no method of transmission over the internet is 100% secure.</p>
            </Section>

            <Section title="8. Your Rights">
                <p>Under applicable Rwandan data protection law, you have the right to:</p>
                <ul className="list-disc ml-5 mt-3 space-y-1.5">
                    <li>Access the personal data we hold about you.</li>
                    <li>Request correction of inaccurate data.</li>
                    <li>Request deletion of your data (subject to legal obligations).</li>
                    <li>Withdraw consent for marketing communications at any time.</li>
                    <li>Lodge a complaint with the Rwanda Utilities Regulatory Authority (RURA).</li>
                </ul>
            </Section>

            <Section title="9. Children's Privacy">
                <p>The Platform is not intended for use by persons under the age of 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us and we will delete it promptly.</p>
            </Section>

            <Section title="10. Changes to This Policy">
                <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice on the Platform. Your continued use of the Platform after changes take effect constitutes your acceptance of the updated policy.</p>
            </Section>

            <Section title="11. Contact Us">
                <p>For privacy-related questions or requests, please contact our Data Protection team:</p>
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
