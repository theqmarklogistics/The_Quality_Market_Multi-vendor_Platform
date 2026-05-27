'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { PencilIcon, SaveIcon, TagIcon, Trash2Icon, XIcon } from 'lucide-react'

const EMPTY_FORM = { name: '', commissionPercent: '', sortOrder: '' }

export default function AdminCategories() {
    const { getToken } = useAuth()

    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [form, setForm] = useState(EMPTY_FORM)
    const [editId, setEditId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState(null)

    const fetchCategories = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/admin/categories', {
                headers: { Authorization: `Bearer ${token}` },
            })
            setCategories(data.categories)
        } catch {
            toast.error('Failed to load categories')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchCategories() }, [])

    const startEdit = (cat) => {
        setEditId(cat.id)
        setForm({
            name: cat.name,
            commissionPercent: cat.commissionPercent,
            sortOrder: cat.sortOrder,
        })
    }

    const cancelEdit = () => {
        setEditId(null)
        setForm(EMPTY_FORM)
    }

    const handleSave = async (e) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            const token = await getToken()
            const payload = {
                name: form.name.trim(),
                commissionPercent: form.commissionPercent !== '' ? Number(form.commissionPercent) : 0,
                sortOrder: form.sortOrder !== '' ? Number(form.sortOrder) : 0,
            }
            if (editId) {
                await axios.put(`/api/admin/categories/${editId}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                toast.success('Category updated')
            } else {
                await axios.post('/api/admin/categories', payload, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                toast.success('Category created')
            }
            setEditId(null)
            setForm(EMPTY_FORM)
            fetchCategories()
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = async (cat) => {
        try {
            const token = await getToken()
            await axios.put(`/api/admin/categories/${cat.id}`, { isActive: !cat.isActive }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isActive: !c.isActive } : c))
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        }
    }

    const handleDelete = async (cat) => {
        if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return
        setDeletingId(cat.id)
        try {
            const token = await getToken()
            await axios.delete(`/api/admin/categories/${cat.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            toast.success('Category deleted')
            setCategories(prev => prev.filter(c => c.id !== cat.id))
            if (editId === cat.id) cancelEdit()
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setDeletingId(null)
        }
    }

    const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'

    return (
        <div className="text-slate-500 mb-28">
            <h1 className="text-2xl mb-6">Product <span className="text-slate-800 font-medium">Categories</span></h1>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Category list */}
                <div className="lg:col-span-2 border border-slate-200 rounded-2xl bg-white overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                        <TagIcon size={16} className="text-slate-400" />
                        <h2 className="text-sm font-medium text-slate-700">
                            All Categories <span className="text-slate-400 font-normal">({categories.length})</span>
                        </h2>
                    </div>

                    {loading ? (
                        <p className="text-slate-400 text-sm p-6">Loading…</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="text-left px-5 py-3 text-xs text-slate-400 font-medium">Name</th>
                                        <th className="text-left px-3 py-3 text-xs text-slate-400 font-medium">Commission</th>
                                        <th className="text-left px-3 py-3 text-xs text-slate-400 font-medium">Active</th>
                                        <th className="px-3 py-3 text-xs text-slate-400 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map(cat => (
                                        <tr key={cat.id} className={`border-b border-slate-50 hover:bg-slate-50 transition ${editId === cat.id ? 'bg-green-50' : ''}`}>
                                            <td className="px-5 py-3 text-slate-700 font-medium">{cat.name}</td>
                                            <td className="px-3 py-3 text-slate-500">
                                                {cat.commissionPercent > 0
                                                    ? <span className="font-medium text-slate-700">{cat.commissionPercent}%</span>
                                                    : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-3">
                                                <button
                                                    onClick={() => toggleActive(cat)}
                                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${cat.isActive ? 'bg-green-500' : 'bg-slate-200'}`}
                                                >
                                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${cat.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => editId === cat.id ? cancelEdit() : startEdit(cat)}
                                                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                                                        title="Edit"
                                                    >
                                                        {editId === cat.id ? <XIcon size={14} /> : <PencilIcon size={14} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(cat)}
                                                        disabled={deletingId === cat.id}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition disabled:opacity-40"
                                                        title="Delete"
                                                    >
                                                        <Trash2Icon size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Add / Edit form */}
                <div className="border border-slate-200 rounded-2xl bg-white p-5 h-fit">
                    <h2 className="text-sm font-medium text-slate-700 mb-5">
                        {editId ? `Edit: ${form.name || '…'}` : 'Add Category'}
                    </h2>
                    <form onSubmit={handleSave} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">Category name</label>
                            <input
                                type="text"
                                className={inputCls}
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Electronics"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">
                                Commission % <span className="font-normal text-slate-400">(platform fee per sale)</span>
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className={inputCls}
                                value={form.commissionPercent}
                                onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))}
                                placeholder="e.g. 5.5"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">
                                Sort order <span className="font-normal text-slate-400">(lower = appears first)</span>
                            </label>
                            <input
                                type="number"
                                min="0"
                                className={inputCls}
                                value={form.sortOrder}
                                onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                                placeholder="0"
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full hover:bg-slate-900 disabled:opacity-50 transition"
                            >
                                <SaveIcon size={14} />
                                {saving ? 'Saving…' : editId ? 'Update' : 'Add Category'}
                            </button>
                            {editId && (
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="px-4 py-2.5 text-sm border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
