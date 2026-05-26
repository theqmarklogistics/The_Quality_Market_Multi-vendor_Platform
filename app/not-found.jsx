import Link from 'next/link'

export const metadata = {
    title: '404 — Page Not Found | The Quality Market',
}

export default function NotFound() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6">
            <p className="text-8xl font-bold text-slate-100 select-none">404</p>
            <h1 className="text-2xl font-semibold text-slate-800 mt-2 mb-3">Page not found</h1>
            <p className="text-slate-500 max-w-sm mb-8">
                The page you&apos;re looking for doesn&apos;t exist or may have been moved.
            </p>
            <div className="flex gap-3">
                <Link
                    href="/"
                    className="rounded-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-6 py-2.5 transition"
                >
                    Go Home
                </Link>
                <Link
                    href="/shop"
                    className="rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-6 py-2.5 transition"
                >
                    Browse Shop
                </Link>
            </div>
        </div>
    )
}
