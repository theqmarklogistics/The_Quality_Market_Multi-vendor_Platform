'use client'

import { assets } from "@/assets/assets"
import { useAuth } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import axios from "axios"
import { categoryTree } from "@/lib/constants"
import { ArrowLeft } from "lucide-react"

function getMainCategory(category) {
    const entry = categoryTree.find(
        (c) => c.name === category || c.subcategories.includes(category)
    )
    return entry ? entry.name : ""
}

export default function StoreEditProduct() {
    const params = useParams()
    const router = useRouter()
    const productId = params?.productId

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [images, setImages] = useState({ 1: null, 2: null, 3: null, 4: null }) // null | { type: 'existing', url } | { type: 'file', file }
    const [productInfo, setProductInfo] = useState({
        name: "",
        description: "",
        mrp: 0,
        price: 0,
        warehouseQuantity: 0,
        wholesalePrice: "",
        wholesaleMinQty: "",
        mainCategory: "",
        category: "",
    })

    const { getToken } = useAuth()

    useEffect(() => {
        if (!productId) return
        const fetchProduct = async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get(`/api/store/product/${productId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                const main = getMainCategory(data.category)
                setProductInfo({
                    name: data.name,
                    description: data.description,
                    mrp: data.mrp,
                    price: data.price,
                    warehouseQuantity: data.warehouseQuantity ?? 0,
                    wholesalePrice: data.wholesalePrice ?? "",
                    wholesaleMinQty: data.wholesaleMinQty ?? "",
                    mainCategory: main,
                    category: data.category,
                })
                const existing = Array.isArray(data.images) ? data.images : []
                const slots = { 1: null, 2: null, 3: null, 4: null }
                existing.forEach((url, i) => {
                    const key = (i + 1).toString()
                    if (key in slots) slots[key] = { type: "existing", url }
                })
                setImages(slots)
            } catch (err) {
                toast.error(err?.response?.data?.error || err.message)
                router.push("/store/manage-product")
            } finally {
                setLoading(false)
            }
        }
        fetchProduct()
    }, [productId])

    const onChangeHandler = (e) => {
        setProductInfo({ ...productInfo, [e.target.name]: e.target.value })
    }

    const setImageSlot = (key, value) => {
        setImages((prev) => ({ ...prev, [key]: value }))
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()
        if (!productInfo.category) {
            toast.error("Please select a category and subcategory")
            return
        }
        const existingUrls = []
        const newFiles = []
        ;[1, 2, 3, 4].forEach((i) => {
            const k = i.toString()
            const slot = images[k]
            if (slot?.type === "existing") existingUrls.push(slot.url)
            if (slot?.type === "file") newFiles.push(slot.file)
        })
        if (existingUrls.length === 0 && newFiles.length === 0) {
            toast.error("Please keep or add at least one image")
            return
        }

        setSaving(true)
        try {
            const formData = new FormData()
            formData.append("name", productInfo.name)
            formData.append("description", productInfo.description)
            formData.append("mrp", productInfo.mrp)
            formData.append("price", productInfo.price)
            formData.append("warehouseQuantity", productInfo.warehouseQuantity)
            formData.append("category", productInfo.category)
            formData.append("existingImages", JSON.stringify(existingUrls))
            newFiles.forEach((f) => formData.append("images", f))
            if (productInfo.wholesalePrice) formData.append("wholesalePrice", productInfo.wholesalePrice)
            if (productInfo.wholesaleMinQty) formData.append("wholesaleMinQty", productInfo.wholesaleMinQty)

            const token = await getToken()
            await axios.patch(`/api/store/product/${productId}`, formData, {
                headers: { Authorization: `Bearer ${token}` },
            })
            toast.success("Product updated successfully")
            router.push("/store/manage-product")
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="text-slate-500 mb-28">
                <p>Loading product...</p>
            </div>
        )
    }

    return (
        <form
            onSubmit={(e) =>
                toast.promise(onSubmitHandler(e), { loading: "Saving..." })
            }
            className="text-slate-500 mb-28"
        >
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/store/manage-product"
                    className="p-1.5 rounded hover:bg-slate-100 transition"
                    aria-label="Back to manage products"
                >
                    <ArrowLeft className="size-5" />
                </Link>
                <h1 className="text-2xl">
                    Edit <span className="text-slate-800 font-medium">Product</span>
                </h1>
            </div>

            <p className="mt-4">Product Images</p>
            <div className="flex gap-3 mt-4 flex-wrap">
                {[1, 2, 3, 4].map((i) => {
                    const key = i.toString()
                    const slot = images[key]
                    const src =
                        slot?.type === "file"
                            ? URL.createObjectURL(slot.file)
                            : slot?.type === "existing"
                            ? slot.url
                            : null
                    return (
                        <label key={key} htmlFor={`img-${key}`} className="block">
                            <Image
                                width={120}
                                height={120}
                                className="h-28 w-28 object-cover border border-slate-200 rounded cursor-pointer"
                                src={src || assets.upload_area}
                                alt=""
                            />
                            <input
                                type="file"
                                accept="image/*"
                                id={`img-${key}`}
                                hidden
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    setImageSlot(key, file ? { type: "file", file } : null)
                                }}
                            />
                            {slot && (
                                <button
                                    type="button"
                                    className="text-xs text-red-600 mt-1 block"
                                    onClick={() => setImageSlot(key, null)}
                                >
                                    Remove
                                </button>
                            )}
                        </label>
                    )
                })}
            </div>

            <label className="flex flex-col gap-2 my-6">
                Name
                <input
                    type="text"
                    name="name"
                    value={productInfo.name}
                    onChange={onChangeHandler}
                    placeholder="Enter product name"
                    className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded"
                    required
                />
            </label>

            <label className="flex flex-col gap-2 my-6">
                Description
                <textarea
                    name="description"
                    value={productInfo.description}
                    onChange={onChangeHandler}
                    placeholder="Enter product description"
                    rows={5}
                    className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded resize-none"
                    required
                />
            </label>

            <div className="flex gap-5">
                <label className="flex flex-col gap-2">
                    Actual Price (Rwf)
                    <input
                        type="number"
                        name="mrp"
                        value={productInfo.mrp || ""}
                        onChange={onChangeHandler}
                        placeholder="0"
                        className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        required
                    />
                </label>
                <label className="flex flex-col gap-2">
                    Offer Price (Rwf)
                    <input
                        type="number"
                        name="price"
                        value={productInfo.price || ""}
                        onChange={onChangeHandler}
                        placeholder="0"
                        className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        required
                    />
                </label>
                <label className="flex flex-col gap-2">
                    Available Quantity (Warehouse)
                    <input
                        type="number"
                        name="warehouseQuantity"
                        value={productInfo.warehouseQuantity || ""}
                        onChange={onChangeHandler}
                        min="0"
                        step="1"
                        placeholder="0"
                        className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        required
                    />
                </label>
            </div>

            {/* Wholesale Pricing */}
            <div className="mt-8 border-t border-slate-100 pt-6">
                <p className="text-slate-700 font-medium mb-1">Wholesale Pricing</p>
                <p className="text-xs text-slate-400 mb-4">Optional — set a lower price for bulk buyers. Leave blank to disable.</p>
                <div className="flex flex-wrap gap-5">
                    <label className="flex flex-col gap-2">
                        Wholesale Price (Rwf)
                        <input
                            type="number" name="wholesalePrice" min="0"
                            value={productInfo.wholesalePrice}
                            onChange={onChangeHandler}
                            placeholder="0"
                            className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </label>
                    <label className="flex flex-col gap-2">
                        Min. Qty for Wholesale
                        <input
                            type="number" name="wholesaleMinQty" min="1" step="1"
                            value={productInfo.wholesaleMinQty}
                            onChange={onChangeHandler}
                            placeholder="e.g. 10"
                            className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </label>
                </div>
            </div>

            <label htmlFor="mainCategory" className="flex flex-col gap-2 my-6">
                Category
                <select
                    id="mainCategory"
                    value={productInfo.mainCategory}
                    onChange={(e) =>
                        setProductInfo({
                            ...productInfo,
                            mainCategory: e.target.value,
                            category: "",
                        })
                    }
                    className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded"
                    required
                >
                    <option value="">Select a category</option>
                    {categoryTree.map((item) => (
                        <option key={item.name} value={item.name}>
                            {item.name}
                        </option>
                    ))}
                </select>
            </label>

            {productInfo.mainCategory && (
                <label htmlFor="subcategory" className="flex flex-col gap-2 my-6">
                    Subcategory
                    <select
                        id="subcategory"
                        value={productInfo.category}
                        onChange={(e) =>
                            setProductInfo({ ...productInfo, category: e.target.value })
                        }
                        className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded"
                        required
                    >
                        <option value="">Select a subcategory</option>
                        {(() => {
                            const entry = categoryTree.find(
                                (c) => c.name === productInfo.mainCategory
                            )
                            if (!entry) return null
                            const options = [entry.name, ...entry.subcategories]
                            return options.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))
                        })()}
                    </select>
                </label>
            )}

            <div className="flex gap-3 mt-7">
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-slate-800 text-white px-6 py-2 hover:bg-slate-900 rounded transition disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save changes"}
                </button>
                <Link
                    href="/store/manage-product"
                    className="px-6 py-2 border border-slate-300 rounded hover:bg-slate-50 transition"
                >
                    Cancel
                </Link>
            </div>
        </form>
    )
}
