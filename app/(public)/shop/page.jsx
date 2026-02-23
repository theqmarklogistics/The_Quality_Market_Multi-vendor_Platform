'use client'
import { Suspense } from "react"
import ProductCard from "@/components/ProductCard"
import CategoryFilter from "@/components/CategoryFilter"
import { MoveLeftIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSelector } from "react-redux"

function ShopContent() {
    const searchParams = useSearchParams()
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const router = useRouter()

    const products = useSelector(state => state.product.list)

    let filteredProducts = products
    if (search) {
        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(search.toLowerCase())
        )
    }
    if (category) {
        filteredProducts = filteredProducts.filter(product =>
            product.category === category
        )
    }

    const setCategory = (cat) => {
        const params = new URLSearchParams(searchParams.toString())
        if (cat) params.set('category', cat)
        else params.delete('category')
        router.push(`/shop${params.toString() ? '?' + params.toString() : ''}`)
    }

    return (
        <div className="min-h-[70vh] mx-6">
            <div className="max-w-7xl mx-auto">
                <h1 onClick={() => router.push('/shop')} className="text-2xl text-slate-500 my-6 flex items-center gap-2 cursor-pointer">
                    {search && <MoveLeftIcon size={20} />} All <span className="text-slate-700 font-medium">Products</span>
                </h1>
                <div className="flex flex-wrap items-center gap-3 mb-6">
                    <CategoryFilter currentCategory={category} onSelectCategory={setCategory} />
                    {category && (
                        <span className="text-sm text-slate-500">
                            Filtering by: <span className="font-medium text-slate-700">{category}</span>
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:flex flex-wrap gap-6 xl:gap-12 mx-auto mb-32">
                    {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
                </div>
            </div>
        </div>
    )
}


export default function Shop() {
  return (
    <Suspense fallback={<div>Loading shop...</div>}>
      <ShopContent />
    </Suspense>
  );
}