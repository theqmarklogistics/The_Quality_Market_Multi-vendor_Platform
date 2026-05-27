import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'
import { sendNewsletterBroadcast } from '@/lib/email'
import { logAdminAction } from '@/lib/auditLog'

export async function POST(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { subject, body } = await request.json()

        if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
        if (!body?.trim()) return NextResponse.json({ error: 'Message body is required.' }, { status: 400 })

        const subscribers = await prisma.newsletterSubscriber.findMany({
            where: { unsubscribedAt: null },
            select: { email: true, unsubscribeToken: true },
        })

        if (subscribers.length === 0) {
            return NextResponse.json({ error: 'No active subscribers to send to.' }, { status: 400 })
        }

        const sent = await sendNewsletterBroadcast({ subscribers, subject: subject.trim(), body: body.trim() })

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        logAdminAction({
            adminId: userId,
            adminName: admin?.name || '',
            action: 'NEWSLETTER_SENT',
            targetType: 'NewsletterSubscriber',
            targetId: 'broadcast',
            notes: `Sent to ${sent} active subscribers — Subject: "${subject.trim().slice(0, 60)}"`,
        })

        return NextResponse.json({ sent })

    } catch (error) {
        console.error('Admin newsletter send error:', error)
        return NextResponse.json({ error: error.message || 'Failed to send newsletter.' }, { status: 500 })
    }
}
