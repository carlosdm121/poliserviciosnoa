import { SubscriptionStatus } from '@prisma/client'

import { enviarEmailAvisoVencimiento } from '@/lib/email'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getCurrentPlan } from '@/services/planes'
import { liberarEmail, reservarEmail } from '@/server/jobs/email-log'
import { avisoPara, claveDePeriodo, diasHasta } from '@/server/jobs/fechas'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Avisos previos al vencimiento.
 *
 * Mira una ventana de seis días y después decide con `avisoPara`. Consultar
 * exactamente "5 días" obligaría a que el cron y el vencimiento coincidan al
 * minuto, que no es cómo funciona un cron diario.
 *
 * El precio sale de `getCurrentPlan()`: si el admin lo cambia, el aviso muestra
 * el precio que se va a cobrar, no el que había cuando se suscribió. El monto
 * congelado sigue mandando para el cobro; para el aviso, lo que importa es qué
 * va a pasar mañana.
 */
export const jobAvisos: Job = {
  name: 'avisos-vencimiento',

  async run(ahora: Date): Promise<ResultadoJob> {
    const plan = await getCurrentPlan()

    if (!plan) {
      return { procesados: 0, errores: 1, detalle: 'no hay plan vigente' }
    }

    const hasta = new Date(ahora.getTime() + 6 * MS_POR_DIA)

    const suscripciones = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: ahora, lte: hasta },
      },
      orderBy: { currentPeriodEnd: 'asc' },
      select: {
        id: true,
        profileId: true,
        currentPeriodEnd: true,
        profile: {
          select: {
            name: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    })

    let procesados = 0
    let errores = 0

    for (const suscripcion of suscripciones) {
      const vence = suscripcion.currentPeriodEnd

      if (!vence) continue

      const aviso = avisoPara(diasHasta(ahora, vence))

      if (!aviso) continue

      const email = suscripcion.profile.user.email
      const nombre = suscripcion.profile.user.name ?? suscripcion.profile.name

      const reserva = await reservarEmail({
        profileId: suscripcion.profileId,
        email,
        template: `aviso_${aviso}`,
        // Por período, no por suscripción: el mes que viene tiene que volver a
        // avisar. Y por ventana, para que la corrida siguiente no lo repita.
        dedupeKey: `${suscripcion.id}:${claveDePeriodo(vence)}:${aviso}`,
      })

      if (!reserva) continue

      const envio = await enviarEmailAvisoVencimiento({
        email,
        nombre,
        precio: plan.precio,
        vence,
        dias: diasHasta(ahora, vence),
      })

      if (!envio.ok) {
        await liberarEmail(reserva)
        errores += 1
        logger.warn('cron: no se pudo enviar el aviso de vencimiento', {
          subscriptionId: suscripcion.id,
          aviso,
          error: envio.error,
        })
        continue
      }

      procesados += 1
    }

    return { procesados, errores }
  },
}
