'use client'
import { assets } from "@/assets/assets"
import { useEffect, useState } from "react"
import Image from "next/image"
import toast from "react-hot-toast"
import Loading from "@/components/Loading"
import { useAuth, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import axios from "axios"

const SELLER_CONTRACT = `SELLER AGREEMENT — THE QUALITY MARKET

By submitting this application you agree to the following terms:

1. PLATFORM RULES: You must list only genuine, accurately described products. Misleading listings, counterfeit goods, or false advertising will result in immediate removal and account suspension.

2. PROHIBITED ITEMS: You may not sell counterfeit goods, weapons, hazardous materials, adult content, or any item prohibited by Rwandan law or The Quality Market's policies.

3. COMMISSIONS & FEES: The Quality Market charges a platform fee on every completed sale. Exact rates are communicated during onboarding and may be updated with 30 days' notice to registered sellers.

4. LOCAL SELLER — SHIPPING: As a Local Seller, you are solely responsible for packaging, shipping, and timely delivery directly to customers. Failure to fulfill orders within the stated timeframe may result in order cancellation and negative seller ratings.

5. FULL MANAGED — INVENTORY: As a Full Managed seller, you agree to ship inventory to The Quality Market warehouse in good condition and in agreed quantities. The Quality Market handles storage, picking, packing, and last-mile delivery on your behalf. You remain responsible for product quality and compliance.

6. PRODUCT QUALITY: All products must meet The Quality Market quality standards. Items found to be defective, mislabeled, or dangerous may be removed without prior notice. You bear liability for any consumer harm caused by your products.

7. RETURNS & REFUNDS: You agree to honour The Quality Market's returns and refunds policy. The cost of returns arising from seller error (wrong item, damaged goods, false description) is borne by the seller.

8. ACCOUNT TERMINATION: The Quality Market reserves the right to suspend or permanently terminate any store that violates these terms. In cases of fraud, safety risk, or serious policy breach, termination may occur without prior notice and without refund of outstanding balances.

9. DATA & PRIVACY: You agree that The Quality Market may process your business information to operate the platform and comply with applicable laws. Seller data will not be sold to third parties.

10. GOVERNING LAW: This agreement is governed by the laws of the Republic of Rwanda. Any disputes arising under this agreement shall be subject to the exclusive jurisdiction of the courts of Kigali, Rwanda.

By checking the box below, you confirm that you have read, fully understood, and agree to be bound by this Seller Agreement.`

export default function CreateStore() {

    const {user} = useUser()
    const router = useRouter()
    const {getToken} = useAuth()

    const [alreadySubmitted, setAlreadySubmitted] = useState(false)
    const [status, setStatus] = useState("")
    const [loading, setLoading] = useState(true)
    const [message, setMessage] = useState("")
    const [agreed, setAgreed] = useState(false)

    const [sellerModel, setSellerModel] = useState('FULL_MANAGED')

    const [storeInfo, setStoreInfo] = useState({
        name: "",
        username: "",
        description: "",
        email: "",
        contact: "",
        address: "",
        image: "",
        tinNumber: "",
        idPhoto: "",
        rdbCertificate: ""
    })

    const onChangeHandler = (e) => {
        setStoreInfo({ ...storeInfo, [e.target.name]: e.target.value })
    }

    const fetchSellerStatus = async () => {
        // Logic to check if the store is already submitted
        const token = await getToken()
        try {
            const {data} = await axios.get('/api/store/create', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if(['approved', 'rejected', 'pending'].includes(data.status)){
                setStatus(data.status)
                setAlreadySubmitted(true)
                switch (data.status) {
                    case "approved":
                        setMessage("Your store has been approved, you can now add products to your store from the dashboard")
                        setTimeout(() => router.push('/store'), 5000)
                        break;
                    case "rejected":
                        setMessage("Your store has been rejected, please contact support")
                        break;
                    case "pending":
                        setMessage("Your store is pending, please wait for approval")
                        break;
                
                    default:
                        break;
                } 
                    
            } else {
                setAlreadySubmitted(false)
        }

        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }


        setLoading(false)
    }

    const onSubmitHandler = async (e) => {
        e.preventDefault()
        // Logic to submit the store details
        if(!user){
            return toast('Please login to continue')
        }

        if (!storeInfo.image || !storeInfo.idPhoto) {
            return toast.error('Store logo and ID photo are required')
        }

        try {
            const token = await getToken()
            const formData = new FormData()
            formData.append('name', storeInfo.name)
            formData.append('username', storeInfo.username)
            formData.append('description', storeInfo.description)
            formData.append('email', storeInfo.email)
            formData.append('contact', storeInfo.contact)
            formData.append('address', storeInfo.address)
            formData.append('image', storeInfo.image)
            formData.append('tinNumber', storeInfo.tinNumber)
            formData.append('sellerModel', sellerModel)
            formData.append('idPhoto', storeInfo.idPhoto)
            if (storeInfo.rdbCertificate) {
                formData.append('rdbCertificate', storeInfo.rdbCertificate)
            }

            const { data } = await axios.post('/api/store/create', formData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            toast.success(data.message)
            await fetchSellerStatus()


        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }

    }

    useEffect(() => {

        if(user){
            fetchSellerStatus()
        }
        
    }, [user])

    if (!user) {
        return (
            <div className="min-h-[80vh] mx-6 flex items-center justify-center">
                <h1 className="text-2xl sm:text-4xl font-semibold">Please <span className="text-slate-500">login</span> to continue</h1>
            </div>
        )
    }

    return !loading ? (
        <>
            {!alreadySubmitted ? (
                <div className="mx-6 min-h-[70vh] my-16">
                    <form onSubmit={e => toast.promise(onSubmitHandler(e), { loading: "Submitting data..." })} className="max-w-7xl mx-auto flex flex-col items-start gap-3 text-slate-500">
                        {/* Title */}
                        <div>
                            <h1 className="text-3xl ">Add Your <span className="text-slate-800 font-medium">Store</span></h1>
                            <p className="max-w-lg">To become a seller on The Quality Market, submit your store details for review. Your store will be activated after admin verification.</p>
                        </div>

                        {/* Seller Model Selection */}
                        <div className="w-full max-w-lg mt-8">
                            <p className="font-medium text-slate-700 mb-3">How will you sell on The Quality Market?</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSellerModel('FULL_MANAGED')}
                                    className={`text-left p-4 rounded-xl border-2 transition ${sellerModel === 'FULL_MANAGED' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <p className={`font-semibold text-sm mb-1 ${sellerModel === 'FULL_MANAGED' ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {sellerModel === 'FULL_MANAGED' && <span className="inline-block w-2 h-2 rounded-full bg-slate-800 mr-2 align-middle" />}
                                        Full Managed
                                    </p>
                                    <p className="text-xs text-slate-500 leading-relaxed">For manufacturers &amp; wholesalers. Ship inventory to our warehouse — we handle storage, picking, packing, and delivery.</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSellerModel('LOCAL_SELLER')}
                                    className={`text-left p-4 rounded-xl border-2 transition ${sellerModel === 'LOCAL_SELLER' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                                >
                                    <p className={`font-semibold text-sm mb-1 ${sellerModel === 'LOCAL_SELLER' ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {sellerModel === 'LOCAL_SELLER' && <span className="inline-block w-2 h-2 rounded-full bg-slate-800 mr-2 align-middle" />}
                                        Local Seller
                                    </p>
                                    <p className="text-xs text-slate-500 leading-relaxed">Semi-managed. You list products, set your own prices, and ship from your own warehouse directly to customers.</p>
                                </button>
                            </div>
                        </div>

                        <label className="mt-6 cursor-pointer">
                            Store Logo
                            <Image src={storeInfo.image ? URL.createObjectURL(storeInfo.image) : assets.upload_area} className="rounded-lg mt-2 h-16 w-auto" alt="" width={150} height={100} />
                            <input type="file" accept="image/*" onChange={(e) => setStoreInfo({ ...storeInfo, image: e.target.files[0] })} hidden required />
                        </label>

                        <p>Username</p>
                        <input name="username" onChange={onChangeHandler} value={storeInfo.username} type="text" placeholder="Enter your store username" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" />

                        <p>Name</p>
                        <input name="name" onChange={onChangeHandler} value={storeInfo.name} type="text" placeholder="Enter your store name" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" />

                        <p>Description</p>
                        <textarea name="description" onChange={onChangeHandler} value={storeInfo.description} rows={5} placeholder="Enter your store description" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded resize-none" />

                        <p>Email</p>
                        <input name="email" onChange={onChangeHandler} value={storeInfo.email} type="email" placeholder="Enter your store email" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" />

                        <p>Contact Number</p>
                        <input name="contact" onChange={onChangeHandler} value={storeInfo.contact} type="text" placeholder="Enter your store contact number" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" />

                        <p>Address</p>
                        <textarea name="address" onChange={onChangeHandler} value={storeInfo.address} rows={5} placeholder="Enter your store address" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded resize-none" />

                        <p>TIN (Taxpayer Identification Number)</p>
                        <input name="tinNumber" onChange={onChangeHandler} value={storeInfo.tinNumber} type="text" placeholder="Enter your TIN" className="border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" required />

                        <label className="cursor-pointer">
                            ID Photo (required)
                            <input type="file" accept="image/*,.pdf" onChange={(e) => setStoreInfo({ ...storeInfo, idPhoto: e.target.files[0] })} className="mt-2 border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" required />
                        </label>

                        <label className="cursor-pointer">
                            RDB Business Registration Certificate (optional)
                            <input type="file" accept="image/*,.pdf" onChange={(e) => setStoreInfo({ ...storeInfo, rdbCertificate: e.target.files[0] })} className="mt-2 border border-slate-300 outline-slate-400 w-full max-w-lg p-2 rounded" />
                        </label>

                        {/* Seller Agreement */}
                        <div className="w-full max-w-lg mt-8">
                            <p className="font-medium text-slate-700 mb-2">Seller Agreement</p>
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                                {SELLER_CONTRACT}
                            </div>
                            <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-slate-700 select-none">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={e => setAgreed(e.target.checked)}
                                    className="w-4 h-4 accent-slate-800"
                                />
                                I have read and agree to the Seller Agreement above
                            </label>
                        </div>

                        <button disabled={!agreed} className="bg-slate-800 text-white px-12 py-2 rounded mt-8 mb-40 active:scale-95 hover:bg-slate-900 transition disabled:opacity-40 disabled:cursor-not-allowed">Submit</button>
                    </form>
                </div>
            ) : (
                <div className="min-h-[80vh] flex flex-col items-center justify-center">
                    <p className="sm:text-2xl lg:text-3xl mx-5 font-semibold text-slate-500 text-center max-w-2xl">{message}</p>
                    {status === "approved" && <p className="mt-5 text-slate-400">redirecting to dashboard in <span className="font-semibold">5 seconds</span></p>}
                </div>
            )}
        </>
    ) : (<Loading />)
}