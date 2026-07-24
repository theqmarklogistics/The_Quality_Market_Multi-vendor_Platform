'use client'
import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import toast from "react-hot-toast"
import { useAuth } from "@clerk/nextjs"
import {
    Banknote, BarChart3, Bike, CircleDollarSign, CreditCard, Download, FileText,
    Package, RotateCcw, Store, Truck,
} from "lucide-react"
import Loading from "@/components/Loading"
import ReportChart from "./ReportChart"
import { formatValue } from "@/lib/reports/format"

// Resolve the catalog's icon *name* to a lucide component.
const ICONS = { CircleDollarSign, CreditCard, Banknote, Truck, Bike, Package, RotateCcw, Store }

// yyyy-mm-dd for <input type=date>, in local time.
function toInput(date) {
    const d = new Date(date)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 10)
}

function defaultRange() {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 29)
    return { from: toInput(from), to: toInput(to) }
}

const PRESETS = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: '12 months', days: 365 },
]

// Generic, role-agnostic reporting surface. It asks /api/reports/meta what the
// current user may see, then renders the selected report (KPIs + charts +
// tables) with date-range controls and PDF/CSV export. Mounted as-is by the
// admin, financial and seller report pages.
export default function ReportsView() {
    const { getToken } = useAuth()

    const [meta, setMeta] = useState(null)
    const [metaError, setMetaError] = useState(null)
    const [activeType, setActiveType] = useState(null)
    const [range, setRange] = useState(defaultRange)

    const [report, setReport] = useState(null)
    const [loading, setLoading] = useState(false)
    const [downloading, setDownloading] = useState(null)

    // 1) Load the catalogue for this user.
    useEffect(() => {
        (async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/reports/meta', { headers: { Authorization: `Bearer ${token}` } })
                setMeta(data)
                setActiveType(data.reports?.[0]?.type || null)
            } catch (error) {
                setMetaError(error?.response?.data?.error || error.message)
            }
        })()
    }, [getToken])

    // 2) Load the selected report whenever type or range changes.
    useEffect(() => {
        if (!activeType) return
        let cancelled = false
        setLoading(true)
        ;(async () => {
            try {
                const token = await getToken()
                const { data } = await axios.get('/api/reports', {
                    params: { type: activeType, from: range.from, to: range.to },
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!cancelled) setReport(data)
            } catch (error) {
                if (!cancelled) toast.error(error?.response?.data?.error || error.message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [activeType, range.from, range.to, getToken])

    const download = async (format) => {
        try {
            setDownloading(format)
            const token = await getToken()
            const res = await axios.get('/api/reports', {
                params: { type: activeType, from: range.from, to: range.to, format },
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            })
            const disposition = res.headers['content-disposition'] || ''
            const match = disposition.match(/filename="?([^"]+)"?/)
            const filename = match?.[1] || `${activeType}-report.${format}`
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Download failed')
        } finally {
            setDownloading(null)
        }
    }

    const applyPreset = (days) => {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - (days - 1))
        setRange({ from: toInput(from), to: toInput(to) })
    }

    // Group the report chips by business area for the picker.
    const grouped = useMemo(() => {
        const map = new Map()
        for (const r of meta?.reports || []) {
            if (!map.has(r.area)) map.set(r.area, [])
            map.get(r.area).push(r)
        }
        return [...map.entries()]
    }, [meta])

    if (metaError) {
        return (
            <div className="text-center py-20">
                <BarChart3 className="mx-auto text-slate-300" size={48} />
                <h2 className="mt-4 text-xl font-semibold text-slate-600">Reports unavailable</h2>
                <p className="text-slate-400 mt-2 text-sm">{metaError}</p>
            </div>
        )
    }
    if (!meta) return <Loading />

    return (
        <div className="text-slate-600">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl flex items-center gap-2">
                        <BarChart3 className="text-green-600" size={26} />
                        <span className="text-slate-800 font-medium">Reports</span>
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">{meta.scopeLabel}</p>
                </div>
                {report && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => download('pdf')}
                            disabled={downloading === 'pdf'}
                            className="flex items-center gap-2 text-sm bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition disabled:opacity-60"
                        >
                            <FileText size={16} /> {downloading === 'pdf' ? 'Preparing…' : 'PDF'}
                        </button>
                        <button
                            onClick={() => download('csv')}
                            disabled={downloading === 'csv'}
                            className="flex items-center gap-2 text-sm border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-60"
                        >
                            <Download size={16} /> {downloading === 'csv' ? 'Preparing…' : 'CSV'}
                        </button>
                    </div>
                )}
            </div>

            {/* Report picker */}
            <div className="mt-6 flex flex-col gap-3">
                {grouped.map(([area, reports]) => (
                    <div key={area}>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">{area}</p>
                        <div className="flex flex-wrap gap-2">
                            {reports.map((r) => {
                                const Icon = ICONS[r.icon] || BarChart3
                                const active = r.type === activeType
                                return (
                                    <button
                                        key={r.type}
                                        onClick={() => setActiveType(r.type)}
                                        title={r.description}
                                        className={`flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg border transition ${
                                            active
                                                ? 'bg-green-50 border-green-500 text-green-700'
                                                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon size={16} /> {r.title}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Date controls */}
            <div className="mt-6 flex flex-wrap items-center gap-3 border-y border-slate-100 py-3">
                <div className="flex items-center gap-2 text-sm">
                    <label className="text-slate-400">From</label>
                    <input type="date" value={range.from} max={range.to}
                        onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
                        className="border border-slate-200 rounded-md px-2 py-1.5" />
                    <label className="text-slate-400">To</label>
                    <input type="date" value={range.to} min={range.from} max={toInput(new Date())}
                        onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
                        className="border border-slate-200 rounded-md px-2 py-1.5" />
                </div>
                <div className="flex items-center gap-1.5">
                    {PRESETS.map((p) => (
                        <button key={p.label} onClick={() => applyPreset(p.days)}
                            className="text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 transition">
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            {loading || !report ? (
                <div className="py-20"><Loading /></div>
            ) : (
                <ReportBody report={report} />
            )}
        </div>
    )
}

function ReportBody({ report }) {
    const currency = report.currency || 'RWF'
    return (
        <div className="mt-6">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
                <h2 className="text-lg font-medium text-slate-800">{report.title}</h2>
                <span className="text-xs text-slate-400">{report.range?.label}</span>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
                {report.kpis.map((k, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-4 bg-white">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{k.label}</p>
                        <p className="text-xl font-semibold text-slate-800 mt-1.5">
                            {formatValue(k.value, k.format, currency)}
                        </p>
                    </div>
                ))}
            </div>

            {/* Sections */}
            <div className="mt-6 flex flex-col gap-6">
                {report.sections.map((section) => (
                    <div key={section.id} className="border border-slate-200 rounded-xl p-5">
                        <h3 className="text-sm font-medium text-slate-700 mb-3">{section.title}</h3>
                        {section.kind === 'timeseries' ? (
                            <ReportChart section={section} currency={currency} />
                        ) : (
                            <ReportTable section={section} currency={currency} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function ReportTable({ section, currency }) {
    const rows = section.rows || []
    if (!rows.length) {
        return <p className="text-sm text-slate-400 py-3">{section.note || 'No data for this period.'}</p>
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                        {section.columns.map((c) => (
                            <th key={c.key} className={`py-2 px-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-slate-50 hover:bg-slate-50/60">
                            {section.columns.map((c) => (
                                <td key={c.key} className={`py-2 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} text-slate-600`}>
                                    {formatValue(row[c.key], c.format, currency)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
