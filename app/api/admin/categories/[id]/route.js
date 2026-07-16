import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'
import { MAX_CATEGORY_DEPTH, categoryDepth, subtreeHeight, isSelfOrDescendant } from '@/lib/categoryTree'

export async function PUT(request, { params }) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { id } = await params
        const body = await request.json()
        const data = {}

        if (body.name != null) {
            const name = String(body.name).trim()
            if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
            // Check uniqueness (excluding self)
            const clash = await prisma.category.findFirst({ where: { name, NOT: { id } } })
            if (clash) return NextResponse.json({ error: 'Another category with this name already exists.' }, { status: 409 })
            data.name = name
        }
        if (body.commissionPercent != null) data.commissionPercent = Number(body.commissionPercent)
        if (body.isActive != null) data.isActive = Boolean(body.isActive)
        if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder)

        // Re-parent (move in the tree). `parentId: null` promotes to top level.
        // Guards: parent must exist, must not be the category itself or one of
        // its descendants (cycle), and the moved subtree must still fit within
        // MAX_CATEGORY_DEPTH levels.
        if ('parentId' in body) {
            if (body.parentId == null || body.parentId === '') {
                data.parentId = null
            } else {
                const rows = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } })
                const parent = rows.find(r => r.id === body.parentId)
                if (!parent) return NextResponse.json({ error: 'Parent category not found.' }, { status: 400 })
                if (isSelfOrDescendant(id, parent.id, rows)) {
                    return NextResponse.json({ error: 'A category cannot be moved under itself or one of its own subcategories.' }, { status: 400 })
                }
                if (categoryDepth(parent.id, rows) + subtreeHeight(id, rows) > MAX_CATEGORY_DEPTH) {
                    return NextResponse.json({ error: `Maximum category depth is ${MAX_CATEGORY_DEPTH} levels — this move would exceed it.` }, { status: 400 })
                }
                data.parentId = parent.id
            }
        }

        const category = await prisma.category.update({ where: { id }, data })
        revalidateTag('categories')
        return NextResponse.json({ category })
    } catch (error) {
        console.error('Admin categories PUT error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { id } = await params
        const cat = await prisma.category.findUnique({ where: { id } })
        if (!cat) return NextResponse.json({ error: 'Category not found.' }, { status: 404 })

        // A parent with subcategories can't be deleted — move or delete them first.
        const childCount = await prisma.category.count({ where: { parentId: id } })
        if (childCount > 0) {
            return NextResponse.json(
                { error: `Cannot delete — "${cat.name}" has ${childCount} subcategor${childCount !== 1 ? 'ies' : 'y'}. Delete or move them first.` },
                { status: 400 }
            )
        }

        // Check if any products use this category
        const productCount = await prisma.product.count({ where: { category: cat.name } })
        if (productCount > 0) {
            return NextResponse.json(
                { error: `Cannot delete — ${productCount} product${            productCount !== 1 ? 's' : ''} use this category. Deactivate it instead.` },
                { status: 400 }
            )
        }

        await prisma.category.delete({ where: { id } })
        revalidateTag('categories')
        return NextResponse.json({ message: 'Category deleted.' })
    } catch (error) {
        console.error('Admin categories DELETE error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
