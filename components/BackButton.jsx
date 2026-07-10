'use client'
// Universal "move backward" control — every page can navigate back. Uses browser
// history when available and falls back to the home page. Hidden on the home page
// itself (there's nowhere back to go).
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

export default function BackButton({ className = "" }) {
    const router = useRouter();
    const pathname = usePathname();

    if (pathname === "/") return null;

    const goBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/");
        }
    };

    return (
        <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-green-400 hover:text-green-700 active:scale-95 ${className}`}
        >
            <ArrowLeftIcon size={15} /> Back
        </button>
    );
}
