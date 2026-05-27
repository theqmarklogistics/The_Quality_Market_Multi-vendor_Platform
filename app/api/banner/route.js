import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const DEFAULT_BANNER = { isActive: false, text: '', couponCode: null }

export async function GET() {
    try {
        const config = await prisma.bannerConfig.findUnique({ where: { id: 'default' } })
        return NextResponse.json(config ?? DEFAULT_BANNER)
    } catch (error) {
        console.error('Banner config GET error:', error.message)
        return NextResponse.json(DEFAULT_BANNER)
    }
}
