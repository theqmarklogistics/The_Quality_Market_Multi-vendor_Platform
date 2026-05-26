'use client'
import ProductDescription from "@/components/ProductDescription";
import ProductDetails from "@/components/ProductDetails";
import ProductCard from "@/components/ProductCard";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";

function ProductDetailSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="flex flex-col md:flex-row gap-10 mt-6">
                <div className="w-full md:w-1/2 aspect-square bg-slate-100 rounded-2xl" />
                <div className="flex-1 space-y-4 pt-2">
                    <div className="h-6 bg-slate-200 rounded w-3/4" />
                    <div className="h-4 bg-slate-200 rounded w-1/3" />
                    <div className="h-8 bg-slate-200 rounded w-1/4 mt-4" />
                    <div className="h-4 bg-slate-200 rounded w-full mt-6" />
                    <div className="h-4 bg-slate-200 rounded w-5/6" />
                    <div className="h-4 bg-slate-200 rounded w-4/6" />
                    <div className="h-10 bg-slate-200 rounded-full w-40 mt-8" />
                </div>
            </div>
        </div>
    )
}

export default function Product() {
    const { productId } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [relatedProducts, setRelatedProducts] = useState([]);
    const storeProducts = useSelector(state => state.product.list);

    useEffect(() => {
        scrollTo(0, 0);

        const fromStore = storeProducts.find(p => p.id === productId);
        if (fromStore) {
            setProduct(fromStore);
            setLoading(false);
            const related = storeProducts
                .filter(p => p.category === fromStore.category && p.id !== productId)
                .slice(0, 4);
            setRelatedProducts(related);
            return;
        }

        setLoading(true);
        axios.get(`/api/product/${productId}`)
            .then(({ data }) => {
                setProduct(data.product);
                if (data.product?.category) {
                    return axios.get(`/api/product?category=${encodeURIComponent(data.product.category)}&limit=5`);
                }
            })
            .then((res) => {
                if (res?.data?.products) {
                    setRelatedProducts(res.data.products.filter(p => p.id !== productId).slice(0, 4));
                }
            })
            .catch(() => setProduct(null))
            .finally(() => setLoading(false));
    }, [productId, storeProducts]);

    return (
        <div className="mx-6">
            <div className="max-w-7xl mx-auto">

                <div className="text-gray-600 text-sm mt-8 mb-5">
                    Home / Products / {product?.category ?? '…'}
                </div>

                {loading ? (
                    <ProductDetailSkeleton />
                ) : product ? (
                    <>
                        <ProductDetails product={product} />
                        <ProductDescription product={product} />

                        {relatedProducts.length > 0 && (
                            <section className="mt-16 mb-20">
                                <h2 className="text-xl text-slate-500 mb-6">More in <span className="font-medium text-slate-800">{product.category}</span></h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {relatedProducts.map(p => <ProductCard key={p.id} product={p} />)}
                                </div>
                            </section>
                        )}
                    </>
                ) : (
                    <div className="text-center py-20 text-slate-500">
                        <p className="text-lg font-medium">Product not found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
