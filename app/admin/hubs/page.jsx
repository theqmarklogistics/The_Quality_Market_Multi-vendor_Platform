'use client'
// Hubs & Corridors: admin registers physical hubs, the corridors served from each
// hub, and the recurring rider departure schedule. Active schedules are published
// on the public delivery-schedule page.
import { useAuth } from "@clerk/nextjs"
import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { WarehouseIcon, PlusIcon, Trash2Icon, RouteIcon, CalendarClockIcon, PowerIcon } from "lucide-react"
import { KIGALI_SECTORS } from "@/lib/constants"

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AdminHubs() {
    const { getToken } = useAuth()

    const [hubs, setHubs] = useState([])
    const [riders, setRiders] = useState([])
    const [loading, setLoading] = useState(true)

    // New hub form
    const [hubForm, setHubForm] = useState({ name: '', sector: '', landmark: '' })
    // New corridor form (keyed open per hub)
    const [corridorHub, setCorridorHub] = useState(null)
    const [corridorForm, setCorridorForm] = useState({ name: '', areas: '', description: '' })
    // New schedule form (keyed open per corridor)
    const [scheduleCorridor, setScheduleCorridor] = useState(null)
    const [scheduleForm, setScheduleForm] = useState({ dayOfWeek: '1', departTime: '09:00', riderId: '' })

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken])

    const load = useCallback(async () => {
        try {
            const headers = await authHeaders()
            const [{ data: hubData }, { data: riderData }] = await Promise.all([
                axios.get('/api/admin/hubs', { headers }),
                axios.get('/api/admin/riders', { headers }).catch(() => ({ data: { riders: [] } })),
            ])
            setHubs(hubData.hubs || [])
            setRiders(riderData.riders || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }, [authHeaders])

    useEffect(() => { load() }, [load])

    const createHub = async (e) => {
        e.preventDefault()
        if (!hubForm.name.trim()) return toast.error('Hub name is required')
        try {
            await axios.post('/api/admin/hubs', hubForm, { headers: await authHeaders() })
            toast.success('Hub created')
            setHubForm({ name: '', sector: '', landmark: '' })
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const toggleHub = async (hub) => {
        try {
            await axios.patch(`/api/admin/hubs/${hub.id}`, { isActive: !hub.isActive }, { headers: await authHeaders() })
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const deleteHub = async (hub) => {
        if (!confirm(`Delete hub "${hub.name}" and all its corridors/schedules?`)) return
        try {
            await axios.delete(`/api/admin/hubs/${hub.id}`, { headers: await authHeaders() })
            toast.success('Hub deleted')
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const createCorridor = async (e, hubId) => {
        e.preventDefault()
        if (!corridorForm.name.trim()) return toast.error('Corridor name is required')
        try {
            await axios.post('/api/admin/corridor-routes', { ...corridorForm, hubId }, { headers: await authHeaders() })
            toast.success('Corridor registered')
            setCorridorForm({ name: '', areas: '', description: '' })
            setCorridorHub(null)
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const toggleCorridor = async (corridor) => {
        try {
            await axios.patch(`/api/admin/corridor-routes/${corridor.id}`, { isActive: !corridor.isActive }, { headers: await authHeaders() })
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const deleteCorridor = async (corridor) => {
        if (!confirm(`Delete corridor "${corridor.name}" and its schedules?`)) return
        try {
            await axios.delete(`/api/admin/corridor-routes/${corridor.id}`, { headers: await authHeaders() })
            toast.success('Corridor deleted')
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const createSchedule = async (e, corridorRouteId) => {
        e.preventDefault()
        try {
            await axios.post('/api/admin/corridor-schedules', {
                corridorRouteId,
                dayOfWeek: scheduleForm.dayOfWeek,
                departTime: scheduleForm.departTime,
                riderId: scheduleForm.riderId || null,
            }, { headers: await authHeaders() })
            toast.success('Schedule added — it is now public')
            setScheduleCorridor(null)
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const deleteSchedule = async (id) => {
        try {
            await axios.delete(`/api/admin/corridor-schedules/${id}`, { headers: await authHeaders() })
            load()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="text-slate-500 mb-28 max-w-4xl">
            <h1 className="text-2xl mb-1">Hubs &amp; <span className="text-slate-800 font-medium">Corridors</span></h1>
            <p className="text-sm text-slate-400 mb-6">Register hubs, the corridors served from each hub, and the rider departure schedule shown to the public.</p>

            {/* New hub */}
            <form onSubmit={createHub} className="bg-white border rounded-xl shadow-sm p-4 mb-6">
                <p className="font-medium text-slate-700 mb-3 flex items-center gap-2"><WarehouseIcon size={16} className="text-green-600" /> Add a new hub</p>
                <div className="grid gap-3 sm:grid-cols-3">
                    <input value={hubForm.name} onChange={e => setHubForm(f => ({ ...f, name: e.target.value }))} placeholder="Hub name (e.g. CHIC Hub)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" required />
                    <select value={hubForm.sector} onChange={e => setHubForm(f => ({ ...f, sector: e.target.value }))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500 text-slate-600">
                        <option value="">Sector (optional)</option>
                        {KIGALI_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input value={hubForm.landmark} onChange={e => setHubForm(f => ({ ...f, landmark: e.target.value }))} placeholder="Landmark / address" className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
                </div>
                <button className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium transition">
                    <PlusIcon size={15} /> Add Hub
                </button>
            </form>

            {/* Hubs */}
            {hubs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
                    <WarehouseIcon size={40} className="text-slate-300 mb-3" />
                    <p className="font-medium text-slate-500">No hubs yet</p>
                    <p className="text-sm text-slate-400 mt-1">Add your first hub above, then register its corridors.</p>
                </div>
            ) : hubs.map(hub => (
                <div key={hub.id} className={`bg-white border rounded-xl shadow-sm p-4 mb-4 ${!hub.isActive ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p className="font-semibold text-slate-800 flex items-center gap-2">
                                <WarehouseIcon size={16} className="text-green-600" /> {hub.name}
                                {!hub.isActive && <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">Inactive</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{[hub.sector, hub.landmark].filter(Boolean).join(' · ') || 'No location details'}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => toggleHub(hub)} title={hub.isActive ? 'Deactivate' : 'Activate'} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-600">
                                <PowerIcon size={14} />
                            </button>
                            <button onClick={() => deleteHub(hub)} title="Delete hub" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600">
                                <Trash2Icon size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Corridors of this hub */}
                    <div className="mt-3 space-y-3">
                        {hub.corridorRoutes.map(corridor => (
                            <div key={corridor.id} className={`rounded-lg border border-slate-100 bg-slate-50/60 p-3 ${!corridor.isActive ? 'opacity-60' : ''}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                            <RouteIcon size={14} className="text-green-600" /> {corridor.name}
                                            {!corridor.isActive && <span className="text-[10px] font-semibold uppercase bg-slate-200 text-slate-500 rounded-full px-2 py-0.5">Inactive</span>}
                                        </p>
                                        {corridor.areas?.length > 0 && <p className="text-xs text-slate-400 mt-0.5">Areas: {corridor.areas.join(', ')}</p>}
                                        {corridor.description && <p className="text-xs text-slate-400">{corridor.description}</p>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => toggleCorridor(corridor)} title={corridor.isActive ? 'Deactivate' : 'Activate'} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-600">
                                            <PowerIcon size={13} />
                                        </button>
                                        <button onClick={() => deleteCorridor(corridor)} title="Delete corridor" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600">
                                            <Trash2Icon size={13} />
                                        </button>
                                    </div>
                                </div>

                                {/* Schedules */}
                                <div className="mt-2 space-y-1.5">
                                    {corridor.schedules.map(s => (
                                        <div key={s.id} className={`flex items-center justify-between rounded-md bg-white border border-slate-100 px-3 py-1.5 text-xs ${!s.isActive ? 'opacity-60' : ''}`}>
                                            <span className="flex items-center gap-1.5 text-slate-600">
                                                <CalendarClockIcon size={12} className="text-green-600" />
                                                {DAYS[s.dayOfWeek]} · {s.departTime}
                                                {s.rider?.name && <span className="text-slate-400">· {s.rider.name}</span>}
                                            </span>
                                            <button onClick={() => deleteSchedule(s.id)} className="text-slate-400 hover:text-red-600"><Trash2Icon size={12} /></button>
                                        </div>
                                    ))}

                                    {scheduleCorridor === corridor.id ? (
                                        <form onSubmit={e => createSchedule(e, corridor.id)} className="flex flex-wrap items-center gap-2 pt-1">
                                            <select value={scheduleForm.dayOfWeek} onChange={e => setScheduleForm(f => ({ ...f, dayOfWeek: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none">
                                                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                                            </select>
                                            <input type="time" value={scheduleForm.departTime} onChange={e => setScheduleForm(f => ({ ...f, departTime: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" required />
                                            <select value={scheduleForm.riderId} onChange={e => setScheduleForm(f => ({ ...f, riderId: e.target.value }))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none">
                                                <option value="">Rider (optional)</option>
                                                {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                            <button className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Save</button>
                                            <button type="button" onClick={() => setScheduleCorridor(null)} className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                        </form>
                                    ) : (
                                        <button onClick={() => setScheduleCorridor(corridor.id)} className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline pt-1">
                                            <PlusIcon size={12} /> Add schedule
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Register corridor for this hub */}
                        {corridorHub === hub.id ? (
                            <form onSubmit={e => createCorridor(e, hub.id)} className="rounded-lg border border-green-100 bg-green-50/50 p-3 grid gap-2 sm:grid-cols-3">
                                <input value={corridorForm.name} onChange={e => setCorridorForm(f => ({ ...f, name: e.target.value }))} placeholder="Corridor name (e.g. Remera line)" className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white" required />
                                <input value={corridorForm.areas} onChange={e => setCorridorForm(f => ({ ...f, areas: e.target.value }))} placeholder="Areas (comma-separated)" className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white" />
                                <input value={corridorForm.description} onChange={e => setCorridorForm(f => ({ ...f, description: e.target.value }))} placeholder="Notes (optional)" className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white" />
                                <div className="sm:col-span-3 flex gap-2">
                                    <button className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Register corridor</button>
                                    <button type="button" onClick={() => setCorridorHub(null)} className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <button onClick={() => { setCorridorHub(hub.id); setCorridorForm({ name: '', areas: '', description: '' }) }} className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:underline">
                                <PlusIcon size={14} /> Register a corridor from this hub
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
