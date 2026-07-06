import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { Buffer } from "buffer";
import { logAdminAction } from "@/lib/auditLog";

const VALID_SLOTS = ['main', 'card1', 'card2']

export async function PUT(request) {
    try {
        const { userId } = getAuth(request)
        const isAdmin = await authAdmin(userId)
        if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const formData = await request.formData()
        const slot = formData.get('slot')

        if (!VALID_SLOTS.includes(slot)) {
            return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
        }

        const data = {}

        if (slot === 'main') {
            const fields = ['badgeText', 'headline', 'description', 'startingPrice', 'cta1Label', 'cta1Href', 'cta2Label', 'cta2Href']
            for (const f of fields) {
                const val = formData.get(f)
                if (val !== null) data[f] = val.trim() || null
            }
        } else {
            const fields = ['cardTitle', 'accentColor', 'linkLabel', 'linkHref']
            for (const f of fields) {
                const val = formData.get(f)
                if (val !== null) data[f] = val.trim() || null
            }
        }

        const image = formData.get('image')
        if (image && image.size > 0) {
            const buffer = Buffer.from(await image.arrayBuffer())
            const uploadResponse = await imageKit.files.upload({
                file: await toFile(buffer, image.name),
                fileName: image.name,
                folder: 'hero',
            })
            data.imageUrl = imageKit.helper.buildSrc({
                urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
                src: uploadResponse.filePath,
                transformation: [{ quality: 'auto' }, { format: 'webp' }, { width: '1024' }],
            })
        }

        const config = await prisma.heroConfig.upsert({
            where: { slot },
            update: data,
            create: { slot, ...data },
        })

        // Invalidate cached hero config so the next storefront GET sees the change.
        revalidateTag('hero')

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        logAdminAction({ adminId: userId, adminName: admin?.name || '', action: 'HERO_UPDATED', targetType: 'HeroConfig', targetId: slot, notes: `Slot "${slot}" updated` })

        return NextResponse.json({ config })
    } catch (error) {
        console.error('Admin hero PUT error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
