'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Accepts either:
//   - allOrdersDaily: [{ day: ISO-date, count: number, total: number }] (new bucketed API)
//   - allOrders:      [{ createdAt: ISO-date, total: number }, ...]      (legacy raw rows)
// Falls back to the legacy aggregation if the new shape is not present, so
// the dashboard keeps rendering while the API contract is migrating.
export default function OrdersAreaChart({ allOrders, allOrdersDaily }) {
    let chartData = []

    if (Array.isArray(allOrdersDaily) && allOrdersDaily.length >= 0) {
        chartData = allOrdersDaily.map(row => ({
            date: new Date(row.day).toISOString().split('T')[0],
            orders: Number(row.count) || 0
        }))
    } else if (Array.isArray(allOrders)) {
        // Legacy path — group raw order rows by date.
        const ordersPerDay = allOrders.reduce((acc, order) => {
            const date = new Date(order.createdAt).toISOString().split('T')[0]
            acc[date] = (acc[date] || 0) + 1
            return acc
        }, {})
        chartData = Object.entries(ordersPerDay).map(([date, count]) => ({
            date,
            orders: count
        }))
    }

    return (
        <div className="w-full max-w-4xl h-[300px] text-xs">
            <h3 className="text-lg font-medium text-slate-800 mb-4 pt-2 text-right"> <span className='text-slate-500'>Orders /</span> Day</h3>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} label={{ value: 'Orders', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="orders" stroke="#4f46e5" fill="#8884d8" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
