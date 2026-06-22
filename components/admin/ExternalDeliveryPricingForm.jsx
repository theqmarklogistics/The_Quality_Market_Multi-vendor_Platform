"use client"
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { SaveIcon, PlusIcon, Trash2Icon, TruckIcon } from 'lucide-react'

const DEFAULT_TIERS = [
  { maxKm: 5, multiplier: 1.0 },
  { maxKm: 10, multiplier: 0.85 },
  { maxKm: 20, multiplier: 0.7 },
  { maxKm: null, multiplier: 0.6 },
]

// Admin editor for the distance × weight pooled-delivery pricing formula:
// Fee = max(floor, round(baseRate × chargeableKg × distanceKm × tierMultiplier)).
export default function ExternalDeliveryPricingForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ baseRatePerKgKm: '', minimumFloor: '', volumetricFactor: '', basePrice: '' })
  const [tiers, setTiers] = useState(DEFAULT_TIERS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/external-delivery-config')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const c = data.config || {}
      setForm({
        baseRatePerKgKm: c.baseRatePerKgKm ?? 8,
        minimumFloor: c.minimumFloor ?? 2000,
        volumetricFactor: c.volumetricFactor ?? 200,
        basePrice: c.basePrice ?? 2000,
      })
      setTiers(Array.isArray(c.distanceTiers) && c.distanceTiers.length ? c.distanceTiers : DEFAULT_TIERS)
    } catch (err) {
      toast.error('Failed to load delivery pricing')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setTier = (i, k, v) => setTiers(t => t.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  const addTier = () => setTiers(t => [...t, { maxKm: '', multiplier: 1 }])
  const removeTier = (i) => setTiers(t => t.filter((_, idx) => idx !== i))

  async function save() {
    setSaving(true)
    try {
      const payload = {
        baseRatePerKgKm: Number(form.baseRatePerKgKm),
        minimumFloor: Number(form.minimumFloor),
        volumetricFactor: Number(form.volumetricFactor),
        basePrice: Number(form.basePrice),
        distanceTiers: tiers.map(t => ({
          maxKm: t.maxKm === '' || t.maxKm == null ? null : Number(t.maxKm),
          multiplier: Number(t.multiplier),
        })),
      }
      const res = await fetch('/api/admin/external-delivery-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save')
      toast.success('Delivery pricing saved')
      load()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><TruckIcon size={18} /> External / Pooled Delivery Pricing</h2>
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
          <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Fee = max(Floor, round(BaseRate × chargeableKg × distanceKm × tierMultiplier)). Chargeable kg = max(actual, volume × factor).</p>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-7 h-7 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Base rate (Rwf/kg·km)</label>
              <input type="number" min="0" step="0.5" className={inp} value={form.baseRatePerKgKm} onChange={e => setField('baseRatePerKgKm', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Minimum floor (Rwf)</label>
              <input type="number" min="0" step="100" className={inp} value={form.minimumFloor} onChange={e => setField('minimumFloor', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Volumetric (kg/m³)</label>
              <input type="number" min="1" step="10" className={inp} value={form.volumetricFactor} onChange={e => setField('volumetricFactor', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Flat fallback (Rwf)</label>
              <input type="number" min="0" step="100" className={inp} value={form.basePrice} onChange={e => setField('basePrice', e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={lbl + ' mb-0'}>Distance tiers (sliding-scale multiplier)</label>
              <button type="button" onClick={addTier} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"><PlusIcon size={13} /> Add tier</button>
            </div>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-14">up to</span>
                  <input
                    type="number" min="0" step="1"
                    className={inp + ' max-w-28'}
                    placeholder="∞ (open)"
                    value={t.maxKm == null ? '' : t.maxKm}
                    onChange={e => setTier(i, 'maxKm', e.target.value)}
                  />
                  <span className="text-xs text-slate-400">km →</span>
                  <input
                    type="number" min="0" step="0.05"
                    className={inp + ' max-w-28'}
                    placeholder="multiplier"
                    value={t.multiplier}
                    onChange={e => setTier(i, 'multiplier', e.target.value)}
                  />
                  <span className="text-xs text-slate-400">×</span>
                  <button type="button" onClick={() => removeTier(i)} className="ml-auto text-slate-300 hover:text-red-500" aria-label="Remove tier"><Trash2Icon size={15} /></button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Leave a tier&apos;s km blank for the open final tier (applies to any longer distance). Tiers are auto-sorted by distance.</p>
          </div>
        </div>
      )}
    </div>
  )
}
