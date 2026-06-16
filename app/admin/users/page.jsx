'use client'

import { useAuth, useUser } from "@clerk/nextjs"
import axios from "axios"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"

const ROLE_OPTIONS = [
    { value: 'LOGISTICS_MANAGER', label: 'Logistics manager' },
    { value: 'FINANCIAL_OPERATIONAL', label: 'Financial operational' },
    { value: 'WAREHOUSE_KEEPER', label: 'Warehouse keeper' },
    { value: 'RIDER', label: 'Rider' },
    { value: 'EXTERNAL_SELLER', label: 'External delivery partner' },
]

export default function AdminUsersPage() {
    const { user } = useUser()
    const { getToken } = useAuth()

    const [loading, setLoading] = useState(true)
    const [users, setUsers] = useState([])
    const [emailInput, setEmailInput] = useState('')
    const [roleInput, setRoleInput] = useState('LOGISTICS_MANAGER')

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

    const roleLabel = (role) => ROLE_OPTIONS.find(option => option.value === role)?.label || role

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl">Manage <span className="text-slate-800 font-medium">Users</span></h1>
            <p className="text-sm text-slate-400 mt-1">Invite a user and assign a dashboard role. They will receive an email invite.</p>

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

            <div className="mt-6 overflow-x-auto rounded-md shadow border border-gray-200 max-w-5xl bg-white">
                <table className="w-full text-sm text-left text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Role</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-400">Loading users…</td></tr>
                        ) : users.length ? users.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 text-slate-800">{item.name}</td>
                                <td className="px-4 py-3">{item.email}</td>
                                <td className="px-4 py-3 font-medium text-slate-700">{roleLabel(item.role)}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-400">No users found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}