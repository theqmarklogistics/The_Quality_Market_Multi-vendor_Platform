import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import DispatchBoard from '@/components/logistics/DispatchBoard'

export const dynamic = 'force-dynamic'

export default async function LogisticsDashboardPage() {
  const { userId } = await auth()
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

  return <DispatchBoard />
}
