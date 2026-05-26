'use client'
import Title from './Title'
import ProductCard from './ProductCard'
import { ProductGridSkeleton } from './ProductCardSkeleton'
import { useSelector } from 'react-redux'

const BestSelling = () => {

    const displayQuantity = 8
    const products = useSelector(state => state.product.list)
    const loading = useSelector(state => state.product.loading)

    return (
        <div className='px-6 my-30 max-w-7xl mx-auto'>
            <Title title='Best Selling' description={`Showing ${products.length < displayQuantity ? products.length : displayQuantity} of ${products.length} products`} href='/shop' />
            <div className='mt-12'>
                {loading ? (
                    <ProductGridSkeleton count={displayQuantity} />
                ) : (
                    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
                        {products.slice().sort((a, b) => b.rating.length - a.rating.length).slice(0, displayQuantity).map((product, index) => (
                            <ProductCard key={index} product={product} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default BestSelling