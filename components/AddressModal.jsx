'use client'
import { XIcon, MapPinIcon, CheckCircleIcon, LoaderIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { useAuth } from "@clerk/nextjs"
import { useDispatch } from "react-redux"
import axios from "axios"
import { addAddress } from "@/lib/features/address/addressSlice"
import { KIGALI_SECTORS } from "@/lib/constants"


const AddressModal = ({ setShowAddressModal }) => {

    const {getToken} = useAuth();
    const dispatch = useDispatch();

    const [address, setAddress] = useState({
        name: '',
        email: '',
        street: '',
        sector: '',
        city: '',
        state: '',
        zip: '',
        country: '',
        phone: '',
        latitude: null,
        longitude: null,
    })
    const [locating, setLocating] = useState(false);

    const handleAddressChange = (e) => {
        setAddress({
            ...address,
            [e.target.name]: e.target.value
        })
    }

    // Capture the customer's exact coordinates. These are required so we can
    // measure the distance from our hub to the delivery point and route riders.
    const captureLocation = () => {
        if (!('geolocation' in navigator)) {
            toast.error('Location is not supported on this device.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setAddress((prev) => ({
                    ...prev,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                }));
                setLocating(false);
                toast.success('Location pinned');
            },
            () => {
                setLocating(false);
                toast.error('Could not access your location. Please allow location access to continue.');
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    };

    const hasLocation = address.latitude != null && address.longitude != null;

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!hasLocation) {
            toast.error('Please pin your location before saving.');
            return;
        }

        try {
            const token = await getToken();
            if (!token) {
                toast.error('Please sign in before saving an address');
                return;
            }

            const {data} = await axios.post('/api/address', {address}, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            dispatch(addAddress(data.newAddress));
            toast.success(data.message);
            setShowAddressModal(false);
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.error || error.message);
        }
    }

    return (
        <form onSubmit={e => toast.promise(handleSubmit(e), { loading: 'Adding Address...' })} className="fixed inset-0 z-50 bg-white/60 backdrop-blur h-screen flex items-center justify-center">
            <div className="flex flex-col gap-5 text-slate-700 w-full max-w-sm mx-6">
                <h2 className="text-3xl ">Add New <span className="font-semibold">Address</span></h2>
                <input name="name" onChange={handleAddressChange} value={address.name} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Enter your name" required />
                <input name="email" onChange={handleAddressChange} value={address.email} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="email" placeholder="Email address" required />
                <input name="street" onChange={handleAddressChange} value={address.street} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Street" required />
                <select name="sector" onChange={handleAddressChange} value={address.sector} className="p-2 px-4 outline-none border border-slate-200 rounded w-full text-slate-700">
                    <option value="">Sector (Kigali) — optional</option>
                    {KIGALI_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex gap-4">
                    <input name="city" onChange={handleAddressChange} value={address.city} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="District" required />
                    <input name="state" onChange={handleAddressChange} value={address.state} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Province" required />
                </div>
                <div className="flex gap-4">
                    <input name="zip" onChange={handleAddressChange} value={address.zip} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Zip code (optional)" />
                    <input name="country" onChange={handleAddressChange} value={address.country} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Country" required />
                </div>
                <input name="phone" onChange={handleAddressChange} value={address.phone} className="p-2 px-4 outline-none border border-slate-200 rounded w-full" type="text" placeholder="Phone" required />

                {/* Geolocation — mandatory: powers hub-distance and rider routing */}
                <div className="flex flex-col gap-1.5">
                    <button
                        type="button"
                        onClick={captureLocation}
                        disabled={locating}
                        className={`flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-md border transition-all active:scale-95 disabled:opacity-60 ${
                            hasLocation
                                ? 'border-green-300 bg-green-50 text-green-700'
                                : 'border-slate-300 text-slate-700 hover:border-green-400'
                        }`}
                    >
                        {locating
                            ? <><LoaderIcon size={16} className="animate-spin" /> Getting your location…</>
                            : hasLocation
                                ? <><CheckCircleIcon size={16} /> Location pinned — tap to update</>
                                : <><MapPinIcon size={16} /> Pin my exact location</>}
                    </button>
                    {hasLocation
                        ? <p className="text-[11px] text-slate-400">{address.latitude.toFixed(5)}, {address.longitude.toFixed(5)}</p>
                        : <p className="text-[11px] text-slate-400">Required — lets us measure delivery distance and route your rider.</p>}
                </div>

                <button disabled={!hasLocation} className="bg-slate-800 text-white text-sm font-medium py-2.5 rounded-md hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">SAVE ADDRESS</button>
            </div>
            <XIcon size={30} className="absolute top-5 right-5 text-slate-500 hover:text-slate-700 cursor-pointer" onClick={() => setShowAddressModal(false)} />
        </form>
    )
}

export default AddressModal