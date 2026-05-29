import prisma from '@/lib/prisma'
import { getAuth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LogisticsDashboardPage() {
  const { userId } = getAuth()
  if (!userId) return redirect('/sign-in')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || (user.role !== 'LOGISTICS_MANAGER' && user.role !== 'ADMIN')) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Unauthorized</h2>
        <p className="text-sm text-slate-600">You do not have access to the Logistics dashboard.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Logistics Dashboard</h1>
      <p className="mt-2 text-slate-600">Placeholder dashboard for `LOGISTICS_MANAGER` role.</p>
    </div>
  )
}
