'use client'

import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { BikeIcon } from "lucide-react"

export default function AdminRidersPage() {
    const { user } = useUser()
    const { getToken } = useAuth()

    const [loading, setLoading] = useState(true)
    const [riders, setRiders] = useState([])
    const [emailInput, setEmailInput] = useState('')
    const [inviting, setInviting] = useState(false)
    const [savingId, setSavingId] = useState(null)

    const authHeaders = async () => ({ Authorization: `Bearer ${await getToken()}` })

    const fetchRiders = async () => {
        try {
            const { data } = await axios.get('/api/admin/riders', { headers: await authHeaders() })
            setRiders(data.riders || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (user) fetchRiders() }, [user])

    const inviteRider = async (event) => {
        event.preventDefault()
        setInviting(true)
        try {
            const { data } = await axios.post('/api/admin/users',
                { email: emailInput, role: 'RIDER' },
                { headers: await authHeaders() })
            toast.success(data.message)
            setEmailInput('')
            await fetchRiders()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setInviting(false)
        }
    }

    const updateLocal = (id, patch) =>
        setRiders(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

    const saveRider = async (rider) => {
        setSavingId(rider.id)
        try {
            await axios.patch('/api/admin/riders', {
                userId: rider.id,
                phone: rider.phone,
                vehicleType: rider.vehicleType,
                isActive: rider.isActive,
            }, { headers: await authHeaders() })
            toast.success(`${rider.name || 'Rider'} saved`)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setSavingId(null)
        }
    }

    const toggleActive = async (rider) => {
        const next = !rider.isActive
        updateLocal(rider.id, { isActive: next })
        try {
            await axios.patch('/api/admin/riders',
                { userId: rider.id, isActive: next },
                { headers: await authHeaders() })
        } catch (error) {
            updateLocal(rider.id, { isActive: rider.isActive })
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl flex items-center gap-2"><BikeIcon size={22} /> Manage <span className="text-slate-800 font-medium">Riders</span></h1>
            <p className="text-sm text-slate-400 mt-1">Onboard company delivery riders and manage their dispatch profile. Riders sign in to the <span className="font-medium">/rider</span> console.</p>

            {/* Invite */}
            <form onSubmit={inviteRider} className="mt-6 flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4 max-w-2xl">
                <label className="flex-1 min-w-64">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Rider email</span>
                    <input type="email" required value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="rider@example.com" className={inp} />
                </label>
                <button type="submit" disabled={inviting} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50">
                    {inviting ? 'Inviting…' : 'Invite rider'}
                </button>
            </form>

            {/* Roster */}
            <div className="mt-6 space-y-3 max-w-3xl">
                {loading ? (
                    <p className="text-center text-slate-400 py-8">Loading riders…</p>
                ) : riders.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-white border border-slate-200 rounded-xl">
                        <BikeIcon size={32} className="mx-auto mb-2 text-slate-300" />
                        <p>No riders yet. Invite your first rider above.</p>
                    </div>
                ) : riders.map(rider => (
                    <div key={rider.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-medium text-slate-800">{rider.name || '—'}</p>
                                <p className="text-xs text-slate-400">{rider.email}</p>
                            </div>
                            <button
                                onClick={() => toggleActive(rider)}
                                className={`text-xs font-semibold rounded-full px-3 py-1 transition ${rider.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                                {rider.isActive ? 'Active' : 'Inactive'}
                            </button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <label className="sm:col-span-1">
                                <span className="block text-xs font-medium text-slate-500 mb-1">Phone</span>
                                <input value={rider.phone} onChange={e => updateLocal(rider.id, { phone: e.target.value })} placeholder="07xxxxxxxx" className={inp} />
                            </label>
                            <label className="sm:col-span-1">
                                <span className="block text-xs font-medium text-slate-500 mb-1">Vehicle</span>
                                <input value={rider.vehicleType} onChange={e => updateLocal(rider.id, { vehicleType: e.target.value })} placeholder="Motorcycle, Bicycle…" className={inp} />
                            </label>
                            <div className="sm:col-span-1 flex items-end">
                                <button onClick={() => saveRider(rider)} disabled={savingId === rider.id} className="w-full px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                    {savingId === rider.id ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
