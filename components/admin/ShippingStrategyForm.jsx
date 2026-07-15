'use client'
// Admin selector for the active shipping-fee strategy (pooled/external quotes)
// + per-model parameters. Zone×weight bracket prices (Model A) are edited in
// the tariff table on this same page.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import axios from 'axios'
import toast from 'react-hot-toast'
import { ScaleIcon, SaveIcon } from 'lucide-react'

const MODELS = [
    {
        key: 'LEGACY',
        label: 'Legacy formula (current)',
        blurb: 'rate × billed kg × road km × distance-tier multiplier, with a minimum floor. Rates are edited in the "External delivery pricing" card above.',
        params: [],
    },
    {
        key: 'ZONE_WEIGHT',
        label: 'Model A — Zone + weight tiers',
        blurb: 'Fixed price per (zone × weight bracket) from the tariff table below. Transparent and predictable; falls back to the legacy formula when a bracket is missing.',
        params: [{ key: 'minFee', label: 'Minimum fee (RWF)', placeholder: '2000' }],
    },
    {
        key: 'DISTANCE_WEIGHT',
        label: 'Model B — Distance + weight surcharge',
        blurb: 'fee = base + (road km × per-km) + (billed kg × per-kg), floored at the minimum. Tracks real delivery effort most closely.',
        params: [
            { key: 'baseFee', label: 'Base fee (RWF)', placeholder: '1000' },
            { key: 'perKmRate', label: 'Per km (RWF)', placeholder: '150' },
            { key: 'perKgRate', label: 'Per kg (RWF)', placeholder: '100' },
            { key: 'minFee', label: 'Minimum fee (RWF)', placeholder: '2000' },
        ],
    },
    {
        key: 'HYBRID_MARGIN',
        label: 'Model C — Hybrid with margin floor',
        blurb: 'fee = max(cost estimate × (1 + margin), minimum), rounded up to a clean number. Guarantees deliveries never run below margin.',
        params: [
            { key: 'fuelPerKm', label: 'Fuel/wear per km (RWF)', placeholder: '150' },
            { key: 'handlingFee', label: 'Handling per package (RWF)', placeholder: '500' },
            { key: 'perKgVariable', label: 'Variable per kg (RWF)', placeholder: '80' },
            { key: 'targetMargin', label: 'Target margin (0.25 = 25%)', placeholder: '0.25' },
            { key: 'minFee', label: 'Minimum fee (RWF)', placeholder: '2000' },
            { key: 'roundTo', label: 'Round fee up to (RWF)', placeholder: '100' },
        ],
    },
]

export default function ShippingStrategyForm() {
    const { getToken } = useAuth()
    const [active, setActive] = useState('LEGACY')
    const [params, setParams] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken])

    useEffect(() => {
        const load = async () => {
            try {
                const { data } = await axios.get('/api/admin/external-delivery-config', { headers: await authHeaders() })
                setActive(data.config?.activeStrategy || 'LEGACY')
                setParams(data.config?.strategyParams && typeof data.config.strategyParams === 'object' ? data.config.strategyParams : {})
            } catch {
                toast.error('Failed to load shipping strategy')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [authHeaders])

    const setParam = (strategy, key, value) => {
        setParams(prev => ({ ...prev, [strategy]: { ...(prev[strategy] || {}), [key]: value } }))
    }

    const save = async () => {
        setSaving(true)
        try {
            await axios.post('/api/admin/external-delivery-config', {
                activeStrategy: active,
                strategyParams: params,
            }, { headers: await authHeaders() })
            toast.success('Shipping strategy saved')
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return null

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 max-w-5xl">
            <p className="font-medium text-slate-700 mb-1 flex items-center gap-2">
                <ScaleIcon size={16} className="text-green-600" /> Shipping fee strategy
            </p>
            <p className="text-xs text-slate-400 mb-4">
                Governs pooled &amp; external delivery quotes. Corridor lane rates (Hubs &amp; Corridors) always take precedence for the sectors they cover; Standard shop delivery is free and unaffected.
            </p>

            <div className="space-y-2">
                {MODELS.map(model => (
                    <label key={model.key} className={`block rounded-xl border px-4 py-3 cursor-pointer transition ${active === model.key ? 'border-green-400 bg-green-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                        <span className="flex items-start gap-3">
                            <input
                                type="radio"
                                name="shipping-strategy"
                                checked={active === model.key}
                                onChange={() => setActive(model.key)}
                                className="mt-1 accent-green-600"
                            />
                            <span>
                                <span className="block text-sm font-medium text-slate-800">{model.label}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">{model.blurb}</span>
                            </span>
                        </span>
                        {active === model.key && model.params.length > 0 && (
                            <div className="mt-3 ml-7 grid gap-2 sm:grid-cols-3">
                                {model.params.map(p => (
                                    <div key={p.key}>
                                        <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{p.label}</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={params[model.key]?.[p.key] ?? ''}
                                            onChange={e => setParam(model.key, p.key, e.target.value)}
                                            placeholder={p.placeholder}
                                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-green-500 bg-white"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </label>
                ))}
            </div>

            <button onClick={save} disabled={saving} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 transition disabled:opacity-60">
                <SaveIcon size={14} /> {saving ? 'Saving…' : 'Save Strategy'}
            </button>
        </div>
    )
}
