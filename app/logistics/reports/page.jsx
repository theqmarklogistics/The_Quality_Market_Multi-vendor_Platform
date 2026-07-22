import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import authLogistics from '@/middlewares/authLogistics'
import ReportsView from '@/components/reports/ReportsView'

export const dynamic = 'force-dynamic'

// Logistics reporting. Gated by authLogistics (LOGISTICS_MANAGER or ADMIN),
// mirroring the dispatch board and the /api/logistics/* routes. The reports API
// re-checks scope, so this page only needs the role gate; a logistics manager
// sees the platform-wide Deliveries & Logistics report.
export default async function LogisticsReportsPage() {
    const { userId } = await auth()
    if (!userId) return redirect('/sign-in')

    if (!(await authLogistics(userId))) {
        return (
            <div className="p-6">
                <h2 className="text-xl font-semibold">Unauthorized</h2>
                <p className="text-sm text-slate-600">You do not have access to logistics reports.</p>
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
            <ReportsView />
        </div>
    )
}
