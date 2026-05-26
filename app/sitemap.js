import prisma from '@/lib/prisma'

export default async function sitemap() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thequalitymarket.com'

    const staticRoutes = ['', '/shop', '/about', '/contact', '/terms', '/policy'].map(path => ({
        url: `${baseUrl}${path}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: path === '' ? 1 : 0.8,
    }))

    let productRoutes = []
    try {
        const products = await prisma.product.findMany({
            where: { approvalStatus: 'APPROVED', inStock: true },
            select: { id: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 1000,
        })
        productRoutes = products.map(p => ({
            url: `${baseUrl}/product/${p.id}`,
            lastModified: p.updatedAt,
            changeFrequency: 'daily',
            priority: 0.7,
        }))
    } catch {
        // DB unavailable at build time — skip product routes
    }

    return [...staticRoutes, ...productRoutes]
}
