import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verificarFirmaBaja } from '@/lib/invitacion'

export const dynamic = 'force-dynamic'

/**
 * Enlace firmado de baja de invitaciones a valorar.
 *
 * El cliente hace clic en el email sin estar logueado. La firma HMAC con
 * `CRON_SECRET` prueba que el enlace lo generó el servidor y no fue alterado.
 * Al validarse, se pone `voteInvitesOptOut = true` en el usuario y el cron de
 * invitaciones deja de enviarle emails.
 *
 * Una firma alterada no pasa la verificación en tiempo constante.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const sig = searchParams.get('sig')

  if (!clientId || !sig) {
    return NextResponse.json({ error: 'Enlace incompleto.' }, { status: 400 })
  }

  if (!verificarFirmaBaja(clientId, sig)) {
    logger.warn('invitacion: firma de baja invalida o alterada', { clientId })
    return NextResponse.json({ error: 'Enlace invalido.' }, { status: 401 })
  }

  const usuario = await prisma.user.findUnique({
    where: { id: clientId },
    select: { id: true, voteInvitesOptOut: true },
  })

  if (!usuario) {
    return NextResponse.json({ error: 'Enlace invalido.' }, { status: 401 })
  }

  if (!usuario.voteInvitesOptOut) {
    await prisma.user.update({
      where: { id: clientId },
      data: { voteInvitesOptOut: true },
    })
  }

  return NextResponse.redirect(`${env.NEXTAUTH_URL}/invitacion/dar-de-baja/ok`)
}
