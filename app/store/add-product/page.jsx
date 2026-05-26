'use client'
import { assets } from "@/assets/assets"
import { useAuth } from "@clerk/nextjs"
import Image from "next/image"
import { useState } from "react"
import { toast } from "react-hot-toast"
import axios from "axios"
import { categoryTree } from "@/lib/constants"

export default function StoreAddProduct() {

    const [images, setImages] = useState({ 1: null, 2: null, 3: null, 4: null })
    const [productInfo, setProductInfo] = useState({
        name: "",
        description: "",
        mrp: 0,
        price: 0,
        warehouseQuantity: 0,
        mainCategory: "",
        category: "", // stored value: main category or subcategory (used for filtering)
        wholesalePrice: "",
        wholesaleMinQty: "",
        weightKg: "",
        lengthCm: "",
        widthCm: "",
        heightCm: "",
        importOrigin: "",
    })
    const [loading, setLoading] = useState(false)
    const [aiUsed, setAiUsed] = useState(false)
    const [errors, setErrors] = useState({})
    const [touched, setTouched] = useState({})

    const {getToken} = useAuth();

    const validate = (info = productInfo) => {
        const e = {}
        if (!info.name.trim() || info.name.trim().length < 3) e.name = 'Name must be at least 3 characters.'
        if (!info.description.trim() || info.description.trim().length < 20) e.description = 'Description must be at least 20 characters.'
        const mrp = Number(info.mrp)
        const price = Number(info.price)
        if (!mrp || mrp <= 0) e.mrp = 'Actual price must be greater than 0.'
        if (!price || price <= 0) e.price = 'Offer price must be greater than 0.'
        else if (price > mrp) e.price = 'Offer price cannot exceed actual price.'
        if (Number(info.warehouseQuantity) < 0) e.warehouseQuantity = 'Quantity cannot be negative.'
        return e
    }

    const onChangeHandler = (e) => {
        const updated = { ...productInfo, [e.target.name]: e.target.value }
        setProductInfo(updated)
        if (touched[e.target.name]) {
            setErrors(prev => ({ ...prev, ...validate(updated) }))
        }
    }

    const onBlur = (e) => {
        setTouched(prev => ({ ...prev, [e.target.name]: true }))
        setErrors(validate())
    }

    const handleImageUpload = async (key, file) => {
        if (!file) return;
        // Store the file immediately so it shows in preview and is included on submit
        setImages(prev => ({ ...prev, [key]: file }));

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64String = reader.result;
            const token = await getToken();

            try {
                await toast.promise(axios.post('/api/store/ai', { base64Image: base64String, mimeType: file.type }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }), {
                    loading: "Analyzing image with AI...",
                    success: (res) => {
                        const data = res.data;
                        if (data.name && data.description) {
                            setProductInfo(prev => ({
                                ...prev,
                                name: data.name,
                                description: data.description,
                            }));
                            setAiUsed(true);
                            return "AI filled product info";
                        }
                        return "AI could not analyze the image";
                    },
                    error: (err) => err?.response?.data?.error || err.message,
                });
            } catch (error) {
                console.error(error);
            }
        };
    }
    const onSubmitHandler = async (e) => {
        e.preventDefault()
        const allTouched = { name: true, description: true, mrp: true, price: true, warehouseQuantity: true }
        setTouched(allTouched)
        const validationErrors = validate()
        setErrors(validationErrors)
        if (Object.keys(validationErrors).length > 0) return
        try {
            if(!images[1] && !images[2] && !images[3] && !images[4]){
                return toast.error("Please upload at least one image")
            }
            setLoading(true)
    
            const formData = new FormData();
            formData.append('name', productInfo.name);
            formData.append('description', productInfo.description);
            formData.append('mrp', productInfo.mrp);
            formData.append('price', productInfo.price);
            formData.append('warehouseQuantity', productInfo.warehouseQuantity);
            formData.append('category', productInfo.category);
            if (productInfo.weightKg) formData.append('weightKg', productInfo.weightKg);
            if (productInfo.lengthCm) formData.append('lengthCm', productInfo.lengthCm);
            if (productInfo.widthCm) formData.append('widthCm', productInfo.widthCm);
            if (productInfo.heightCm) formData.append('heightCm', productInfo.heightCm);
            if (productInfo.importOrigin) formData.append('importOrigin', productInfo.importOrigin);
            if (productInfo.wholesalePrice) formData.append('wholesalePrice', productInfo.wholesalePrice);
            if (productInfo.wholesaleMinQty) formData.append('wholesaleMinQty', productInfo.wholesaleMinQty);
            // Append all the images to the form data
            Object.keys(images).forEach(key => {
                if (images[key]) formData.append('images', images[key]);
            });

            const token = await getToken();
            const {data} = await axios.post('/api/store/product', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            toast.success(data.message)

            setProductInfo({ name: "", description: "", mrp: 0, price: 0, warehouseQuantity: 0, mainCategory: "", category: "", wholesalePrice: "", wholesaleMinQty: "", weightKg: "", lengthCm: "", widthCm: "", heightCm: "", importOrigin: "" })
            setImages({ 1: null, 2: null, 3: null, 4: null })
            setErrors({})
            setTouched({})

        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
        
        
    }


    return (
        <form onSubmit={onSubmitHandler} className="text-slate-500 mb-28">
            <h1 className="text-2xl">Add New <span className="text-slate-800 font-medium">Products</span></h1>
            <p className="mt-7">Product Images</p>

            <div htmlFor="" className="flex gap-3 mt-4">
                {Object.keys(images).map((key) => (
                    <label key={key} htmlFor={`images${key}`}>
                        <Image width={300} height={300} className='h-15 w-auto border border-slate-200 rounded cursor-pointer' src={images[key] ? URL.createObjectURL(images[key]) : assets.upload_area} alt="" />
                        <input type="file" accept='image/*' id={`images${key}`} onChange={e => handleImageUpload(key, e.target.files[0])} hidden />
                    </label>
                ))}
            </div>

            <div className="flex flex-col gap-1 my-6">
                <label htmlFor="name">Name</label>
                <input
                    id="name" type="text" name="name"
                    onChange={onChangeHandler} onBlur={onBlur}
                    value={productInfo.name}
                    placeholder="Enter product name"
                    className={`w-full max-w-sm p-2 px-4 outline-none border rounded ${errors.name && touched.name ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                />
                {errors.name && touched.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            <div className="flex flex-col gap-1 my-6">
                <label htmlFor="description" className="flex items-center justify-between max-w-sm">
                    <span>Description</span>
                    <span className={`text-xs ${productInfo.description.length < 20 ? 'text-slate-400' : 'text-green-600'}`}>
                        {productInfo.description.length} chars
                    </span>
                </label>
                <textarea
                    id="description" name="description"
                    onChange={onChangeHandler} onBlur={onBlur}
                    value={productInfo.description}
                    placeholder="Enter product description (min 20 characters)"
                    rows={5}
                    className={`w-full max-w-sm p-2 px-4 outline-none border rounded resize-none ${errors.description && touched.description ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                />
                {errors.description && touched.description && <p className="text-xs text-red-500">{errors.description}</p>}
            </div>

            <div className="flex flex-wrap gap-5">
                <div className="flex flex-col gap-1">
                    <label htmlFor="mrp">Actual Price (Rwf)</label>
                    <input
                        id="mrp" type="number" name="mrp"
                        onChange={onChangeHandler} onBlur={onBlur}
                        value={productInfo.mrp} placeholder="0"
                        className={`w-full max-w-45 p-2 px-4 outline-none border rounded ${errors.mrp && touched.mrp ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    />
                    {errors.mrp && touched.mrp && <p className="text-xs text-red-500">{errors.mrp}</p>}
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="price">Offer Price (Rwf)</label>
                    <input
                        id="price" type="number" name="price"
                        onChange={onChangeHandler} onBlur={onBlur}
                        value={productInfo.price} placeholder="0"
                        className={`w-full max-w-45 p-2 px-4 outline-none border rounded ${errors.price && touched.price ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    />
                    {errors.price && touched.price && <p className="text-xs text-red-500">{errors.price}</p>}
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor="warehouseQuantity">Available Quantity (Warehouse)</label>
                    <input
                        id="warehouseQuantity" type="number" name="warehouseQuantity"
                        min="0" step="1"
                        onChange={onChangeHandler} onBlur={onBlur}
                        value={productInfo.warehouseQuantity} placeholder="0"
                        className={`w-full max-w-45 p-2 px-4 outline-none border rounded ${errors.warehouseQuantity && touched.warehouseQuantity ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                    />
                    {errors.warehouseQuantity && touched.warehouseQuantity && <p className="text-xs text-red-500">{errors.warehouseQuantity}</p>}
                </div>
            </div>

            {/* Wholesale Pricing */}
            <div className="mt-8 border-t border-slate-100 pt-6">
                <p className="text-slate-700 font-medium mb-1">Wholesale Pricing</p>
                <p className="text-xs text-slate-400 mb-4">Optional — set a lower price for bulk buyers. Leave blank to disable.</p>
                <div className="flex flex-wrap gap-5">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="wholesalePrice">Wholesale Price (Rwf)</label>
                        <input
                            id="wholesalePrice" type="number" name="wholesalePrice" min="0"
                            onChange={onChangeHandler} value={productInfo.wholesalePrice} placeholder="0"
                            className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="wholesaleMinQty">Min. Qty for Wholesale</label>
                        <input
                            id="wholesaleMinQty" type="number" name="wholesaleMinQty" min="1" step="1"
                            onChange={onChangeHandler} value={productInfo.wholesaleMinQty} placeholder="e.g. 10"
                            className="w-full max-w-45 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                </div>
            </div>

            <label htmlFor="mainCategory" className="flex flex-col gap-2 my-6">
                Category
                <select
                    id="mainCategory"
                    value={productInfo.mainCategory}
                    onChange={e => setProductInfo({ ...productInfo, mainCategory: e.target.value, category: "" })}
                    className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded"
                    required
                >
                    <option value="">Select a category</option>
                    {categoryTree.map((item) => (
                        <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                </select>
            </label>

            {productInfo.mainCategory && (
                <label htmlFor="subcategory" className="flex flex-col gap-2 my-6">
                    Subcategory
                    <select
                        id="subcategory"
                        value={productInfo.category}
                        onChange={e => setProductInfo({ ...productInfo, category: e.target.value })}
                        className="w-full max-w-sm p-2 px-4 outline-none border border-slate-200 rounded"
                        required
                    >
                        <option value="">Select a subcategory</option>
                        {(() => {
                            const entry = categoryTree.find(c => c.name === productInfo.mainCategory)
                            if (!entry) return null
                            const options = [entry.name, ...entry.subcategories]
                            return options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))
                        })()}
                    </select>
                </label>
            )}

            {/* Shipping Details */}
            <div className="mt-8 border-t border-slate-100 pt-6">
                <p className="text-slate-700 font-medium mb-1">Shipping Details</p>
                <p className="text-xs text-slate-400 mb-4">Optional — enables accurate delivery cost calculation for Full Managed stores.</p>
                <div className="flex flex-wrap gap-5 mb-5">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="weightKg">Weight (kg)</label>
                        <input
                            id="weightKg" type="number" name="weightKg" step="0.01" min="0"
                            onChange={onChangeHandler} value={productInfo.weightKg} placeholder="0.00"
                            className="w-32 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="lengthCm">Length (cm)</label>
                        <input
                            id="lengthCm" type="number" name="lengthCm" step="0.1" min="0"
                            onChange={onChangeHandler} value={productInfo.lengthCm} placeholder="0"
                            className="w-32 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="widthCm">Width (cm)</label>
                        <input
                            id="widthCm" type="number" name="widthCm" step="0.1" min="0"
                            onChange={onChangeHandler} value={productInfo.widthCm} placeholder="0"
                            className="w-32 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="heightCm">Height (cm)</label>
                        <input
                            id="heightCm" type="number" name="heightCm" step="0.1" min="0"
                            onChange={onChangeHandler} value={productInfo.heightCm} placeholder="0"
                            className="w-32 p-2 px-4 outline-none border border-slate-200 rounded"
                        />
                    </div>
                </div>
                <div>
                    <p className="text-sm text-slate-600 mb-2">Product Origin</p>
                    <div className="flex gap-5">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                            <input
                                type="radio" name="importOrigin" value=""
                                checked={productInfo.importOrigin === ''}
                                onChange={onChangeHandler}
                            />
                            Local (Rwanda)
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                            <input
                                type="radio" name="importOrigin" value="CHINA"
                                checked={productInfo.importOrigin === 'CHINA'}
                                onChange={onChangeHandler}
                            />
                            Imported from China
                        </label>
                    </div>
                </div>
            </div>

            <br />

            <button disabled={loading} className="bg-slate-800 text-white px-6 mt-7 py-2 hover:bg-slate-900 rounded transition">Add Product</button>
        </form>
    )
}