const ProductCardSkeleton = () => (
    <div className="block max-xl:mx-auto w-full max-w-60 sm:max-w-none">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden animate-pulse">
            <div className="h-44 sm:h-64 bg-slate-100" />
            <div className="p-4 sm:p-4.5 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-200 rounded w-1/2" />
                <div className="flex justify-between items-center pt-1">
                    <div className="h-3 bg-slate-200 rounded w-16" />
                    <div className="h-4 bg-slate-200 rounded w-20" />
                </div>
            </div>
        </div>
    </div>
)

export const ProductGridSkeleton = ({ count = 8 }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-32">
        {Array.from({ length: count }).map((_, i) => <ProductCardSkeleton key={i} />)}
    </div>
)

export default ProductCardSkeleton
