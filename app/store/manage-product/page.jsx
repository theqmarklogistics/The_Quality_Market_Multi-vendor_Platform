'use client'
import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import Image from "next/image"
import Link from "next/link"
import Loading from "@/components/Loading"
import { useAuth } from "@clerk/nextjs"
import axios from "axios"
import { Pencil, Trash2 } from "lucide-react"

export default function StoreManageProducts() {

    const {getToken, user} = useAuth();

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'Rwf'

    const [loading, setLoading] = useState(true)
    const [products, setProducts] = useState([])

    const fetchProducts = async () => {
        try {
            const token = await getToken();
            const {data} = await axios.get('/api/store/product', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            const list = Array.isArray(data) ? data : (data?.products || [])
            setProducts(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const toggleStock = async (productId) => {
        try {
            const token = await getToken();
            const { data } = await axios.post('/api/store/stock-toggle', { productId }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setProducts(products.map(p => p.id === productId ? { ...p, inStock: !p.inStock } : p));
            toast.success(data.message);
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    }

    const handleDelete = async (productId, productName) => {
        if (!confirm(`Delete "${productName}"? This cannot be undone.`)) return;
        try {
            const token = await getToken();
            await axios.delete(`/api/store/product/${productId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setProducts(products.filter(p => p.id !== productId));
            toast.success("Product deleted");
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        }
    }

    useEffect(() => {
        fetchProducts()
    }, [])

    if (loading) return <Loading />

    return (
        <>
            <h1 className="text-2xl text-slate-500 mb-5">Manage <span className="text-slate-800 font-medium">Products</span></h1>
            <table className="w-full max-w-4xl text-left  ring ring-slate-200  rounded overflow-hidden text-sm">
                <thead className="bg-slate-50 text-gray-700 uppercase tracking-wider">
                    <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3 hidden md:table-cell">Description</th>
                        <th className="px-4 py-3 hidden md:table-cell">MRP</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody className="text-slate-700">
                    {products.map((product) => (
                        <tr key={product.id} className="border-t border-gray-200 hover:bg-gray-50">
                            <td className="px-4 py-3">
                                <div className="flex gap-2 items-center">
                                    {product.images?.[0] ? (
                                    <Image width={40} height={40} className="p-1 shadow rounded object-cover" src={product.images[0]} alt={product.name} />
                                ) : (
                                    <div className="w-10 h-10 rounded bg-slate-200 flex items-center justify-center text-slate-400 text-xs">—</div>
                                )}
                                    {product.name}
                                </div>
                            </td>
                            <td className="px-4 py-3 max-w-md text-slate-600 hidden md:table-cell truncate">{product.description}</td>
                            <td className="px-4 py-3 hidden md:table-cell">{currency} {product.mrp.toLocaleString()}</td>
                            <td className="px-4 py-3">{currency} {product.price.toLocaleString()}</td>
                            <td className="px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer text-gray-900 gap-3">
                                        <input type="checkbox" className="sr-only peer" onChange={() => toast.promise(toggleStock(product.id), { loading: "Updating..." })} checked={product.inStock} />
                                        <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-green-600 transition-colors duration-200"></div>
                                        <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                    </label>
                                    <Link
                                        href={`/store/edit-product/${product.id}`}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:bg-slate-100 rounded transition"
                                        title="Edit"
                                    >
                                        <Pencil className="size-4" />
                                        <span className="sr-only sm:not-sr-only sm:inline">Edit</span>
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(product.id, product.name)}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 text-red-600 hover:bg-red-50 rounded transition"
                                        title="Delete"
                                    >
                                        <Trash2 className="size-4" />
                                        <span className="sr-only sm:not-sr-only sm:inline">Delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    )
}