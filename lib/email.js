import resend from '@/configs/resend';

const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@thequalitymarket.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thequalitymarket.com';

// ─── Store Status (Approval / Rejection) ─────────────────────────────────────

export async function sendStoreStatusEmail({ to, storeName, status, rejectionReason, contractPdfBuffer, contractFilename }) {
    const isApproved = status === 'approved'
    const subject = isApproved
        ? `🎉 Your store "${storeName}" has been approved!`
        : `Your store "${storeName}" application was not approved`

    const html = isApproved ? `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
            <h2 style="color: #1e293b; margin-bottom: 8px;">Congratulations! 🎉</h2>
            <p style="color: #64748b; margin-bottom: 16px;">
                Your store <strong>${storeName}</strong> has been approved on <strong>The Quality Market</strong>.
                You can now start adding products and managing your store from the dashboard.
            </p>
            ${contractPdfBuffer ? `
            <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                <p style="color: #166534; font-size: 14px; margin: 0;">Your contract is attached as a PDF.</p>
            </div>` : ''}
            <div style="text-align: center; margin: 28px 0;">
                <a href="${APP_URL}/store"
                   style="display: inline-block; background: #1e293b; color: #fff;
                          text-decoration: none; padding: 12px 32px; border-radius: 100px;
                          font-size: 14px; font-weight: 600;">
                    Go to Store Dashboard
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">
                The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
                support@thequalitymarket.com &nbsp;|&nbsp; +250 783 610 209
            </p>
        </div>
    ` : `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
            <h2 style="color: #ef4444; margin-bottom: 8px;">Application Not Approved</h2>
            <p style="color: #64748b; margin-bottom: 12px;">
                We have reviewed your store application for <strong>${storeName}</strong> and unfortunately we are unable to approve it at this time.
            </p>
            ${rejectionReason ? `
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                <p style="color: #7f1d1d; font-size: 14px; margin: 0;"><strong>Reason:</strong> ${rejectionReason}</p>
            </div>` : ''}
            <p style="color: #64748b; margin-bottom: 20px;">
                You are welcome to review the reason above, address the issue, and re-apply at any time.
            </p>
            <div style="text-align: center; margin: 28px 0;">
                <a href="${APP_URL}/create-store"
                   style="display: inline-block; background: #1e293b; color: #fff;
                          text-decoration: none; padding: 12px 32px; border-radius: 100px;
                          font-size: 14px; font-weight: 600;">
                    Re-apply
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">
                The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
                support@thequalitymarket.com &nbsp;|&nbsp; +250 783 610 209
            </p>
        </div>
    `

    const payload = { from: FROM, to, subject, html }
    if (isApproved && contractPdfBuffer) {
        payload.attachments = [
            {
                filename: contractFilename || `contract-${storeName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'store'}.pdf`,
                content: contractPdfBuffer,
            },
        ]
    }

    await resend.emails.send(payload)
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export async function sendInvoiceEmail({ to, subject, pdfBuffer, orderId }) {
    await resend.emails.send({
        from: FROM,
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

// ─── Role Invite ────────────────────────────────────────────────────────────

export async function sendRoleInviteEmail({ to, role, inviteUrl }) {
    const roleLabel = (role || '').replace(/_/g, ' ').toLowerCase();
    const subject = `You have been invited to The Quality Market (${roleLabel})`;

    await resend.emails.send({
        from: FROM,
        to,
        subject,
        html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                <h2 style="color: #1e293b; margin-bottom: 8px;">You're invited!</h2>
                <p style="color: #64748b; margin-bottom: 16px;">
                    An admin has invited you to join <strong>The Quality Market</strong> as a <strong>${roleLabel}</strong>.
                </p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="${inviteUrl}"
                       style="display: inline-block; background: #1e293b; color: #fff;
                              text-decoration: none; padding: 12px 32px; border-radius: 100px;
                              font-size: 14px; font-weight: 600;">
                        Accept invite and join
                    </a>
                </div>
                <p style="color: #64748b; font-size: 14px;">
                    If the button doesn't work, copy and paste this link in your browser:<br />
                    <a href="${inviteUrl}" style="color: #2563eb;">${inviteUrl}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px;">
                    The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
                    support@thequalitymarket.com &nbsp;|&nbsp; +250 783 610 209
                </p>
            </div>
        `,
    });
}

// ─── Kigali Pooled Delivery — status updates ─────────────────────────────────

const DELIVERY_EMAIL_COPY = {
    IN_TRANSIT: {
        subject: (id) => `🛵 Your order #${id} is on the way`,
        heading: 'Your package is on the way!',
        accent: '#2563eb',
        body: 'Your order has left the hub on a shared route. Track your rider live and watch the ETA update in real time.',
    },
    ARRIVING: {
        subject: (id) => `📍 Your rider is arriving — order #${id}`,
        heading: 'Your rider is arriving!',
        accent: '#d97706',
        body: 'Your rider is almost at your location. Please have your 4-digit delivery code ready to confirm the handover.',
    },
    DELIVERED: {
        subject: (id) => `✅ Delivered — order #${id}`,
        heading: 'Delivered!',
        accent: '#16a34a',
        body: 'Your package has been delivered and payment has been released. Thank you for shopping with The Quality Market.',
    },
    FAILED: {
        subject: (id) => `⚠️ Delivery attempt failed — order #${id}`,
        heading: 'Delivery attempt unsuccessful',
        accent: '#ef4444',
        body: 'We were unable to complete your delivery on this attempt. Our team will re-attempt or contact you shortly.',
    },
};

export async function sendDeliveryStatusEmail({ to, orderId, status, failureReason }) {
    const copy = DELIVERY_EMAIL_COPY[status];
    if (!copy || !to) return;
    const shortId = orderId?.slice(0, 12) || 'your order';
    const trackUrl = `${APP_URL}/track/${orderId}`;

    await resend.emails.send({
        from: FROM,
        to,
        subject: copy.subject(shortId),
        html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
                <p style="color: ${copy.accent}; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 6px;">Kigali Pooled Delivery</p>
                <h2 style="color: #1e293b; margin: 0 0 8px;">${copy.heading}</h2>
                <p style="color: #64748b; margin-bottom: 16px;">${copy.body}</p>
                ${status === 'FAILED' && failureReason ? `
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                    <p style="color: #7f1d1d; font-size: 14px; margin: 0;"><strong>Reason:</strong> ${failureReason}</p>
                </div>` : ''}
                <div style="text-align: center; margin: 28px 0;">
                    <a href="${trackUrl}"
                       style="display: inline-block; background: ${copy.accent}; color: #fff;
                              text-decoration: none; padding: 12px 32px; border-radius: 100px;
                              font-size: 14px; font-weight: 600;">
                        Track your order
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px;">
                    The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
                    support@thequalitymarket.com &nbsp;|&nbsp; +250 783 610 209
                </p>
            </div>
        `,
    });
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

function buildFooter(unsubscribeUrl) {
    return `
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            The Quality Market &mdash; Kigali, KN 82 St, Tropical plaza, C26<br />
            <a href="mailto:support@thequalitymarket.com" style="color: #94a3b8;">support@thequalitymarket.com</a>
            &nbsp;|&nbsp; +250 783 610 209<br /><br />
            <a href="${unsubscribeUrl}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a>
            from this mailing list
        </p>
    `
}

function buildWelcomeHtml({ unsubscribeUrl }) {
    return `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #fff;">
            <div style="text-align: center; margin-bottom: 28px;">
                <h1 style="color: #1e293b; font-size: 24px; margin: 0 0 8px;">
                    Welcome to <span style="color: #16a34a;">The Quality Market</span>!
                </h1>
                <p style="color: #64748b; font-size: 15px; margin: 0;">
                    You&apos;re now subscribed to our newsletter.
                </p>
            </div>

            <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="color: #334155; margin: 0 0 12px; font-size: 15px;">
                    Here&apos;s what you&apos;ll get as a subscriber:
                </p>
                <ul style="color: #64748b; padding-left: 20px; margin: 0; line-height: 1.8; font-size: 14px;">
                    <li>Exclusive deals and discount codes</li>
                    <li>New arrivals from verified sellers</li>
                    <li>Insider updates and platform news</li>
                </ul>
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
                <a href="${APP_URL}/shop"
                   style="display: inline-block; background: #1e293b; color: #fff;
                          text-decoration: none; padding: 12px 32px; border-radius: 100px;
                          font-size: 14px; font-weight: 600;">
                    Browse the Shop
                </a>
            </div>

            ${buildFooter(unsubscribeUrl)}
        </div>
    `
}

function buildNewsletterHtml({ subject, body, unsubscribeUrl }) {
    // Convert plain-text line breaks to <br> for readability
    const htmlBody = body
        .split('\n')
        .map(line => `<p style="color: #334155; font-size: 15px; line-height: 1.7; margin: 0 0 12px;">${line || '&nbsp;'}</p>`)
        .join('')

    return `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #fff;">
            <div style="border-bottom: 2px solid #16a34a; padding-bottom: 16px; margin-bottom: 28px;">
                <p style="color: #16a34a; font-size: 12px; font-weight: 600; letter-spacing: 0.08em;
                           text-transform: uppercase; margin: 0 0 4px;">The Quality Market</p>
                <h1 style="color: #1e293b; font-size: 22px; margin: 0;">${subject}</h1>
            </div>

            <div style="margin-bottom: 24px;">
                ${htmlBody}
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
                <a href="${APP_URL}/shop"
                   style="display: inline-block; background: #1e293b; color: #fff;
                          text-decoration: none; padding: 12px 32px; border-radius: 100px;
                          font-size: 14px; font-weight: 600;">
                    Visit The Shop
                </a>
            </div>

            ${buildFooter(unsubscribeUrl)}
        </div>
    `
}

export async function sendWelcomeEmail({ to, unsubscribeToken }) {
    const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${unsubscribeToken}`
    return resend.emails.send({
        from: FROM,
        to,
        subject: 'Welcome to The Quality Market newsletter! 🎉',
        html: buildWelcomeHtml({ unsubscribeUrl }),
    })
}

export async function sendNewsletterBroadcast({ subscribers, subject, body }) {
    // subscribers: [{ email, unsubscribeToken }]
    const BATCH_SIZE = 100
    let totalSent = 0

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
        const batch = subscribers.slice(i, i + BATCH_SIZE)
        const emails = batch.map(({ email, unsubscribeToken }) => {
            const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?token=${unsubscribeToken}`
            return {
                from: FROM,
                to: email,
                subject,
                html: buildNewsletterHtml({ subject, body, unsubscribeUrl }),
            }
        })
        await resend.batch.send(emails)
        totalSent += batch.length
    }

    return totalSent
}
