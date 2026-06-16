import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import DispatchBoard from '@/components/logistics/DispatchBoard'
import authLogistics from '@/middlewares/authLogistics'

export const dynamic = 'force-dynamic'

export default async function LogisticsDashboardPage() {
  const { userId } = await auth()
  if (!userId) return redirect('/sign-in')

  // Logistics managers and admins (DB role ADMIN or an ADMIN_EMAIL match) get in,
  // matching how the /api/logistics/* routes authorize.
  if (!(await authLogistics(userId))) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Unauthorized</h2>
        <p className="text-sm text-slate-600">You do not have access to the Logistics dashboard.</p>
      </div>
    )
  }

  return <DispatchBoard />
}
