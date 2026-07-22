import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ReportsView from '@/components/reports/ReportsView'

export const dynamic = 'force-dynamic'

export default async function FinancialDashboardPage() {
  const { userId } = auth()
  if (!userId) return redirect('/sign-in')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || (user.role !== 'FINANCIAL_OPERATIONAL' && user.role !== 'ADMIN')) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Unauthorized</h2>
        <p className="text-sm text-slate-600">You do not have access to the Financial dashboard.</p>
      </div>
    )
  }

  // Financial operations see the money-facing reports platform-wide. The
  // reports API re-checks scope, so this page only needs the role gate.
  return (
    <div className="p-6">
      <ReportsView />
    </div>
  )
}
