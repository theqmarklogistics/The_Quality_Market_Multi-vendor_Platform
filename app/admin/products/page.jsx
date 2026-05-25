'use client'
import { useAuth } from "@clerk/nextjs"
import { useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import Image from "next/image"
import { PackageCheckIcon } from "lucide-react"

export default function AdminProducts() {
    const { getToken } = useAuth()

    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [rejectNotes, setRejectNotes] = useState({})
    const [rejectingId, setRejectingId] = useState(null)

    const fetchPendingProducts = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/products', {
                headers: { Authorization: `Bearer ${token}` }
            })
            setProducts(data.products || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const reviewProduct = async (productId, status, notes) => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/products', { productId, status, notes }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setRejectingId(null)
            setRejectNotes(prev => { const n = { ...prev }; delete n[productId]; return n })
            setProducts(prev => prev.filter(p => p.id !== productId))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const submitRejection = (productId) => {
        const notes = rejectNotes[productId]?.trim() || ''
        return reviewProduct(productId, 'REJECTED', notes)
    }

    useEffect(() => { fetchPendingProducts() }, [])

    if (loading) return <p className="text-slate-500">Loading pending products...</p>

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Approve <span className="text-slate-800 font-medium">Products</span></h1>

            {products.length > 0 ? (
                <div className="flex flex-col gap-4 mt-4 max-w-5xl">
                    {products.map((product) => (
                        <div key={product.id} className="bg-white border rounded-lg shadow-sm p-4">
                            <div className="flex gap-4">
                                {product.images?.[0] && (
                                    <Image
                                        src={product.images[0]}
                                        alt={product.name}
                                        width={120}
                                        height={120}
                                        className="h-24 w-24 rounded-md object-cover border border-slate-200 shrink-0"
                                    />
                                )}
                                <div className="flex-1">
                                    <p className="text-slate-800 font-medium text-lg">{product.name}</p>
                                    <p className="text-sm text-slate-500">Store: {product.store?.name}</p>
                                    <p className="text-sm">Category: {product.category}</p>
                                    <p className="text-sm">Price: {product.price?.toLocaleString()}</p>
                                    <div className="text-sm flex items-center gap-2">
                                        Qty: {product.warehouseQuantity}
                                        {product.warehouseQuantity === 0 && (
                                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">Out of stock</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3">
                                {rejectingId === product.id ? (
                                    <div className="space-y-2 max-w-lg">
                                        <textarea
                                            rows={3}
                                            autoFocus
                                            placeholder="Reason for rejection (shown to seller)…"
                                            value={rejectNotes[product.id] || ''}
                                            onChange={e => setRejectNotes(prev => ({ ...prev, [product.id]: e.target.value }))}
                                            className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm outline-none focus:border-red-300 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => toast.promise(submitRejection(product.id), { loading: 'Rejecting…', success: 'Product rejected', error: e => e.message })}
                                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition"
                                            >
                                                Confirm Reject
                                            </button>
                                            <button
                                                onClick={() => setRejectingId(null)}
                                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => toast.promise(reviewProduct(product.id, 'APPROVED'), { loading: 'Approving…', success: 'Product approved', error: e => e.message })}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => setRejectingId(product.id)}
                                            className="px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm font-medium transition"
                                        >
                                            Reject…
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-80">
                    <PackageCheckIcon size={40} className="text-slate-300 mb-3" />
                    <p className="text-2xl text-slate-400 font-medium">No Pending Products</p>
                </div>
            )}
        </div>
    )
}
