import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";

function parseRangeDays(value) {
    if (!value || value === "all") return null;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return 30;
    return Math.min(parsed, 3650);
}

function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
    const diff = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        const isAdmin = await authAdmin(userId);

        if (!isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const rangeDays = parseRangeDays(searchParams.get("days") || "30");
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
        const sortBy = searchParams.get("sortBy") || "revenue";
        const sortDir = (searchParams.get("sortDir") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
        const since = rangeDays ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000) : null;

        const rawProducts = await prisma.product.findMany({
            where: { approvalStatus: "APPROVED" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                description: true,
                mrp: true,
                price: true,
                warehouseQuantity: true,
                images: true,
                category: true,
                inStock: true,
                storeId: true,
                approvalStatus: true,
                approvalNotes: true,
                approvedBy: true,
                approvedAt: true,
                wholesalePrice: true,
                wholesaleMinQty: true,
                weightKg: true,
                lengthCm: true,
                widthCm: true,
                heightCm: true,
                importOrigin: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        const productIds = rawProducts.map((product) => product.id);
        const storeIds = [...new Set(rawProducts.map((product) => product.storeId).filter(Boolean))];

        const [stores, ratingSummary, ratingsByProductRows, orderItems] = await Promise.all([
            storeIds.length
                ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true, username: true } })
                : [],
            productIds.length
                ? prisma.rating.aggregate({
                    where: { productId: { in: productIds } },
                    _avg: { rating: true },
                    _count: { id: true },
                })
                : { _avg: { rating: null }, _count: { id: 0 } },
            productIds.length
                ? prisma.rating.groupBy({
                    by: ["productId"],
                    where: { productId: { in: productIds } },
                    _avg: { rating: true },
                    _count: { id: true },
                })
                : [],
            productIds.length
                ? prisma.orderItem.findMany({
                    where: {
                        productId: { in: productIds },
                        ...(since ? { order: { createdAt: { gte: since } } } : {}),
                    },
                    select: {
                        orderId: true,
                        productId: true,
                        quantity: true,
                        price: true,
                        order: { select: { createdAt: true } },
                    },
                })
                : [],
        ]);

        const storeMap = new Map(stores.map((store) => [store.id, store]));
        const productMetricMap = new Map();
        const trendMap = new Map();

        for (const product of rawProducts) {
            productMetricMap.set(product.id, {
                ...product,
                store: storeMap.get(product.storeId) || null,
                unitsSold: 0,
                revenue: 0,
                orderCount: 0,
                reviewCount: 0,
                averageRating: 0,
                firstSaleAt: null,
                lastSaleAt: null,
                approvalAgeDays: product.approvedAt
                    ? daysBetween(startOfUtcDay(new Date(product.approvedAt)), startOfUtcDay(new Date()))
                    : daysBetween(startOfUtcDay(new Date(product.createdAt)), startOfUtcDay(new Date())),
            });
        }

        const orderIdsByProduct = new Map();

        for (const item of orderItems) {
            const metric = productMetricMap.get(item.productId);
            if (!metric) continue;

            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.price) || 0;
            const itemRevenue = quantity * unitPrice;
            const saleDate = item.order?.createdAt ? startOfUtcDay(new Date(item.order.createdAt)).toISOString().slice(0, 10) : null;

            metric.unitsSold += quantity;
            metric.revenue += itemRevenue;

            if (!orderIdsByProduct.has(item.productId)) {
                orderIdsByProduct.set(item.productId, new Set());
            }
            orderIdsByProduct.get(item.productId).add(item.orderId);

            if (item.order?.createdAt) {
                const createdAt = new Date(item.order.createdAt);
                metric.firstSaleAt = metric.firstSaleAt && metric.firstSaleAt < createdAt ? metric.firstSaleAt : createdAt;
                metric.lastSaleAt = metric.lastSaleAt && metric.lastSaleAt > createdAt ? metric.lastSaleAt : createdAt;
            }

            if (saleDate) {
                const day = trendMap.get(saleDate) || { date: saleDate, revenue: 0, unitsSold: 0, orders: new Set() };
                day.revenue += itemRevenue;
                day.unitsSold += quantity;
                day.orders.add(item.orderId);
                trendMap.set(saleDate, day);
            }
        }

        const ratingsByProduct = new Map();
        for (const rating of ratingsByProductRows) {
            ratingsByProduct.set(rating.productId, {
                averageRating: Number((rating._avg.rating || 0).toFixed(1)),
                reviewCount: rating._count.id,
            });
        }

        for (const [productId, metric] of productMetricMap.entries()) {
            const ratingData = ratingsByProduct.get(productId) || { averageRating: 0, reviewCount: 0 };
            metric.averageRating = ratingData.averageRating;
            metric.reviewCount = ratingData.reviewCount;
            metric.orderCount = orderIdsByProduct.get(productId)?.size || 0;
        }

        const products = [...productMetricMap.values()];
        const sorters = {
            revenue: (a, b) => a.revenue - b.revenue,
            unitsSold: (a, b) => a.unitsSold - b.unitsSold,
            orders: (a, b) => a.orderCount - b.orderCount,
            rating: (a, b) => a.averageRating - b.averageRating,
            stock: (a, b) => a.warehouseQuantity - b.warehouseQuantity,
            age: (a, b) => a.approvalAgeDays - b.approvalAgeDays,
            name: (a, b) => a.name.localeCompare(b.name),
        };

        products.sort((a, b) => {
            const compare = (sorters[sortBy] || sorters.revenue)(a, b);
            return sortDir === "asc" ? compare : -compare;
        });

        const total = products.length;
        const pagedProducts = products.slice((page - 1) * pageSize, page * pageSize).map((product, index) => ({
            ...product,
            rank: (page - 1) * pageSize + index + 1,
        }));

        const summary = products.reduce((acc, product) => {
            acc.totalUnitsSold += product.unitsSold;
            acc.totalRevenue += product.revenue;
            acc.totalOrders += product.orderCount;
            acc.totalStock += Number(product.warehouseQuantity) || 0;
            return acc;
        }, {
            approvedProducts: total,
            totalUnitsSold: 0,
            totalRevenue: 0,
            totalOrders: 0,
            totalStock: 0,
        });

        const ratingCount = ratingSummary?._count?.id || 0;
        const overallAverageRating = Number((ratingSummary?._avg?.rating || 0).toFixed(1));

        const trend = [...trendMap.values()]
            .map((entry) => ({
                date: entry.date,
                revenue: Number(entry.revenue.toFixed(2)),
                unitsSold: entry.unitsSold,
                orders: entry.orders.size,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({
            products: pagedProducts,
            total,
            summary: {
                ...summary,
                totalRevenue: Number(summary.totalRevenue.toFixed(2)),
                averageRating: overallAverageRating,
                reviewCount: ratingCount,
                rangeDays: rangeDays ?? "all",
            },
            trend,
            pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}