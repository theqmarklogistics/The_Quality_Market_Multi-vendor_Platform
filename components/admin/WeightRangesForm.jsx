"use client"
import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { SaveIcon, PlusIcon, Trash2Icon, ScaleIcon } from 'lucide-react'

// Sensible starter ranges when the table is empty. The last row's max is left
// blank (open tier) so heavy packages still resolve to a chargeable weight.
const DEFAULT_RANGES = [
  { minWeightKg: 0, maxWeightKg: 1, chargeableKg: 1 },
  { minWeightKg: 1, maxWeightKg: 3, chargeableKg: 3 },
  { minWeightKg: 3, maxWeightKg: 5, chargeableKg: 5 },
  { minWeightKg: 5, maxWeightKg: 10, chargeableKg: 10 },
  { minWeightKg: 10, maxWeightKg: '', chargeableKg: 15 },
]

// Admin editor for the weight ranges that map a package's greater (actual vs
// volumetric) weight to the CHARGEABLE weight used in the fee formula. A weight
// outside every range is flagged for manual review (admin contacts the customer).
export default function WeightRangesForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState(DEFAULT_RANGES)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/shipping/weight-ranges')
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      const list = Array.isArray(data.ranges) ? data.ranges : []
      setRows(list.length
        ? list.map(r => ({ minWeightKg: r.minWeightKg, maxWeightKg: r.maxWeightKg ?? '', chargeableKg: r.chargeableKg }))
        : DEFAULT_RANGES)
    } catch (err) {
      toast.error('Failed to load weight ranges')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setCell = (i, k, v) => setRows(rs => rs.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  const addRow = () => setRows(rs => [...rs, { minWeightKg: '', maxWeightKg: '', chargeableKg: '' }])
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))

  async function save() {
    setSaving(true)
    try {
      const payload = rows.map(r => ({
        minWeightKg: Number(r.minWeightKg),
        maxWeightKg: r.maxWeightKg === '' || r.maxWeightKg == null ? null : Number(r.maxWeightKg),
        chargeableKg: Number(r.chargeableKg),
      }))
      const res = await fetch('/api/admin/shipping/weight-ranges', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save')
      toast.success('Weight ranges saved')
      load()
    } catch (err) { toast.error(err.message) } finally { setSaving(false) }
  }

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm bg-white p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2"><ScaleIcon size={18} /> Chargeable Weight Ranges</h2>
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
          <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">The greater of a package&apos;s actual and volumetric weight is matched to a range; that range&apos;s <b>chargeable weight</b> is used in the fee formula. A weight outside every range is flagged for manual review. Leave the last row&apos;s <i>max</i> blank for the open (heaviest) tier.</p>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-7 h-7 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <label className={lbl}>Min (kg)</label>
            <label className={lbl}>Max (kg)</label>
            <label className={lbl}>Chargeable (kg)</label>
            <span className="w-6" />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input type="number" min="0" step="0.5" className={inp} placeholder="0" value={r.minWeightKg} onChange={e => setCell(i, 'minWeightKg', e.target.value)} />
              <input type="number" min="0" step="0.5" className={inp} placeholder="∞ (open)" value={r.maxWeightKg} onChange={e => setCell(i, 'maxWeightKg', e.target.value)} />
              <input type="number" min="0" step="0.5" className={inp} placeholder="chargeable" value={r.chargeableKg} onChange={e => setCell(i, 'chargeableKg', e.target.value)} />
              <button type="button" onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-500" aria-label="Remove range"><Trash2Icon size={15} /></button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"><PlusIcon size={13} /> Add range</button>
        </div>
      )}
    </div>
  )
}
