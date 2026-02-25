'use client'

import { useRouter } from "next/navigation"
import { categoryTree } from "@/lib/constants"
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
    ChevronRight,
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

function CategoryRow({ category, isActive, onSelect, hasSubcategories, onMouseEnter, onMouseLeave, subcategories, currentCategory, onSelectSub, isHovered }) {
    const Icon = categoryIcons[category] ?? LayoutGrid
    return (
        <div
            className="relative"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <button
                type="button"
                onClick={() => onSelect(category)}
                className={`w-full min-w-0 flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors rounded-md ${
                    isActive
                        ? 'bg-orange-500/15 text-orange-700'
                        : 'text-slate-700 hover:bg-orange-500/10 hover:text-orange-700'
                }`}
            >
                <Icon className="shrink-0 size-5 text-slate-500" aria-hidden />
                <span className="flex-1 min-w-0 truncate" title={category}>{category}</span>
                {hasSubcategories && (
                    <ChevronRight className="shrink-0 size-4 text-slate-400 flex-shrink-0" aria-hidden />
                )}
            </button>
            {isHovered && hasSubcategories && subcategories.length > 0 && (
                <div
                    className="absolute left-full top-0 ml-0.5 min-w-[200px] max-h-[320px] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg z-20"
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <p className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Subcategories
                    </p>
                    {subcategories.map((sub) => (
                        <SubcategoryRow
                            key={sub}
                            name={sub}
                            isActive={currentCategory === sub}
                            onSelect={onSelectSub}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function SubcategoryRow({ name, isActive, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(name)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-md ${
                isActive
                    ? 'bg-orange-500/15 text-orange-700'
                    : 'text-slate-600 hover:bg-orange-500/10 hover:text-orange-700'
            }`}
        >
            <span className="truncate pl-2">{name}</span>
        </button>
    )
}

export default function CategoryFilter({ currentCategory, onSelectCategory, className = '' }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [hoveredCategory, setHoveredCategory] = useState(null)
    const triggerRef = useRef(null)
    const panelRef = useRef(null)

    const mid = Math.ceil(categoryTree.length / 2)
    const leftCol = categoryTree.slice(0, mid)
    const rightCol = categoryTree.slice(mid)

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
                    className="absolute left-0 top-full z-50 mt-1 flex flex-col rounded-lg border border-slate-200 bg-white shadow-lg"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseLeave={() => setHoveredCategory(null)}
                >
                    <div className="flex py-3">
                        <div className="grid grid-cols-2 gap-x-2 px-2 min-w-[520px] [&>div]:min-w-0">
                            <div className="flex flex-col min-w-0">
                                {leftCol.map((item) => (
                                    <CategoryRow
                                        key={item.name}
                                        category={item.name}
                                        isActive={currentCategory === item.name}
                                        onSelect={handleSelect}
                                        hasSubcategories={item.subcategories.length > 0}
                                        subcategories={item.subcategories}
                                        currentCategory={currentCategory}
                                        onSelectSub={handleSelect}
                                        isHovered={hoveredCategory === item.name}
                                        onMouseEnter={() => setHoveredCategory(item.name)}
                                        onMouseLeave={() => setHoveredCategory(null)}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-col min-w-0">
                                {rightCol.map((item) => (
                                    <CategoryRow
                                        key={item.name}
                                        category={item.name}
                                        isActive={currentCategory === item.name}
                                        onSelect={handleSelect}
                                        hasSubcategories={item.subcategories.length > 0}
                                        subcategories={item.subcategories}
                                        currentCategory={currentCategory}
                                        onSelectSub={handleSelect}
                                        isHovered={hoveredCategory === item.name}
                                        onMouseEnter={() => setHoveredCategory(item.name)}
                                        onMouseLeave={() => setHoveredCategory(null)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 px-3 py-2 rounded-b-lg">
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
