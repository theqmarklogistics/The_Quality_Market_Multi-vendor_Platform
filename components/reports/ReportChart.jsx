'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatValue } from '@/lib/reports/format'

// Renders a report time-series section as a filled area chart. Matches the
// existing OrdersAreaChart look (indigo stroke/fill), with tooltip + axis
// values formatted via the shared report formatter.
export default function ReportChart({ section, currency = 'RWF' }) {
    const data = (section?.data || []).map((p) => ({ date: p.x, value: p.y }))
    const fmt = section?.valueFormat || 'number'

    if (!data.length) {
        return (
            <p className="text-sm text-slate-400 py-8 text-center">No data to chart for this period.</p>
        )
    }

    const compact = (v) =>
        fmt === 'currency' && v >= 1000 ? `${Math.round(v / 1000)}k` : Number(v).toLocaleString('en-RW')

    return (
        <div className="w-full h-[280px] text-xs">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                    <defs>
                        <linearGradient id="reportFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.03} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} tickFormatter={compact} allowDecimals={false} />
                    <Tooltip
                        formatter={(value) => [formatValue(value, fmt, currency), section.title]}
                        labelFormatter={(label) => formatValue(label, 'date', currency)}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} fill="url(#reportFill)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
