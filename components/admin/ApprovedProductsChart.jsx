'use client'

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts'

export default function ApprovedProductsChart({ trend = [] }) {
    return (
        <div className="w-full h-[320px] text-xs">
            <h3 className="text-lg font-medium text-slate-800 mb-4">Approved Products Trend</h3>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickMargin={10} minTickGap={24} />
                    <YAxis yAxisId="left" tickFormatter={(value) => value.toLocaleString()} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                    <Tooltip
                        formatter={(value, name) => {
                            if (name === 'revenue') return [`Rwf ${Number(value || 0).toLocaleString()}`, 'Revenue']
                            if (name === 'unitsSold') return [Number(value || 0).toLocaleString(), 'Units sold']
                            if (name === 'orders') return [Number(value || 0).toLocaleString(), 'Orders']
                            return value
                        }}
                    />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="unitsSold" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}