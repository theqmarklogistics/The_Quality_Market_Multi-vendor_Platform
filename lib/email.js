import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvoiceEmail({ to, subject, pdfBuffer, orderId }) {
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@thequalitymarket.com',
        to,
        subject: subject || `Payment Invoice — Order #${orderId?.slice(0, 8)}`,
        html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #1e293b; margin-bottom: 8px;">Your Payment Invoice</h2>
                <p style="color: #64748b; margin-bottom: 16px;">
                    Thank you for your order at <strong>The Quality Market</strong>.
                    Your payment invoice is attached as a PDF.
                </p>
                <p style="color: #64748b;">
                    Please include your order reference number when making the payment so we can
                    verify your transaction quickly.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px;">
                    The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
                    support@thequalitymarket.com &nbsp;|&nbsp; +250 783 610 209
                </p>
            </div>
        `,
        attachments: [
            {
                filename: `invoice-${orderId?.slice(0, 8) || 'order'}.pdf`,
                content: pdfBuffer,
            },
        ],
    });
}
