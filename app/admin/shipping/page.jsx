"use client"
import { useEffect, useState, useCallback } from 'react'
import ShippingForm from '../../../components/admin/ShippingForm'
import { PlusIcon, Pencil, Trash2, TruckIcon, GlobeIcon, SaveIcon } from 'lucide-react'
import toast from 'react-hot-toast'

const ZONES = ['A', 'B', 'C', 'CHINA_RWANDA']
const ZONE_LABELS = { A: 'Zone A — Central (0–4 km)', B: 'Zone B — Intermediate (4–8 km)', C: 'Zone C — Periphery (>8 km)', CHINA_RWANDA: 'China → Rwanda (International Freight)' }
const ZONE_COLORS = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700', C: 'bg-amber-100 text-amber-700', CHINA_RWANDA: 'bg-red-100 text-red-700' }

export default function ShippingPage() {
  const [tab, setTab] = useState('local')

  // Local Seller state
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  // Full Managed tariff state
  const [rates, setRates] = useState([])
  const [ratesLoading, setRatesLoading] = useState(true)
  const [draftCosts, setDraftCosts] = useState({})
  const [saving, setSaving] = useState(false)

  const fetchRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const res = await fetch('/api/admin/shipping')
      const data = await res.json()
      setRules(data.rules || [])
    } finally { setRulesLoading(false) }
  }, [])

  const fetchRates = useCallback(async () => {
    setRatesLoading(true)
    try {
      const res = await fetch('/api/admin/shipping/weight-rates')
      const data = await res.json()
      const list = data.rates || []
      setRates(list)
      const draft = {}
      list.forEach(r => { draft[r.id] = r.cost })
      setDraftCosts(draft)
    } finally { setRatesLoading(false) }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])
  useEffect(() => { fetchRates() }, [fetchRates])

  async function handleDeleteRule(id) {
    if (!confirm('Delete this shipping rule?')) return
    await fetch(`/api/admin/shipping/${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  async function saveTariff() {
    setSaving(true)
    try {
      const patches = Object.entries(draftCosts).map(([id, cost]) => ({ id, cost: Number(cost) }))
      const res = await fetch('/api/admin/shipping/weight-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patches)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save')
      toast.success('Tariff saved')
      fetchRates()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const ratesByZone = ZONES.reduce((acc, z) => {
    acc[z] = rates.filter(r => r.zone === z).sort((a, b) => a.minWeightKg - b.minWeightKg)
    return acc
  }, {})

  function weightLabel(r) {
    return r.maxWeightKg != null ? `${r.minWeightKg}–${r.maxWeightKg} kg` : `${r.minWeightKg}+ kg`
  }

  return (
    <div className="text-slate-700 mb-28">
      <h1 className="text-2xl text-slate-500 mb-6">Shipping <span className="text-slate-800 font-medium">Configuration</span></h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('local')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${tab === 'local' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          <TruckIcon size={14} /> Local Seller Rules
        </button>
        <button
          onClick={() => setTab('fullmanaged')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${tab === 'fullmanaged' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          <GlobeIcon size={14} /> Full Managed Tariff
        </button>
      </div>

      {/* ── Local Seller Rules ── */}
      {tab === 'local' && (
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">Rules used for Local Seller stores (REGION / KM / DEFAULT logic).</p>
            <button onClick={() => { setEditing(null); setShowForm(true) }} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slatenet-900 transition">
              <PlusIcon size={15} /> Add Rule
            </button>
          </div>

          {showForm && (
            <div className="mb-5">
              <ShippingForm
                key={editing?.id || 'new'}
                initialData={editing}
                onCancel={() => { setEditing(null); setShowForm(false) }}
                onSaved={() => { setEditing(null); setShowForm(false); fetchRules() }}
              />
            </div>
          )}

          {rulesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
              <TruckIcon size={32} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No rules yet</p>
              <p className="text-sm text-slate-400 mt-1">Add REGION, KM, or DEFAULT rules for local sellers.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Region / KM Range</th>
                    <th className="px-4 py-3">Flat Rate</th>
                    <th className="px-4 py-3">Per-km Rate</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{r.type}</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.regionKey || (r.minKm != null ? `${r.minKm}–${r.maxKm ?? '∞'} km` : '—')}
                      </td>
                      <td className="px-4 py-3">{r.flatRate != null ? `${r.flatRate.toLocaleString()} Rwf` : '—'}</td>
                      <td className="px-4 py-3">{r.perKmRate != null ? `${r.perKmRate} Rwf/km` : '—'}</td>
                      <td className="px-4 py-3">{r.priority ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(r); setShowForm(true) }} className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs transition">
                            <Pencil size={13} /> Edit
                          </button>
                          <button onClick={() => handleDeleteRule(r.id)} className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs transition">
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
      )}

      {/* ── Full Managed Tariff ── */}
      {tab === 'fullmanaged' && (
        <div>
          <div className="flex items-center justify-between mb-4 max-w-5xl">
            <p className="text-sm text-slate-500">Weight-based tariff for Full Managed stores. Edit costs inline and save.</p>
            <button onClick={saveTariff} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
              <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          {ratesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-green-500 animate-spin" />
            </div>
          ) : rates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/70">
              <GlobeIcon size={32} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No tariff rates found</p>
              <p className="text-sm text-slate-400 mt-1">Run <code className="bg-slate-100 px-1 rounded">node scripts/seedWeightRates.mjs</code> to populate rates.</p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {ZONES.map(zone => (
                ratesByZone[zone].length > 0 && (
                  <div key={zone} className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ZONE_COLORS[zone]}`}>{ZONE_LABELS[zone]}</span>
                    </div>
                    <table className="w-full text-sm text-left">
                      <thead className="text-slate-500 text-xs uppercase tracking-wider bg-slate-50/50">
                        <tr>
                          <th className="px-4 py-2">Weight Bracket</th>
                          <th className="px-4 py-2">Cost (Rwf)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ratesByZone[zone].map(r => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-600">{weightLabel(r)}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                step="100"
                                className="w-28 border border-slate-200 rounded px-2 py-1 text-sm outline-none focus:border-slate-400"
                                value={draftCosts[r.id] ?? r.cost}
                                onChange={e => setDraftCosts(prev => ({ ...prev, [r.id]: e.target.value }))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
