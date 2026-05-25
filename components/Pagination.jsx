'use client'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

export default function Pagination({ page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null

    const pages = []
    const delta = 2
    const left = Math.max(1, page - delta)
    const right = Math.min(totalPages, page + delta)

    for (let i = left; i <= right; i++) pages.push(i)

    return (
        <div className="flex items-center justify-center gap-1 mt-6">
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
            >
                <ChevronLeftIcon size={16} />
            </button>

            {left > 1 && (
                <>
                    <button onClick={() => onPageChange(1)} className="px-3 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-50 border border-slate-200 transition">1</button>
                    {left > 2 && <span className="text-slate-400 px-1">…</span>}
                </>
            )}

            {pages.map(p => (
                <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={`px-3 py-1 rounded-md text-sm border transition ${p === page
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    {p}
                </button>
            ))}

            {right < totalPages && (
                <>
                    {right < totalPages - 1 && <span className="text-slate-400 px-1">…</span>}
                    <button onClick={() => onPageChange(totalPages)} className="px-3 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-50 border border-slate-200 transition">{totalPages}</button>
                </>
            )}

            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Next page"
            >
                <ChevronRightIcon size={16} />
            </button>

            <span className="text-xs text-slate-400 ml-2">{page} / {totalPages}</span>
        </div>
    )
}
