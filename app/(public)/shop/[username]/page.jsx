'use client'
import ProductCard from "@/components/ProductCard"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { MailIcon, MapPinIcon, MessageCircleIcon } from "lucide-react"
import Loading from "@/components/Loading"
import Image from "next/image"
import axios from "axios"
import toast from "react-hot-toast"
import { useAuth, useUser, useClerk } from "@clerk/nextjs"

export default function StoreShop() {
    const { username } = useParams()
    const router = useRouter()
    const { getToken } = useAuth()
    const { user } = useUser()
    const { openSignIn } = useClerk()

    const [products, setProducts] = useState([])
    const [storeInfo, setStoreInfo] = useState(null)
    const [loading, setLoading] = useState(true)
    const [startingChat, setStartingChat] = useState(false)

    const fetchStoreData = async () => {
        try {
            const { data } = await axios.get(`/api/store/data?username=${username}`)
            setStoreInfo(data.store)
            setProducts(data.store?.Product ?? [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
        setLoading(false)
    }

    const contactStore = async () => {
        if (!user) {
            openSignIn()
            return
        }
        setStartingChat(true)
        try {
            const token = await getToken()
            const { data } = await axios.post(
                '/api/chat/conversations',
                { targetType: 'STORE', storeId: storeInfo.id },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            router.push(`/chat/${data.conversation.id}`)
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setStartingChat(false)
        }
    }

    useEffect(() => {
        fetchStoreData()
    }, [])

    return !loading ? (
        <div className="min-h-[70vh] mx-6">

            {/* Store Info Banner */}
            {storeInfo && (
                <div className="max-w-7xl mx-auto bg-slate-50 rounded-xl p-6 md:p-10 mt-6 flex flex-col md:flex-row items-center gap-6 shadow-xs">
                    <Image
                        src={storeInfo.logo}
                        alt={storeInfo.name}
                        className="size-32 sm:size-38 object-cover border-2 border-slate-100 rounded-md"
                        width={200}
                        height={200}
                    />
                    <div className="text-center md:text-left flex-1">
                        <h1 className="text-3xl font-semibold text-slate-800">{storeInfo.name}</h1>
                        <p className="text-sm text-slate-600 mt-2 max-w-lg">{storeInfo.description}</p>
                        <div className="space-y-2 text-sm text-slate-500 mt-4">
                            <div className="flex items-center gap-2 justify-center md:justify-start">
                                <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                <span>{storeInfo.address}</span>
                            </div>
                            <div className="flex items-center gap-2 justify-center md:justify-start">
                                <MailIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                <span>{storeInfo.email}</span>
                            </div>
                        </div>
                        <button
                            onClick={contactStore}
                            disabled={startingChat}
                            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-full transition disabled:opacity-60"
                        >
                            <MessageCircleIcon size={15} />
                            {startingChat ? 'Opening chat…' : 'Contact Store'}
                        </button>
                    </div>
                </div>
            )}

            {/* Products */}
            <div className="max-w-7xl mx-auto mb-40">
                <h1 className="text-2xl mt-12">Shop <span className="text-slate-800 font-medium">Products</span></h1>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {products.map((product) => <ProductCard key={product.id} product={product} />)}
                </div>
            </div>
        </div>
    ) : <Loading />
}
