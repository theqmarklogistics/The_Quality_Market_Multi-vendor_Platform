'use client'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

const Title = ({ title, description, visibleButton = true, href = '' }) => {

    const content = (
        <>
            <p className='text-xs font-semibold uppercase tracking-[0.24em] text-green-600 mb-2'>Curated picks</p>
            <h2 className='text-2xl sm:text-3xl font-semibold text-slate-800'>{title}</h2>
            <div className='flex items-center justify-center gap-4 text-sm text-slate-600 mt-3 max-w-3xl'>
                <p className='max-w-lg'>{description}</p>
                {visibleButton && <span className='text-green-600 flex items-center gap-1 whitespace-nowrap'>View more <ArrowRight size={14} /></span>}
            </div>
        </>
    )

    return (
        <div className='flex flex-col items-center text-center'>
            {visibleButton && href ? (
                <Link href={href} className='inline-flex flex-col items-center'>
                    {content}
                </Link>
            ) : (
                content
            )}
        </div>
    )
}

export default Title