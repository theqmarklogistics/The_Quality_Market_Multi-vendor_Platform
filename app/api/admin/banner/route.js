import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'
import { logAdminAction } from '@/lib/auditLog'

export async function GET(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const config = await prisma.bannerConfig.findUnique({ where: { id: 'default' } })
        return NextResponse.json(config ?? { id: 'default', isActive: false, text: '', couponCode: null })
    } catch (error) {
        console.error('Admin banner GET error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function PUT(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const { isActive, text, couponCode } = body

        const data = {
            isActive: Boolean(isActive),
            text: String(text || '').trim(),
            couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
        }

        const config = await prisma.bannerConfig.upsert({
            where: { id: 'default' },
            update: data,
            create: { id: 'default', ...data },
        })

        // Invalidate the cached public banner config so the next storefront
        // GET sees the change immediately (rather than waiting up to 1h TTL).
        revalidateTag('banner')

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        logAdminAction({
            adminId: userId,
            adminName: admin?.name || '',
            action: 'BANNER_UPDATED',
            targetType: 'BannerConfig',
            targetId: 'default',
            notes: `Banner ${data.isActive ? 'activated' : 'deactivated'}`,
        })

        return NextResponse.json({ config })
    } catch (error) {
        console.error('Admin banner PUT error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
