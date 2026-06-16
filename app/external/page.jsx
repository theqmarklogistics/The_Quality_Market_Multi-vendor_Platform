import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ExternalDashboard from '@/components/external/ExternalDashboard'

export const dynamic = 'force-dynamic'

export default async function ExternalPartnerPage() {
  const { userId } = await auth()
  if (!userId) return redirect('/sign-in')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || (user.role !== 'EXTERNAL_SELLER' && user.role !== 'ADMIN')) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Unauthorized</h2>
        <p className="text-sm text-slate-600">You do not have access to the delivery partner portal.</p>
      </div>
    )
  }

  return <ExternalDashboard />
}
