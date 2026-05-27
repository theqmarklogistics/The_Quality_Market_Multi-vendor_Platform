import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'

export async function GET(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const categories = await prisma.category.findMany({
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        })
        return NextResponse.json({ categories })
    } catch (error) {
        console.error('Admin categories GET error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const name = String(body.name || '').trim()
        if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 })

        const commissionPercent = body.commissionPercent != null ? Number(body.commissionPercent) : 0
        const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0

        const existing = await prisma.category.findUnique({ where: { name } })
        if (existing) return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 })

        const category = await prisma.category.create({
            data: { name, commissionPercent, sortOrder },
        })
        return NextResponse.json({ category }, { status: 201 })
    } catch (error) {
        console.error('Admin categories POST error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
