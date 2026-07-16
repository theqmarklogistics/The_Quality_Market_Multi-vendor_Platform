'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { CornerDownRightIcon, PencilIcon, PlusIcon, SaveIcon, TagIcon, Trash2Icon, XIcon } from 'lucide-react'
import { MAX_CATEGORY_DEPTH, flattenCategoryOptions, isSelfOrDescendant } from '@/lib/categoryTree'

const EMPTY_FORM = { name: '', sortOrder: '', parentId: '' }

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

    // Tree-ordered rows (depth 1..3) for the table + parent pickers.
    const treeRows = useMemo(() => {
        const byId = new Map(categories.map(c => [c.id, c]))
        return flattenCategoryOptions(categories).map(o => ({ ...byId.get(o.id), depth: o.depth, label: o.label }))
    }, [categories])

    // Valid parents: anything above the max depth's last level, excluding (when
    // editing) the category itself and its own subtree.
    const parentOptions = useMemo(() =>
        treeRows.filter(r =>
            r.depth < MAX_CATEGORY_DEPTH &&
            (!editId || !isSelfOrDescendant(editId, r.id, categories))
        ), [treeRows, categories, editId])

    const startEdit = (cat) => {
        setEditId(cat.id)
        setForm({
            name: cat.name,
            sortOrder: cat.sortOrder,
            parentId: cat.parentId || '',
        })
    }

    // "+ Sub" shortcut: prefill the add-form with this category as the parent.
    const startAddChild = (cat) => {
        setEditId(null)
        setForm({ name: '', sortOrder: '', parentId: cat.id })
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
                sortOrder: form.sortOrder !== '' ? Number(form.sortOrder) : 0,
                parentId: form.parentId || null,
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
                                        <th className="text-left px-3 py-3 text-xs text-slate-400 font-medium">Active</th>
                                        <th className="px-3 py-3 text-xs text-slate-400 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {treeRows.map(cat => (
                                        <tr key={cat.id} className={`border-b border-slate-50 hover:bg-slate-50 transition ${editId === cat.id ? 'bg-green-50' : ''}`}>
                                            <td className="px-5 py-3 text-slate-700 font-medium">
                                                <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: (cat.depth - 1) * 22 }}>
                                                    {cat.depth > 1 && <CornerDownRightIcon size={13} className="text-slate-300 shrink-0" />}
                                                    <span className={cat.depth > 1 ? 'font-normal' : ''}>{cat.name}</span>
                                                </span>
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
                                                    {cat.depth < MAX_CATEGORY_DEPTH && (
                                                        <button
                                                            onClick={() => startAddChild(cat)}
                                                            className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600 transition inline-flex items-center gap-0.5 text-[11px] font-medium"
                                                            title={`Add a subcategory under "${cat.name}"`}
                                                        >
                                                            <PlusIcon size={13} /> Sub
                                                        </button>
                                                    )}
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
                                Parent category <span className="font-normal text-slate-400">(optional — makes this a subcategory, up to {MAX_CATEGORY_DEPTH} levels)</span>
                            </label>
                            <select
                                className={inputCls}
                                value={form.parentId}
                                onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                            >
                                <option value="">None — top-level category</option>
                                {parentOptions.map(opt => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-500 font-medium mb-1">
                                Sort order <span className="font-normal text-slate-400">(lower = appears first, among siblings)</span>
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
