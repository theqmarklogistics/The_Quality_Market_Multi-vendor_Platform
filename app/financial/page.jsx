import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Financial Operations Dashboard</h1>
      <p className="mt-2 text-slate-600">Placeholder dashboard for `FINANCIAL_OPERATIONAL` role.</p>
    </div>
  )
}
