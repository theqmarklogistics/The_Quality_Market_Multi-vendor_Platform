'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import Image from "next/image"

export default function AdminProducts() {
    const { getToken } = useAuth()

    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)

    const fetchPendingProducts = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/products', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            setProducts(data.products || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const reviewProduct = async (productId, status) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/products', { productId, status }, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            toast.success(data.message)
            await fetchPendingProducts()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    useEffect(() => {
        fetchPendingProducts()
    }, [])

    if (loading) return <p className="text-slate-500">Loading pending products...</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Approve <span className="text-slate-800 font-medium">Products</span></h1>

            {products.length > 0 ? (
                <div className="flex flex-col gap-4 mt-4 max-w-5xl">
                    {products.map((product) => (
                        <div key={product.id} className="bg-white border rounded-lg shadow-sm p-4">
                            {product.images?.[0] && (
                                <div className="mb-3">
                                    <Image
                                        src={product.images[0]}
                                        alt={product.name}
                                        width={120}
                                        height={120}
                                        className="h-24 w-24 rounded-md object-cover border border-slate-200"
                                    />
                                </div>
                            )}
                            <p className="text-slate-800 font-medium text-lg">{product.name}</p>
                            <p className="text-sm">Store: {product.store?.name}</p>
                            <p className="text-sm">Category: {product.category}</p>
                            <p className="text-sm">Price: {product.price}</p>
                            <div className="text-sm flex items-center gap-2">
                                <p>Warehouse Quantity: {product.warehouseQuantity}</p>
                                {product.warehouseQuantity === 0 && (
                                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                                        Out of stock
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 flex gap-3">
                                <button
                                    onClick={() => toast.promise(reviewProduct(product.id, 'APPROVED'), { loading: 'Approving product...' })}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => toast.promise(reviewProduct(product.id, 'REJECTED'), { loading: 'Rejecting product...' })}
                                    className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 text-sm"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex items-center justify-center h-80">
                    <h1 className="text-3xl text-slate-400 font-medium">No Pending Products</h1>
                </div>
            )}
        </div>
    )
}
