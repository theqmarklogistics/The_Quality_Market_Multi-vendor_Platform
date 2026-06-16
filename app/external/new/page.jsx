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
  if (!user || (user.role !== 'EXTERNAL_SELLER' && user.role !== 'ADMIN')) {
    return <DeliveryAccessInvite />
  }

  return <ExternalBookingForm />
}
