import prisma from '@/lib/prisma'

export async function generateMetadata({ params }) {
    try {
        const { productId } = await params
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { name: true, description: true, images: true, price: true },
        })
        if (!product) return { title: 'Product — The Quality Market' }
        const title = `${product.name} — The Quality Market`
        const description = product.description?.slice(0, 155) || `Buy ${product.name} on The Quality Market.`
        return {
            title,
            description,
            openGraph: {
                title,
                description,
                images: product.images?.[0] ? [{ url: product.images[0] }] : [],
            },
        }
    } catch {
        return { title: 'Product — The Quality Market' }
    }
}

export default function ProductLayout({ children }) {
    return children
}
