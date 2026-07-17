'use client'
import { StarIcon, EarthIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

const ProductCard = ({ product }) => {

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '$'

    // calculate the average rating of the product
    const ratingCount = product.rating?.length || 0;
    const rating = ratingCount > 0
        ? Math.round(product.rating.reduce((acc, curr) => acc + curr.rating, 0) / ratingCount)
        : 0;

    const imageSrc = product.images?.[0]

    return (
        <Link href={`/product/${product.id}`} className='group block max-xl:mx-auto w-full max-w-60 sm:max-w-none'>
            <div className='rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_40px_rgba(15,23,42,0.10)]'>
                <div className='relative h-44 sm:h-64 flex items-center justify-center bg-[linear-gradient(180deg,_rgba(248,250,252,1)_0%,_rgba(241,245,249,1)_100%)]'>
                    {product.importOrigin && (
                        <span className='absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-blue-600/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm'>
                            <EarthIcon size={11} /> To be imported
                        </span>
                    )}
                    {imageSrc ? (
                        <Image width={500} height={500} className='max-h-32 sm:max-h-40 w-auto object-contain group-hover:scale-105 transition duration-300' src={imageSrc} alt={product.name} />
                    ) : (
                        <div className='flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.24em] text-slate-400'>No image</div>
                    )}
                </div>
                <div className='flex justify-between gap-3 text-sm text-slate-800 p-4 sm:p-4.5 items-start'>
                    <div className='min-w-0'>
                        <p className='font-medium leading-5 line-clamp-2'>{product.name}</p>
                        <div className='flex mt-1'>
                            {Array(5).fill('').map((_, index) => (
                                <StarIcon key={index} size={14} className='text-transparent mt-0.5' fill={rating >= index + 1 ? "#16A34A" : "#D1D5DB"} />
                            ))}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{ratingCount > 0 ? `${ratingCount} review${ratingCount === 1 ? '' : 's'}` : 'No reviews yet'}</p>
                    </div>
                    <p className='font-semibold whitespace-nowrap text-slate-900'>{currency}{Number(product.price).toLocaleString()}</p>
                </div>
            </div>
        </Link>
    )
}

export default ProductCard