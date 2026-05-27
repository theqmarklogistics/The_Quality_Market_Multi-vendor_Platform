import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'

export async function GET(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = 50
        const skip = (page - 1) * limit

        const [total, active, unsubscribed, subscribers] = await Promise.all([
            prisma.newsletterSubscriber.count(),
            prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
            prisma.newsletterSubscriber.count({ where: { unsubscribedAt: { not: null } } }),
            prisma.newsletterSubscriber.findMany({
                orderBy: { subscribedAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    email: true,
                    subscribedAt: true,
                    unsubscribedAt: true,
                },
            }),
        ])

        return NextResponse.json({
            stats: { total, active, unsubscribed },
            subscribers,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        })

    } catch (error) {
        console.error('Admin newsletter GET error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
