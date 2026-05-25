"use client"
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

const TYPES = ['DEFAULT', 'KM', 'REGION']

export default function ShippingForm({ initialData = null, onSaved = () => {}, onCancel }) {
  const [type, setType] = useState('DEFAULT')
  const [name, setName] = useState('')
  const [priority, setPriority] = useState(0)
  const [regionKey, setRegionKey] = useState('')
  const [minKm, setMinKm] = useState('')
  const [maxKm, setMaxKm] = useState('')
  const [flatRate, setFlatRate] = useState('')
  const [perKmRate, setPerKmRate] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setType(initialData.type || 'DEFAULT')
      setName(initialData.name || '')
      setPriority(initialData.priority ?? 0)
      setRegionKey(initialData.regionKey || '')
      setMinKm(initialData.minKm ?? '')
      setMaxKm(initialData.maxKm ?? '')
      setFlatRate(initialData.flatRate ?? '')
      setPerKmRate(initialData.perKmRate ?? '')
    } else {
      setType('DEFAULT'); setName(''); setPriority(0)
      setRegionKey(''); setMinKm(''); setMaxKm('')
      setFlatRate(''); setPerKmRate('')
    }
  }, [initialData])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name is required')
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        type,
        priority: Number(priority),
        regionKey: type === 'REGION' ? regionKey.trim() || null : null,
        minKm: type === 'KM' && minKm !== '' ? Number(minKm) : null,
        maxKm: type === 'KM' && maxKm !== '' ? Number(maxKm) : null,
        flatRate: flatRate !== '' ? Number(flatRate) : null,
        perKmRate: perKmRate !== '' ? Number(perKmRate) : null,
      }
      const res = initialData?.id
        ? await fetch(`/api/admin/shipping/${initialData.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/shipping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save shipping rule')
      }
      toast.success(initialData?.id ? 'Rule updated' : 'Rule created')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-sm border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-slate-800">{initialData ? 'Edit Rule' : 'New Shipping Rule'}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Type</label>
          <select className={inp} value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Priority (higher wins)</label>
          <input type="number" className={inp} value={priority} onChange={e => setPriority(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={lbl}>Name</label>
        <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kigali Default" />
      </div>

      {type === 'REGION' && (
        <div>
          <label className={lbl}>Region Key (district name)</label>
          <input className={inp} value={regionKey} onChange={e => setRegionKey(e.target.value)} placeholder="e.g. Kigali" />
        </div>
      )}

      {type === 'KM' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Min Km</label>
            <input type="number" step="0.1" min="0" className={inp} value={minKm} onChange={e => setMinKm(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>Max Km</label>
            <input type="number" step="0.1" min="0" className={inp} value={maxKm} onChange={e => setMaxKm(e.target.value)} placeholder="50" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Flat Rate (Rwf)</label>
          <input type="number" step="0.01" min="0" className={inp} value={flatRate} onChange={e => setFlatRate(e.target.value)} placeholder="0" />
        </div>
        {type === 'KM' && (
          <div>
            <label className={lbl}>Per-km Rate (Rwf/km)</label>
            <input type="number" step="0.01" min="0" className={inp} value={perKmRate} onChange={e => setPerKmRate(e.target.value)} placeholder="0" />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition disabled:opacity-60">
          {loading ? 'Saving…' : (initialData ? 'Update' : 'Create')}
        </button>
      </div>
    </form>
  )
}
