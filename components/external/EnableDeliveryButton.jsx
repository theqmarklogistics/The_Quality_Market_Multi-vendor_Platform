'use client'
import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { TruckIcon, Loader2Icon } from 'lucide-react'

// Self-serve "turn on delivery" action. Grants the EXTERNAL_SELLER role via the
// enable endpoint, then hard-navigates to the portal so the server re-renders
// the dashboard and the navbar re-reads the new role.
export default function EnableDeliveryButton({ redirectTo = '/external', label = 'Enable delivery' }) {
    const { getToken } = useAuth()
    const [loading, setLoading] = useState(false)

    const enable = async () => {
        setLoading(true)
        try {
            const { data } = await axios.post(
                '/api/delivery/external/enable',
                {},
                { headers: { Authorization: `Bearer ${await getToken()}` } }
            )
            toast.success(data?.alreadyEnabled ? 'Delivery is already enabled' : 'Delivery enabled — book your first one')
            // Full reload so the role gate and navbar pick up the new role.
            window.location.assign(redirectTo)
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
            setLoading(false)
        }
    }

    return (
        <button
            onClick={enable}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-green-600 text-white text-sm py-3 px-7 rounded-full hover:bg-green-700 hover:-translate-y-0.5 active:scale-95 transition shadow-lg shadow-green-600/20 disabled:opacity-60 disabled:translate-y-0 disabled:scale-100"
        >
            {loading ? <Loader2Icon size={16} className="animate-spin" /> : <TruckIcon size={16} />} {label}
        </button>
    )
}
