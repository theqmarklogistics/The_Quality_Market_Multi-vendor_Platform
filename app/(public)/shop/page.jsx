'use client'
import { Suspense } from "react"
import ProductCard from "@/components/ProductCard"
import { ProductGridSkeleton } from "@/components/ProductCardSkeleton"
import CategoryFilter from "@/components/CategoryFilter"
import { FilterXIcon, MoveLeftIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSelector } from "react-redux"
import { useState } from "react"

const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'price-low', label: 'Price: Low → High' },
    { value: 'price-high', label: 'Price: High → Low' },
    { value: 'rating', label: 'Top Rated' },
]

function avgRating(product) {
    const ratings = product.rating || []
    if (!ratings.length) return 0
    return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
}

function ShopContent() {
    const searchParams = useSearchParams()
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const sort = searchParams.get('sort') || 'newest'
    const priceMin = searchParams.get('priceMin') || ''
    const priceMax = searchParams.get('priceMax') || ''
    const router = useRouter()

    const [priceMinInput, setPriceMinInput] = useState(priceMin)
    const [priceMaxInput, setPriceMaxInput] = useState(priceMax)
    const [showFilters, setShowFilters] = useState(false)

    const products = useSelector(state => state.product.list)
    const productsLoading = useSelector(state => state.product.loading)

    const pushParams = (overrides) => {
        const params = new URLSearchParams(searchParams.toString())
        Object.entries(overrides).forEach(([k, v]) => {
            if (v) params.set(k, v)
            else params.delete(k)
        })
        router.push(`/shop${params.toString() ? '?' + params.toString() : ''}`)
    }

    const clearFilters = () => {
        setPriceMinInput('')
        setPriceMaxInput('')
        router.push('/shop')
    }

    const setCategory = (cat) => pushParams({ category: cat })
    const setSort = (s) => pushParams({ sort: s === 'newest' ? '' : s })

    const applyPriceFilter = (e) => {
        e.preventDefault()
        pushParams({ priceMin: priceMinInput, priceMax: priceMaxInput })
    }

    const hasActiveFilters = search || category || sort !== 'newest' || priceMin || priceMax

    let filteredProducts = [...products]

    if (search) filteredProducts = filteredProducts.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    if (category) filteredProducts = filteredProducts.filter(p => p.category === category)
    if (priceMin) filteredProducts = filteredProducts.filter(p => p.price >= Number(priceMin))
    if (priceMax) filteredProducts = filteredProducts.filter(p => p.price <= Number(priceMax))

    if (sort === 'price-low') filteredProducts.sort((a, b) => a.price - b.price)
    else if (sort === 'price-high') filteredProducts.sort((a, b) => b.price - a.price)
    else if (sort === 'rating') filteredProducts.sort((a, b) => avgRating(b) - avgRating(a))

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'RWF'

    return (
        <div className="min-h-[70vh] mx-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 my-6">
                    <h1 onClick={() => router.push('/shop')} className="text-2xl text-slate-500 flex items-center gap-2 cursor-pointer">
                        {search && <MoveLeftIcon size={20} />} All <span className="text-slate-700 font-medium">Products</span>
                    </h1>
                    <div className="flex items-center gap-3">
                        {/* Sort */}
                        <select
                            value={sort}
                            onChange={e => setSort(e.target.value)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 outline-none focus:border-slate-400 transition"
                        >
                            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {/* Filter toggle (mobile) */}
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition sm:hidden"
                        >
                            <SlidersHorizontalIcon size={14} /> Filters
                        </button>
                    </div>
                </div>

                {/* Category + active filters */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <CategoryFilter currentCategory={category} onSelectCategory={setCategory} />
                    {hasActiveFilters && (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            {search && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                                    <SearchIcon size={14} /> {search}
                                </span>
                            )}
                            {category && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-700">
                                    {category}
                                </span>
                            )}
                            {(priceMin || priceMax) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                                    {currency}{priceMin || '0'} – {priceMax ? `${currency}${priceMax}` : '∞'}
                                </span>
                            )}
                            <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-50 transition">
                                <FilterXIcon size={14} /> Clear all
                            </button>
                        </div>
                    )}
                </div>

                {/* Price range filter panel */}
                <div className={`mb-5 ${showFilters ? 'block' : 'hidden sm:block'}`}>
                    <form onSubmit={applyPriceFilter} className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                        <span className="text-slate-500 font-medium">Price range:</span>
                        <input
                            type="number"
                            min="0"
                            placeholder="Min"
                            value={priceMinInput}
                            onChange={e => setPriceMinInput(e.target.value)}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 outline-none focus:border-slate-400"
                        />
                        <span className="text-slate-400">–</span>
                        <input
                            type="number"
                            min="0"
                            placeholder="Max"
                            value={priceMaxInput}
                            onChange={e => setPriceMaxInput(e.target.value)}
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 outline-none focus:border-slate-400"
                        />
                        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1 text-white hover:bg-slate-900 transition">Apply</button>
                        {(priceMin || priceMax) && (
                            <button type="button" onClick={() => { setPriceMinInput(''); setPriceMaxInput(''); pushParams({ priceMin: '', priceMax: '' }) }}>
                                <XIcon size={14} className="text-slate-400 hover:text-slate-600" />
                            </button>
                        )}
                    </form>
                </div>

                {productsLoading ? (
                    <ProductGridSkeleton count={8} />
                ) : filteredProducts.length > 0 ? (
                    <>
                        <p className="text-xs text-slate-400 mb-4">{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-32">
                            {filteredProducts.map(product => <ProductCard key={product.id} product={product} />)}
                        </div>
                    </>
                ) : (
                    <div className="max-w-xl mx-auto text-center py-20 px-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70 mb-32">
                        <p className="text-lg font-medium text-slate-700">No products match your filters.</p>
                        <p className="text-sm text-slate-500 mt-2">Try a different search term, adjust the price range, or clear the filters.</p>
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
        <Suspense fallback={
            <div className="min-h-[70vh] mx-6">
                <div className="max-w-7xl mx-auto">
                    <div className="h-10 w-48 bg-slate-200 rounded animate-pulse my-6" />
                    <ProductGridSkeleton count={8} />
                </div>
            </div>
        }>
            <ShopContent />
        </Suspense>
    )
}
