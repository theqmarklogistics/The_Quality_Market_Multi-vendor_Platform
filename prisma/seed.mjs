import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES = [
    'Baby Products',
    'Backpacks, Handbags, and Luggage',
    'Base Equipment Power Tools',
    'Beauty, Health, and Personal Care',
    'Business, Industrial, and Scientific Supplies',
    'Clothing and Accessories',
    'Compact Appliances',
    'Computers',
    'Consumer Electronics',
    'Electronics Accessories',
    'Everything Else',
    'Eyewear',
    'Fine Art',
    'Footwear',
    'Full-Size Appliances',
    'Furniture',
    'Gift Cards',
    'Grocery and Gourmet',
    'Home and Kitchen',
    'Jewelry',
    'Lawn and Garden',
    'Lawn Mowers and Snow Throwers',
    'Mattresses',
    'Musical Instruments and AV Production',
    'Office Products',
    'Pet Products',
    'Sports and Outdoors',
    'Tires',
    'Tools and Home Improvement',
    'Toys and Games',
    'Vegetables',
    'Fruits',
    'Roots and Tubers',
    'Flour',
    'Soft Drink',
    'Alcoholic Beverages',
    'Milk and Milk Products',
    'Eggs',
    'Meats and Meat Products',
]

async function main() {
    console.log('Seeding categories...')
    let created = 0
    let skipped = 0

    for (let i = 0; i < CATEGORIES.length; i++) {
        const name = CATEGORIES[i]
        const result = await prisma.category.upsert({
            where: { name },
            update: {},
            create: { name, sortOrder: i },
        })
        if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            created++
        } else {
            skipped++
        }
    }

    console.log(`Done: ${created} created, ${skipped} already existed.`)
}

main()
    .catch(e => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
