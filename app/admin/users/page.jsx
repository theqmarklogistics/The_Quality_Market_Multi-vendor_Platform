'use client'

import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import { Fragment, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { KIGALI_SECTORS } from "@/lib/constants"
import { UserXIcon, UserCheckIcon, Trash2Icon, ContactIcon, PhoneIcon, MapPinIcon } from "lucide-react"

const ROLE_OPTIONS = [
    { value: 'LOGISTICS_MANAGER', label: 'Logistics manager' },
    { value: 'FINANCIAL_OPERATIONAL', label: 'Financial operational' },
    { value: 'WAREHOUSE_KEEPER', label: 'Warehouse keeper' },
    { value: 'RIDER', label: 'Rider' },
    { value: 'EXTERNAL_SELLER', label: 'External delivery partner' },
    { value: 'AGENT', label: 'Agent (public contact)' },
]

// Roles whose phone + location are published on the public delivery-network page.
const STAFF_PROFILE_ROLES = ['AGENT', 'LOGISTICS_MANAGER']

export default function AdminUsersPage() {
    const { user } = useUser()
    const { getToken } = useAuth()

    const [loading, setLoading] = useState(true)
    const [users, setUsers] = useState([])
    const [emailInput, setEmailInput] = useState('')
    const [roleInput, setRoleInput] = useState('LOGISTICS_MANAGER')
    // Contact-card editor (keyed open per user)
    const [editingContact, setEditingContact] = useState(null) // { id, phone, sector, landmark, isPublic } | null
    const [busyId, setBusyId] = useState(null)

    const fetchUsers = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/users', {
                headers: { Authorization: `Bearer ${token}` }
            })
            setUsers(data.users || [])
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (user) fetchUsers()
    }, [user])

    const inviteUser = async (event) => {
        event.preventDefault()
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/admin/users', {
                email: emailInput,
                role: roleInput,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            setEmailInput('')
            await fetchUsers()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const toggleActive = async (item) => {
        const deactivating = item.isActive
        if (deactivating && !confirm(`Deactivate ${item.name || item.email}? They will be signed out and blocked from signing in until reactivated.`)) return
        setBusyId(item.id)
        try {
            const token = await getToken()
            const { data } = await axios.patch(`/api/admin/users/${item.id}`, {
                action: deactivating ? 'deactivate' : 'reactivate',
            }, { headers: { Authorization: `Bearer ${token}` } })
            toast.success(data.message)
            await fetchUsers()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setBusyId(null)
        }
    }

    const removeUser = async (item) => {
        if (!confirm(`Permanently remove ${item.name || item.email}? This deletes their account and sign-in. It cannot be undone.`)) return
        setBusyId(item.id)
        try {
            const token = await getToken()
            const { data } = await axios.delete(`/api/admin/users/${item.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            toast.success(data.message)
            await fetchUsers()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setBusyId(null)
        }
    }

    const saveContact = async () => {
        if (!editingContact) return
        try {
            const token = await getToken()
            const { data } = await axios.patch(`/api/admin/users/${editingContact.id}`, {
                staffProfile: {
                    phone: editingContact.phone,
                    sector: editingContact.sector,
                    landmark: editingContact.landmark,
                    isPublic: editingContact.isPublic,
                },
            }, { headers: { Authorization: `Bearer ${token}` } })
            toast.success(data.message)
            setEditingContact(null)
            await fetchUsers()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const roleLabel = (role) => ROLE_OPTIONS.find(option => option.value === role)?.label || role
    // A user with business records can only be deactivated, never removed.
    const hasRecords = (item) => (item._count?.buyerOrders || 0) > 0 || (item._count?.returns || 0) > 0 || !!item.store

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Manage <span className="text-slate-800 font-medium">Users</span></h1>
            <p className="text-sm text-slate-400 mt-1">Invite a user and assign a dashboard role. Agents and logistics managers can be given a public contact card (phone + location) shown on the delivery-network page.</p>

            <form onSubmit={inviteUser} className="mt-6 flex flex-wrap gap-3 items-end bg-white border border-slate-200 rounded-xl p-4 max-w-3xl">
                <label className="flex-1 min-w-64">
                    <span className="block text-xs font-medium text-slate-500 mb-1">User email</span>
                    <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        placeholder="person@example.com"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                </label>
                <label className="min-w-56">
                    <span className="block text-xs font-medium text-slate-500 mb-1">Role</span>
                    <select
                        value={roleInput}
                        onChange={e => setRoleInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 bg-white"
                    >
                        {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900">
                    Send invite
                </button>
            </form>

            <div className="mt-6 overflow-x-auto rounded-md shadow border border-gray-200 max-w-6xl bg-white">
                <table className="w-full text-sm text-left text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Contact card</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">Loading users…</td></tr>
                        ) : users.length ? users.map((item) => (
                            <Fragment key={item.id}>
                                <tr className={!item.isActive ? 'opacity-60' : undefined}>
                                    <td className="px-4 py-3 text-slate-800">{item.name}</td>
                                    <td className="px-4 py-3">{item.email}</td>
                                    <td className="px-4 py-3 font-medium text-slate-700">{roleLabel(item.role)}</td>
                                    <td className="px-4 py-3">
                                        {STAFF_PROFILE_ROLES.includes(item.role) ? (
                                            item.staffProfile?.phone || item.staffProfile?.sector || item.staffProfile?.landmark ? (
                                                <div className="text-xs text-slate-600">
                                                    {item.staffProfile.phone && <span className="flex items-center gap-1"><PhoneIcon size={11} className="text-green-600" /> {item.staffProfile.phone}</span>}
                                                    {(item.staffProfile.sector || item.staffProfile.landmark) && (
                                                        <span className="flex items-center gap-1 text-slate-400 mt-0.5"><MapPinIcon size={11} /> {[item.staffProfile.sector, item.staffProfile.landmark].filter(Boolean).join(' · ')}</span>
                                                    )}
                                                    {item.staffProfile.isPublic === false && <span className="text-[10px] uppercase font-semibold text-amber-600">Hidden from public</span>}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-amber-600">Not set — add phone &amp; location</span>
                                            )
                                        ) : (
                                            <span className="text-xs text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                            {item.isActive ? 'Active' : 'Deactivated'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.role === 'ADMIN' ? (
                                            <span className="text-xs text-slate-300">Protected</span>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                {STAFF_PROFILE_ROLES.includes(item.role) && (
                                                    <button
                                                        onClick={() => setEditingContact(editingContact?.id === item.id ? null : {
                                                            id: item.id,
                                                            phone: item.staffProfile?.phone || '',
                                                            sector: item.staffProfile?.sector || '',
                                                            landmark: item.staffProfile?.landmark || '',
                                                            isPublic: item.staffProfile?.isPublic !== false,
                                                        })}
                                                        title="Edit public contact card"
                                                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-green-400 hover:text-green-600"
                                                    >
                                                        <ContactIcon size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => toggleActive(item)}
                                                    disabled={busyId === item.id}
                                                    title={item.isActive ? 'Deactivate (block sign-in)' : 'Reactivate'}
                                                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40"
                                                >
                                                    {item.isActive ? <UserXIcon size={14} /> : <UserCheckIcon size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => removeUser(item)}
                                                    disabled={busyId === item.id || hasRecords(item)}
                                                    title={hasRecords(item) ? 'Has orders/store records — deactivate instead' : 'Remove permanently'}
                                                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-red-400 hover:text-red-600 disabled:opacity-30 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
                                                >
                                                    <Trash2Icon size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                {editingContact?.id === item.id && (
                                    <tr>
                                        <td colSpan="6" className="px-4 pb-4 pt-0">
                                            <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                                                <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
                                                    <ContactIcon size={12} className="text-green-600" /> Public contact card — shown on the delivery-network page
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <input
                                                        value={editingContact.phone}
                                                        onChange={e => setEditingContact(c => ({ ...c, phone: e.target.value }))}
                                                        placeholder="Phone (e.g. +250 78x xxx xxx)"
                                                        className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white w-52"
                                                    />
                                                    <select
                                                        value={editingContact.sector}
                                                        onChange={e => setEditingContact(c => ({ ...c, sector: e.target.value }))}
                                                        className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white w-44 text-slate-600"
                                                    >
                                                        <option value="">Sector (optional)</option>
                                                        {KIGALI_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                    <input
                                                        value={editingContact.landmark}
                                                        onChange={e => setEditingContact(c => ({ ...c, landmark: e.target.value }))}
                                                        placeholder="Location / landmark"
                                                        className="border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-green-500 bg-white w-56"
                                                    />
                                                    <label className="flex items-center gap-1.5 text-xs text-slate-600 select-none cursor-pointer px-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={editingContact.isPublic}
                                                            onChange={e => setEditingContact(c => ({ ...c, isPublic: e.target.checked }))}
                                                            className="accent-green-600"
                                                        />
                                                        Visible publicly
                                                    </label>
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <button onClick={saveContact} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Save contact card</button>
                                                    <button onClick={() => setEditingContact(null)} className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        )) : (
                            <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">No users found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
