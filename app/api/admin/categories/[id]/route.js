import { getAuth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import authAdmin from '@/middlewares/authAdmin'
import prisma from '@/lib/prisma'

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
