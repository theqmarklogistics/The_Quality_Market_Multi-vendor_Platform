import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import resend from '@/configs/resend'

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url)
        const token = searchParams.get('token')

        if (!token) {
            return NextResponse.redirect(new URL('/?unsubscribed=invalid', request.url))
        }

        const subscriber = await prisma.newsletterSubscriber.findUnique({
            where: { unsubscribeToken: token },
        })

        if (!subscriber) {
            return NextResponse.redirect(new URL('/?unsubscribed=invalid', request.url))
        }

        if (subscriber.unsubscribedAt) {
            // Already unsubscribed
            return NextResponse.redirect(new URL('/?unsubscribed=1', request.url))
        }

        // Mark as unsubscribed
        await prisma.newsletterSubscriber.update({
            where: { unsubscribeToken: token },
            data: { unsubscribedAt: new Date() },
        })

        // Remove from Resend (non-blocking) — use email as the stable identifier
        try {
            await resend.contacts.remove({ email: subscriber.email })
        } catch (err) {
            console.error('Resend contact removal failed (non-fatal):', err.message)
        }

        return NextResponse.redirect(new URL('/?unsubscribed=1', request.url))

    } catch (error) {
        console.error('Unsubscribe error:', error)
        return NextResponse.redirect(new URL('/?unsubscribed=error', request.url))
    }
}
