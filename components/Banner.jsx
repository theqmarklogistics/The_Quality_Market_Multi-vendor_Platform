'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

export default function Banner() {
    const [config, setConfig] = useState(null) // null = loading
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        fetch('/api/banner')
            .then(r => r.json())
            .then(setConfig)
            .catch(() => setConfig({ isActive: false }))
    }, [])

    // Hide while loading, when inactive, or when dismissed
    if (!config || !config.isActive || dismissed) return null

    const copyCode = () => {
        navigator.clipboard?.writeText(config.couponCode).catch(() => null)
        toast.success('Coupon code copied!')
    }

    return (
        <div className="w-full px-4 sm:px-6 py-2 text-sm text-white bg-[linear-gradient(90deg,_#0f172a,_#16a34a)]">
            <div className='flex items-center justify-between gap-4 max-w-7xl mx-auto'>
                <p className='font-medium text-center sm:text-left'>{config.text}</p>
                <div className="flex items-center space-x-3 shrink-0">
                    {config.couponCode && (
                        <button
                            onClick={copyCode}
                            type="button"
                            className="font-medium text-slate-900 bg-white px-5 py-2 rounded-full max-sm:hidden hover:-translate-y-0.5 active:scale-95 transition"
                        >
                            Copy code
                        </button>
                    )}
                    <button
                        onClick={() => setDismissed(true)}
                        type="button"
                        className="font-medium text-white/90 hover:text-white py-2 rounded-full transition"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect y="12.532" width="17.498" height="2.1" rx="1.05" transform="rotate(-45.74 0 12.532)" fill="#fff" />
                            <rect x="12.533" y="13.915" width="17.498" height="2.1" rx="1.05" transform="rotate(-135.74 12.533 13.915)" fill="#fff" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}
