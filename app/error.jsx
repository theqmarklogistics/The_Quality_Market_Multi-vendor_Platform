'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className='min-h-screen flex items-center justify-center px-4'>
            <div className='text-center max-w-md'>
                <h2 className='text-2xl font-semibold text-slate-800 mb-2'>Something went wrong</h2>
                <p className='text-slate-500 text-sm mb-6'>
                    {error?.message || 'An unexpected error occurred. Please try again.'}
                </p>
                <div className='flex items-center justify-center gap-3'>
                    <button
                        onClick={reset}
                        className='bg-slate-800 text-white px-6 py-2.5 rounded-full text-sm hover:bg-slate-900 transition'
                    >
                        Try again
                    </button>
                    <Link
                        href='/'
                        className='bg-white border border-slate-200 text-slate-700 px-6 py-2.5 rounded-full text-sm hover:bg-slate-50 transition'
                    >
                        Go home
                    </Link>
                </div>
            </div>
        </div>
    )
}
