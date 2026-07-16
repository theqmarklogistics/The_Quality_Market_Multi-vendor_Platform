"use client"
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { SaveIcon, TruckIcon } from 'lucide-react'

// Admin editor for the segmented distance-taper delivery pricing formula:
//   effectiveDist = Σ per taperStepKm segment: segLen × max(taperFloorPct, 1 − i·taperDropPerStep)
//   Fee           = max(minimumFloor, round(baseRate × chargeableWeight × effectiveDist))
// The chargeable weight comes from the Weight Ranges table (edited separately).
export default function ExternalDeliveryPricingForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    baseRatePerKgKm: '', expressBaseRatePerKgKm: '', minimumFloor: '', volumetricFactor: '', basePrice: '',
    taperStepKm: '', taperDropPct: '', taperFloorPct: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/external-delivery-config')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const c = data.config || {}
      setForm({
        baseRatePerKgKm: c.baseRatePerKgKm ?? 8,
        expressBaseRatePerKgKm: c.expressBaseRatePerKgKm ?? 16,
        minimumFloor: c.minimumFloor ?? 2000,
        volumetricFactor: c.volumetricFactor ?? 200,
        basePrice: c.basePrice ?? 2000,
        taperStepKm: c.taperStepKm ?? 5,
        // Stored as fractions (0.10, 0.50); shown as whole percents.
        taperDropPct: Math.round((c.taperDropPerStep ?? 0.10) * 100),
        taperFloorPct: Math.round((c.taperFloorPct ?? 0.50) * 100),
      })
    } catch (err) {
      toast.error('Failed to load delivery pricing')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      const payload = {
        baseRatePerKgKm: Number(form.baseRatePerKgKm),
        expressBaseRatePerKgKm: Number(form.expressBaseRatePerKgKm),
        minimumFloor: Number(form.minimumFloor),
        volumetricFactor: Number(form.volumetricFactor),
        basePrice: Number(form.basePrice),
        taperStepKm: Number(form.taperStepKm),
        taperDropPerStep: Number(form.taperDropPct) / 100,
        taperFloorPct: Number(form.taperFloorPct) / 100,
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
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><TruckIcon size={18} /> Delivery Pricing Formula</h2>
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
          <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Fee = max(Floor, round(BaseRate × ChargeableWeight × EffectiveDistance)). The per-km rate starts at 100%, drops each step, and never falls below the floor — applied per distance segment and summed. Chargeable weight comes from the ranges below. <b>Express</b> deliveries (instant dispatch) use the same formula with the express rate instead of the base rate.</p>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-7 h-7 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className={lbl}>Base rate (Rwf/km·kg)</label>
              <input type="number" min="0" step="0.5" className={inp} value={form.baseRatePerKgKm} onChange={e => setField('baseRatePerKgKm', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Express rate (Rwf/km·kg)</label>
              <input type="number" min="0" step="0.5" className={inp} value={form.expressBaseRatePerKgKm} onChange={e => setField('expressBaseRatePerKgKm', e.target.value)} />
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
            <label className={lbl + ' mb-2'}>Distance taper</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Step size (km)</label>
                <input type="number" min="1" step="1" className={inp} value={form.taperStepKm} onChange={e => setField('taperStepKm', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Drop per step (%)</label>
                <input type="number" min="0" max="100" step="1" className={inp} value={form.taperDropPct} onChange={e => setField('taperDropPct', e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Rate floor (%)</label>
                <input type="number" min="0" max="100" step="1" className={inp} value={form.taperFloorPct} onChange={e => setField('taperFloorPct', e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">e.g. 5&nbsp;km step, 10% drop, 50% floor → the rate is 100% for the first 5&nbsp;km, then 90%, 80%… down to a 50% minimum for the rest of the trip.</p>
          </div>
        </div>
      )}
    </div>
  )
}
