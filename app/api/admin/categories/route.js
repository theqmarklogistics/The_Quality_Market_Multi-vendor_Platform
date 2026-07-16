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

// POST { name, subName?, subSubName?, parentId?, sortOrder?, commissionPercent? }
// Creates a category — optionally with a whole branch in one call: `subName`
// becomes its subcategory and `subSubName` that one's sub-subcategory. The
// chain (starting from the optional parent) must fit within MAX_CATEGORY_DEPTH.
export async function POST(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const name = String(body.name || '').trim()
        if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 })

        const subName = String(body.subName || '').trim()
        const subSubName = String(body.subSubName || '').trim()
        if (subSubName && !subName) {
            return NextResponse.json({ error: 'A sub-subcategory needs a subcategory above it.' }, { status: 400 })
        }
        const chain = [name, subName, subSubName].filter(Boolean)
        const lowered = chain.map(n => n.toLowerCase())
        if (new Set(lowered).size !== chain.length) {
            return NextResponse.json({ error: 'Category, subcategory and sub-subcategory names must differ.' }, { status: 400 })
        }

        const commissionPercent = body.commissionPercent != null ? Number(body.commissionPercent) : 0
        const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : 0

        const rows = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } })

        // Names are globally unique (products reference categories by name).
        const taken = chain.find(n => rows.some(r => r.name.toLowerCase() === n.toLowerCase()))
        if (taken) return NextResponse.json({ error: `A category named "${taken}" already exists.` }, { status: 409 })

        // Optional parent → the whole chain hangs under it. Depth is capped at
        // MAX_CATEGORY_DEPTH levels (category → sub → sub-sub).
        let parentId = null
        let parentDepth = 0
        if (body.parentId) {
            const parent = rows.find(r => r.id === body.parentId)
            if (!parent) return NextResponse.json({ error: 'Parent category not found.' }, { status: 400 })
            parentDepth = categoryDepth(parent.id, rows)
            parentId = parent.id
        }
        if (parentDepth + chain.length > MAX_CATEGORY_DEPTH) {
            return NextResponse.json({ error: `Maximum category depth is ${MAX_CATEGORY_DEPTH} levels — this would create level ${parentDepth + chain.length}.` }, { status: 400 })
        }

        // Create the branch atomically: each level parents the next.
        const created = await prisma.$transaction(async (tx) => {
            const out = []
            let currentParentId = parentId
            for (const [i, levelName] of chain.entries()) {
                const cat = await tx.category.create({
                    data: {
                        name: levelName,
                        // Commission + sort order apply to the first (named) level;
                        // deeper levels start at defaults and are edited per row.
                        commissionPercent: i === 0 ? commissionPercent : 0,
                        sortOrder: i === 0 ? sortOrder : 0,
                        parentId: currentParentId,
                    },
                })
                out.push(cat)
                currentParentId = cat.id
            }
            return out
        })

        // Invalidate cached public categories list so the storefront sees the new ones.
        revalidateTag('categories')

        return NextResponse.json({ category: created[0], created }, { status: 201 })
    } catch (error) {
        console.error('Admin categories POST error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
