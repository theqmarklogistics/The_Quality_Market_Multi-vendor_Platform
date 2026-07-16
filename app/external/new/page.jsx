import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ExternalBookingForm from '@/components/external/ExternalBookingForm'
import DeliveryAccessInvite from '@/components/external/DeliveryAccessInvite'

export const dynamic = 'force-dynamic'

export default async function ExternalNewDeliveryPage() {
  const { userId } = await auth()
  if (!userId) return redirect('/sign-in')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  // Riders and agents may record a new walk-up delivery at the hub / their post.
  if (!user || (user.role !== 'EXTERNAL_SELLER' && user.role !== 'ADMIN' && user.role !== 'RIDER' && user.role !== 'AGENT')) {
    return <DeliveryAccessInvite redirectTo="/external/new" />
  }

  return <ExternalBookingForm />
}
