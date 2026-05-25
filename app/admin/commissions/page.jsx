"use client"
import { useEffect, useState } from 'react'
import CommissionForm from '../../../components/admin/CommissionForm'
import { PlusIcon, Pencil, Trash2, TagIcon } from 'lucide-react'

const MODEL_LABELS = {
  FULL_MANAGED: 'Full Managed',
  LOCAL_SELLER: 'Local Seller',
  null: 'All Models',
}

const MODEL_COLORS = {
  FULL_MANAGED: 'bg-blue-100 text-blue-700',
  LOCAL_SELLER: 'bg-green-100 text-green-700',
  null: 'bg-slate-100 text-slate-600',
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('LOCAL_SELLER')

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/commissions')
      const data = await res.json()
      setCommissions(data.commissions || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [])

  async function handleDelete(id) {
    if (!confirm('Delete this commission rule?')) return
    await fetch(`/api/admin/commissions/${id}`, { method: 'DELETE' })
    setCommissions(prev => prev.filter(c => c.id !== id))
  }

  function startEdit(c) {
    setEditing(c)
    setShowForm(true)
  }

  function startNew() {
    setEditing(null)
    setShowForm(true)
  }

  function cancelForm() {
    setEditing(null)
    setShowForm(false)
  }

  const tabs = ['LOCAL_SELLER', 'FULL_MANAGED', null]
  const filtered = commissions.filter(c => c.sellerModel === activeTab)

  return (
    <div className="text-slate-700 mb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl text-slate-500">Category <span className="text-slate-800 font-medium">Commissions</span></h1>
        <button onClick={startNew} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition">
          <PlusIcon size={15} /> Add Rule
        </button>
      </div>

      {showForm && (
        <div className="mb-6 max-w-lg">
          <CommissionForm
            key={editing?.id || 'new'}
            initialData={editing}
            onCancel={cancelForm}
            onSaved={() => { cancelForm(); fetchList() }}
          />
        </div>
      )}

      {/* Seller model tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={String(t)}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${activeTab === t ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {MODEL_LABELS[t]}
            {commissions.filter(c => c.sellerModel === t).length > 0 && (
              <span className="ml-1.5 text-xs opacity-70">({commissions.filter(c => c.sellerModel === t).length})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
          <TagIcon size={32} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No rules for {MODEL_LABELS[activeTab]}</p>
          <p className="text-sm text-slate-400 mt-1">Run the seed script or add a rule manually.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-w-4xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Percent</th>
                <th className="px-4 py-3">Fixed (Rwf)</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODEL_COLORS[c.sellerModel]}`}>
                      {MODEL_LABELS[c.sellerModel]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.percent != null ? `${c.percent}%` : '—'}</td>
                  <td className="px-4 py-3">{c.fixedAmount != null ? c.fixedAmount.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(c)} className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs transition">
                        <Pencil size={13} /> Edit
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs transition">
                        <Trash2 size={13} /> Delete
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
  )
}
