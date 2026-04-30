'use client'

import { addToCart } from "@/lib/features/cart/cartSlice";
import { StarIcon, TagIcon, EarthIcon, CreditCardIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import Counter from "./Counter";
import { useDispatch, useSelector } from "react-redux";

const ProductDetails = ({ product }) => {

    const productId = product.id;
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$';

    const cart = useSelector(state => state.cart.cartItems);
    const dispatch = useDispatch();

    const router = useRouter()

    const [mainImage, setMainImage] = useState(product.images[0]);
    const ratingCount = product.rating?.length || 0;
    const averageRating = ratingCount > 0
        ? product.rating.reduce((acc, item) => acc + item.rating, 0) / ratingCount
        : 0;
    const isAvailable = product.inStock !== false;

    const addToCartHandler = () => {
        dispatch(addToCart({ productId }))
    }

    return (
        <div className="flex max-lg:flex-col gap-12">
            <div className="flex max-sm:flex-col-reverse gap-3">
                <div className="flex sm:flex-col gap-3 max-sm:flex-row max-sm:flex-wrap">
                    {product.images.map((image, index) => (
                        <button key={index} type="button" onClick={() => setMainImage(product.images[index])} className={`bg-slate-100 flex items-center justify-center size-26 rounded-lg group cursor-pointer ring-2 transition ${mainImage === image ? 'ring-green-500' : 'ring-transparent'}`}>
                            <Image src={image} className="group-hover:scale-103 group-active:scale-95 transition" alt="" width={45} height={45} />
                        </button>
                    ))}
                </div>
                <div className="flex justify-center items-center h-100 sm:size-113 bg-slate-100 rounded-lg relative overflow-hidden">
                    {!isAvailable && (
                        <span className="absolute top-4 left-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                            Sold out
                        </span>
                    )}
                    <Image src={mainImage} alt="" width={250} height={250} />
                </div>
            </div>
            <div className="flex-1">
                <h1 className="text-3xl font-semibold text-slate-800">{product.name}</h1>
                <div className='flex items-center mt-2'>
                    {Array(5).fill('').map((_, index) => (
                        <StarIcon key={index} size={14} className='text-transparent mt-0.5' fill={averageRating >= index + 1 ? "#00C950" : "#D1D5DB"} />
                    ))}
                    <p className="text-sm ml-3 text-slate-500">{ratingCount} Reviews</p>
                </div>
                <div className="flex items-start my-6 gap-3 text-2xl font-semibold text-slate-800">
                    <p>{currency}{Number(product.price).toLocaleString()}</p>
                    <p className="text-xl text-slate-500 line-through">{currency}{Number(product.mrp).toLocaleString()}</p>
                    <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 self-center">
                        Save {((product.mrp - product.price) / product.mrp * 100).toFixed(0)}%
                    </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                    <TagIcon size={14} />
                    <p>Save {((product.mrp - product.price) / product.mrp * 100).toFixed(0)}% right now</p>
                </div>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                    <span className={`size-2 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {isAvailable ? 'In stock and ready to ship' : 'Currently unavailable'}
                </div>
                <div className="flex items-end gap-5 mt-10 flex-wrap">
                    {
                        isAvailable && cart[productId] && (
                            <div className="flex flex-col gap-3">
                                <p className="text-lg text-slate-800 font-semibold">Quantity</p>
                                <Counter productId={productId} />
                            </div>
                        )
                    }
                    <button disabled={!isAvailable} onClick={() => !cart[productId] ? addToCartHandler() : router.push('/cart')} className="bg-slate-800 text-white px-10 py-3 text-sm font-medium rounded hover:bg-slate-900 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        {!isAvailable ? 'Sold out' : !cart[productId] ? 'Add to Cart' : 'View Cart'}
                    </button>
                </div>
                <hr className="border-gray-300 my-5" />
                <div className="flex flex-col gap-4 text-slate-500">
                    <p className="flex gap-3"> <EarthIcon className="text-slate-400" /> Free shipping within supported locations </p>
                    <p className="flex gap-3"> <CreditCardIcon className="text-slate-400" /> Secure bank transfer or mobile money checkout </p>
                    <p className="flex gap-3"> <UserIcon className="text-slate-400" /> Reviewed by the store before approval </p>
                </div>

            </div>
        </div>
    )
}

export default ProductDetails