import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, commissionPercent: true },
        })
        return NextResponse.json({ categories })
    } catch (error) {
        console.error('Categories GET error:', error.message)
        return NextResponse.json({ categories: [] })
    }
}
