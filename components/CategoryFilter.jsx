'use client'

import { useRouter } from "next/navigation"
import { productCategories } from "@/lib/constants"
import {
    Leaf,
    Shirt,
    Palette,
    Car,
    ShoppingBag,
    FlaskConical,
    Monitor,
    Building2,
    Speaker,
    Plug,
    Sofa,
    Heart,
    Cog,
    Gauge,
    LampDesk,
    Lightbulb,
    Factory,
    Mountain,
    Building,
    Package,
    Shield,
    Handshake,
    Dumbbell,
    Layers,
    Wrench,
    Gamepad2,
    Truck,
    ChevronUp,
    LayoutGrid,
} from "lucide-react"
import { useRef, useState, useEffect } from "react"

const categoryIcons = {
    'Agriculture & Food': Leaf,
    'Apparel & Accessories': Shirt,
    'Arts & Crafts': Palette,
    'Auto, Motorcycle Parts & Accessories': Car,
    'Bags, Cases & Boxes': ShoppingBag,
    'Chemicals': FlaskConical,
    'Computer Products': Monitor,
    'Construction & Decoration': Building2,
    'Consumer Electronics': Speaker,
    'Electrical & Electronics': Plug,
    'Furniture': Sofa,
    'Health & Medicine': Heart,
    'Industrial Equipment & Components': Cog,
    'Instruments & Meters': Gauge,
    'Light Industry & Daily Use': LampDesk,
    'Lights & Lighting': Lightbulb,
    'Manufacturing & Processing Machinery': Factory,
    'Metallurgy, Mineral & Energy': Mountain,
    'Office Supplies': Building,
    'Packaging & Printing': Package,
    'Security & Protection': Shield,
    'Service': Handshake,
    'Sporting Goods & Recreation': Dumbbell,
    'Textile': Layers,
    'Tools & Hardware': Wrench,
    'Toys': Gamepad2,
    'Transportation': Truck,
}

function CategoryRow({ category, isActive, onSelect }) {
    const Icon = categoryIcons[category] ?? LayoutGrid
    return (
        <button
            type="button"
            onClick={() => onSelect(category)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors rounded-md ${
                isActive
                    ? 'bg-orange-500/15 text-orange-700'
                    : 'text-slate-700 hover:bg-orange-500/10 hover:text-orange-700'
            }`}
        >
            <Icon className="shrink-0 size-5 text-slate-500" aria-hidden />
            <span className="truncate">{category}</span>
        </button>
    )
}

export default function CategoryFilter({ currentCategory, onSelectCategory, className = '' }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const triggerRef = useRef(null)
    const panelRef = useRef(null)

    const mid = Math.ceil(productCategories.length / 2)
    const leftCol = productCategories.slice(0, mid)
    const rightCol = productCategories.slice(mid)

    const handleSelect = (cat) => {
        if (onSelectCategory) {
            onSelectCategory(cat)
        } else {
            const params = new URLSearchParams()
            if (cat) params.set('category', cat)
            router.push(`/shop${params.toString() ? '?' + params.toString() : ''}`)
        }
        setOpen(false)
    }

    useEffect(() => {
        if (!open) return
        const close = (e) => {
            if (
                panelRef.current?.contains(e.target) ||
                triggerRef.current?.contains(e.target)
            ) return
            setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
                aria-expanded={open}
                aria-haspopup="true"
            >
                <LayoutGrid className="size-4" aria-hidden />
                <span>All Categories</span>
                <ChevronUp
                    className={`size-4 transition-transform ${open ? '' : 'rotate-180'}`}
                    aria-hidden
                />
            </button>

            {open && (
                <div
                    ref={panelRef}
                    className="absolute left-0 top-full z-50 mt-1 min-w-[420px] rounded-lg border border-slate-200 bg-white shadow-lg py-3"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <div className="grid grid-cols-2 gap-x-2 px-2">
                        <div className="flex flex-col">
                            {leftCol.map((cat) => (
                                <CategoryRow
                                    key={cat}
                                    category={cat}
                                    isActive={currentCategory === cat}
                                    onSelect={handleSelect}
                                />
                            ))}
                        </div>
                        <div className="flex flex-col">
                            {rightCol.map((cat) => (
                                <CategoryRow
                                    key={cat}
                                    category={cat}
                                    isActive={currentCategory === cat}
                                    onSelect={handleSelect}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 px-3">
                        <button
                            type="button"
                            onClick={() => handleSelect(null)}
                            className={`text-sm font-medium ${!currentCategory ? 'text-orange-600' : 'text-slate-500 hover:text-orange-600'}`}
                        >
                            Clear filter · Show all
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
