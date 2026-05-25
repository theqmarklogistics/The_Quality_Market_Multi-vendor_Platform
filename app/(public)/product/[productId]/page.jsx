'use client'
import ProductDescription from "@/components/ProductDescription";
import ProductDetails from "@/components/ProductDetails";
import ProductCard from "@/components/ProductCard";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

export default function Product() {

    const { productId } = useParams();
    const [product, setProduct] = useState();
    const products = useSelector(state => state.product.list);

    useEffect(() => {
        if (products.length > 0) {
            setProduct(products.find(p => p.id === productId));
        }
        scrollTo(0, 0)
    }, [productId, products]);

    const relatedProducts = product
        ? products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4)
        : [];

    return (
        <div className="mx-6">
            <div className="max-w-7xl mx-auto">

                {/* Breadcrumb */}
                <div className="text-gray-600 text-sm mt-8 mb-5">
                    Home / Products / {product?.category}
                </div>

                {/* Product Details */}
                {product && <ProductDetails product={product} />}

                {/* Description & Reviews */}
                {product && <ProductDescription product={product} />}

                {/* Related Products */}
                {relatedProducts.length > 0 && (
                    <section className="mt-16 mb-20">
                        <h2 className="text-xl text-slate-500 mb-6">More in <span className="font-medium text-slate-800">{product.category}</span></h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {relatedProducts.map(p => <ProductCard key={p.id} product={p} />)}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}