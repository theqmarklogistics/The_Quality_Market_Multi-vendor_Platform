"use client"
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { SaveIcon, ZapIcon, AlertTriangleIcon } from 'lucide-react'

// Admin configuration for EXPRESS delivery — the instant-dispatch service.
// Express rides the same segmented-taper + weight-range formula as every other
// delivery; its ONLY pricing knob is its own base rate. The availability toggle
// hides Express at checkout/booking (web + mobile) and makes the APIs reject
// new express orders — already-booked express orders still dispatch/deliver.
export default function ExpressDeliveryForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [rate, setRate] = useState('')
  // Normal base rate, read-only — shown so admin prices express relative to it.
  const [baseRate, setBaseRate] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/external-delivery-config')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const c = data.config || {}
      setEnabled(c.expressEnabled !== false)
      setRate(c.expressBaseRatePerKgKm ?? 16)
      setBaseRate(Number.isFinite(c.baseRatePerKgKm) ? c.baseRatePerKgKm : null)
    } catch (err) {
      toast.error('Failed to load express delivery settings')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/external-delivery-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expressEnabled: enabled, expressBaseRatePerKgKm: Number(rate) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save')
      toast.success('Express delivery settings saved')
      load()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const underpriced = baseRate != null && Number(rate) > 0 && Number(rate) <= baseRate
  const multiple = baseRate > 0 && Number(rate) > 0 ? (Number(rate) / baseRate) : null

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><ZapIcon size={18} className="text-amber-500" /> Express Delivery</h2>
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
          <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Instant dispatch: the moment an express order is placed (or an express booking is paid), a single-stop EXPRESS run appears on the dispatch board and staff assign a rider — no waiting for the pooled route schedule. Same formula, taper and weight ranges as normal delivery; only the base rate differs.</p>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-7 h-7 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <label className={`flex items-start gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${enabled ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 accent-amber-500" />
            <div>
              <span className="block text-sm font-semibold text-slate-800">Offer Express delivery</span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                When off, Express disappears from checkout and booking forms and new express orders are
                rejected. Express orders already booked keep dispatching and delivering normally.
              </span>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className={lbl}>Express base rate (Rwf/km·kg)</label>
              <input type="number" min="0" step="0.5" className={inp} value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Normal base rate</label>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {baseRate != null ? `${baseRate} Rwf/km·kg` : '—'}
                {multiple != null && <span className="text-slate-400"> · express ≈ ×{multiple.toFixed(1)}</span>}
              </div>
            </div>
          </div>

          {underpriced && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <AlertTriangleIcon size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-800">
                <span className="font-semibold">Express is priced at or below the normal rate.</span> Customers
                would pay the same or less for instant dispatch than for a scheduled delivery. Set the express
                rate above the normal base rate ({baseRate} Rwf/km·kg).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
