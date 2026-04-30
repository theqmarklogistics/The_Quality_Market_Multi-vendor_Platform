'use client'
import { Suspense } from "react"
import ProductCard from "@/components/ProductCard"
import CategoryFilter from "@/components/CategoryFilter"
import { FilterXIcon, MoveLeftIcon, SearchIcon } from "lucide-react"
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

    const clearFilters = () => {
        router.push('/shop')
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
                    {(search || category) && (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            {search && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                                    <SearchIcon size={14} /> Search: <span className="font-medium">{search}</span>
                                </span>
                            )}
                            {category && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-700">
                                    Filtering by <span className="font-medium">{category}</span>
                                </span>
                            )}
                            <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-50 transition">
                                <FilterXIcon size={14} /> Clear filters
                            </button>
                        </div>
                    )}
                </div>
                {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-32">
                        {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
                    </div>
                ) : (
                    <div className="max-w-xl mx-auto text-center py-20 px-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70 mb-32">
                        <p className="text-lg font-medium text-slate-700">No products match your filters.</p>
                        <p className="text-sm text-slate-500 mt-2">Try a different search term or clear the category filter to explore more products.</p>
                        <button onClick={clearFilters} className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-800 px-5 py-2.5 text-sm text-white hover:bg-slate-900 transition">
                            Browse all products
                        </button>
                    </div>
                )}
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