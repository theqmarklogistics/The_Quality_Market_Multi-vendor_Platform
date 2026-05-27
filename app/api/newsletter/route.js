import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Resend } from 'resend'
import { sendWelcomeEmail } from '@/lib/email'
import { createRateLimiter, getClientIp } from '@/lib/rateLimit'

const resend = new Resend(process.env.RESEND_API_KEY)
const newsletterLimiter = createRateLimiter({ max: 3, windowMs: 10 * 60_000 }) // 3 per 10 min

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
    const rl = newsletterLimiter(`newsletter:${getClientIp(request)}`)
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests. Please try again later.' }, {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfter) },
        })
    }

    try {
        const { email } = await request.json()

        if (!email || !EMAIL_REGEX.test(email)) {
            return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
        }

        const normalised = email.trim().toLowerCase()

        // Check for existing subscriber
        const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: normalised } })

        if (existing) {
            if (existing.unsubscribedAt) {
                // Re-subscribe: clear unsubscribedAt
                await prisma.newsletterSubscriber.update({
                    where: { email: normalised },
                    data: { unsubscribedAt: null },
                })
                return NextResponse.json({ message: "You've been re-subscribed. Welcome back!" })
            }
            return NextResponse.json(
                { message: "You're already subscribed! Keep an eye on your inbox." },
                { status: 409 }
            )
        }

        // Create subscriber
        const subscriber = await prisma.newsletterSubscriber.create({
            data: { email: normalised },
        })

        // Sync to Resend contacts (non-blocking)
        try {
            const contact = await resend.contacts.create({
                email: normalised,
                unsubscribed: false,
            })
            if (contact?.data?.id) {
                await prisma.newsletterSubscriber.update({
                    where: { email: normalised },
                    data: { resendContactId: contact.data.id },
                })
            }
        } catch (err) {
            console.error('Resend contact sync failed (non-fatal):', err.message)
        }

        // Send welcome email (non-blocking)
        sendWelcomeEmail({ to: normalised, unsubscribeToken: subscriber.unsubscribeToken })
            .catch(err => console.error('Welcome email failed (non-fatal):', err.message))

        return NextResponse.json({ message: 'Subscribed! Check your inbox for a welcome email.' })

    } catch (error) {
        console.error('Newsletter subscribe error:', error)
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }
}
