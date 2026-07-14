'use client'
import { XIcon, MapPinIcon, CheckCircleIcon, LoaderIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"
import { useAuth } from "@clerk/nextjs"
import { useDispatch } from "react-redux"
import axios from "axios"
import { addAddress } from "@/lib/features/address/addressSlice"
import RwLocationSelect from "@/components/delivery/RwLocationSelect"


const AddressModal = ({ setShowAddressModal }) => {

    const {getToken} = useAuth();
    const dispatch = useDispatch();

    const [address, setAddress] = useState({
        name: '',
        email: '',
        phone: '',
        street: '',
        latitude: null,
        longitude: null,
    })
    // Official administrative location: province → district → sector → cell → village.
    const [location, setLocation] = useState({ province: '', district: '', sector: '', cell: '', village: '' });
    const [locating, setLocating] = useState(false);

    const handleAddressChange = (e) => {
        setAddress({
            ...address,
            [e.target.name]: e.target.value
        })
    }

    // Capture the customer's exact coordinates — used to measure the distance
    // from our hub to the delivery point and to route riders.
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
    const hasCellLevel = location.district && location.sector && location.cell;
    // Location is mandatory: an exact GPS pin, or the address down to the cell.
    const canSave = hasLocation || hasCellLevel;

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!canSave) {
            toast.error('Pin your location, or select your district, sector and cell so we can locate you.');
            return;
        }

        try {
            const token = await getToken();
            if (!token) {
                toast.error('Please sign in before saving an address');
                return;
            }

            const payload = {
                ...address,
                state: location.province || 'Kigali',
                city: location.district || '-',
                district: location.district,
                sector: location.sector,
                cell: location.cell,
                village: location.village,
                zip: '-',
                country: 'Rwanda',
            };
            const {data} = await axios.post('/api/address', {address: payload}, {
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

    const input = "p-2 px-4 outline-none border border-slate-200 rounded w-full";

    return (
        <form onSubmit={e => toast.promise(handleSubmit(e), { loading: 'Adding Address...' })} className="fixed inset-0 z-50 bg-white/60 backdrop-blur h-screen overflow-y-auto flex items-start sm:items-center justify-center py-10">
            <div className="flex flex-col gap-4 text-slate-700 w-full max-w-sm mx-6">
                <h2 className="text-3xl ">Add New <span className="font-semibold">Address</span></h2>
                <input name="name" onChange={handleAddressChange} value={address.name} className={input} type="text" placeholder="Full name" required />
                <input name="email" onChange={handleAddressChange} value={address.email} className={input} type="email" placeholder="Email" required />
                <input name="phone" onChange={handleAddressChange} value={address.phone} className={input} type="text" placeholder="Phone" required />
                <input name="street" onChange={handleAddressChange} value={address.street} className={input} type="text" placeholder="Street / house / landmark" required />

                <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-slate-500">Where should we deliver? Select down to the cell — or just pin your exact location below.</p>
                    <RwLocationSelect value={location} onChange={setLocation} inputClass={input} />
                </div>

                {/* Exact GPS pin — replaces the dropdowns when shared */}
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
                        : <p className="text-[11px] text-slate-400">Best option — lets us measure the delivery distance exactly.</p>}
                </div>

                <button disabled={!canSave} className="bg-slate-800 text-white text-sm font-medium py-2.5 rounded-md hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">SAVE ADDRESS</button>
            </div>
            <XIcon size={30} className="absolute top-5 right-5 text-slate-500 hover:text-slate-700 cursor-pointer" onClick={() => setShowAddressModal(false)} />
        </form>
    )
}

export default AddressModal
