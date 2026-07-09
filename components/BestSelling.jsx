'use client'
import Title from './Title'
import ProductCard from './ProductCard'
import { ProductGridSkeleton } from './ProductCardSkeleton'
import { useSelector } from 'react-redux'
import { useEffect, useState } from 'react'
import axios from 'axios'

const BestSelling = () => {

    const displayQuantity = 8
    const storeProducts = useSelector(state => state.product.list)
    const storeLoading = useSelector(state => state.product.loading)

    // Real best-sellers, ranked server-side by units sold (paid orders) with a
    // newest-products fallback. While that request is in flight we fall back to
    // the already-loaded storefront list so the section renders instantly.
    const [bestSellers, setBestSellers] = useState(null)

    useEffect(() => {
        let mounted = true
        axios.get(`/api/product/best-selling?limit=${displayQuantity}`)
            .then(({ data }) => { if (mounted) setBestSellers(data.products || []) })
            .catch(() => { if (mounted) setBestSellers([]) })
        return () => { mounted = false }
    }, [])

    const products = bestSellers ?? storeProducts
    const loading = bestSellers === null && storeLoading

    return (
        <div className='px-6 my-30 max-w-7xl mx-auto'>
            <Title title='Best Selling' description={`Showing ${products.length < displayQuantity ? products.length : displayQuantity} of ${products.length} products`} href='/shop' />
            <div className='mt-12'>
                {loading ? (
                    <ProductGridSkeleton count={displayQuantity} />
                ) : (
                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
                        {products.slice(0, displayQuantity).map((product, index) => (
                            <ProductCard key={product.id || index} product={product} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default BestSelling
