import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'
import { MAX_CATEGORY_DEPTH, categoryDepth } from '@/lib/categoryTree'

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

        // Optional parent → this becomes a subcategory. Depth is capped at
        // MAX_CATEGORY_DEPTH levels (category → sub → sub-sub).
        let parentId = null
        if (body.parentId) {
            const rows = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } })
            const parent = rows.find(r => r.id === body.parentId)
            if (!parent) return NextResponse.json({ error: 'Parent category not found.' }, { status: 400 })
            if (categoryDepth(parent.id, rows) >= MAX_CATEGORY_DEPTH) {
                return NextResponse.json({ error: `Maximum category depth is ${MAX_CATEGORY_DEPTH} levels — "${parent.name}" cannot have subcategories.` }, { status: 400 })
            }
            parentId = parent.id
        }

        const category = await prisma.category.create({
            data: { name, commissionPercent, sortOrder, parentId },
        })

        // Invalidate cached public categories list so the storefront sees the new one.
        revalidateTag('categories')

        return NextResponse.json({ category }, { status: 201 })
    } catch (error) {
        console.error('Admin categories POST error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
