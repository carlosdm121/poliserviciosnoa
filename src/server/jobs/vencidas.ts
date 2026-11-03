import { SubscriptionStatus } from '@prisma/client'

import { enviarEmailPerfilDespublicado } from '@/lib/email'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getCurrentPlan } from '@/services/planes'
import { sincronizarPublicacion } from '@/services/publicacion'
import { liberarEmail, reservarEmail } from '@/server/jobs/email-log'
import { claveDePeriodo } from '@/server/jobs/fechas'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

type SuscripcionAVencer = {
  id: string
  profileId: string
  currentPeriodEnd: Date | null
  profile: {
    name: string
    user: { email: string; name: string | null }
  }
}

/**
 * Suscripciones que dejaron de estar vigentes.
 *
 * Dos caminos terminan en lo mismo:
 *
 * - `ACTIVE` con el período pagado vencido: no se renovó.
 * - `PAST_DUE` con la gracia vencida: se intentó cobrar y no entró.
 *
 * En los dos casos se pasa a `EXPIRED` y se despublica. Se marca `EXPIRED` y no
 * `CANCELLED` porque nadie la canceló: se terminó. La baja voluntaria es
 * `cancelAtPeriodEnd` y también termina acá cuando llega la fecha.
 *
 * El `updateMany` con el estado en el `where` es la barrera de idempotencia:
 * si dos ejecuciones se cruzan, una sola gana y la otra no manda el email.
 */
export const jobVencidas: Job = {
  name: 'vencidas',

  async run(ahora: Date): Promise<ResultadoJob> {
    // Si no hay plan vigente, el email explica la reactivación sin inventar un
    // monto. No es motivo para no expirar: la suscripción ya venció igual.
    const plan = await getCurrentPlan()
    const precio = plan?.precio ?? null

    const vencidas = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lt: ahora },
      },
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

    for (const suscripcion of vencidas) {
      const expire = await expirar(suscripcion, ahora, { precio })

      procesados += expire.procesado ? 1 : 0
      errores += expire.error ? 1 : 0
    }

    const enGracia = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        graceUntil: { lt: ahora },
      },
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

    for (const suscripcion of enGracia) {
      const expire = await expirar(suscripcion, ahora, { precio, gracia: true })

      procesados += expire.procesado ? 1 : 0
      errores += expire.error ? 1 : 0
    }

    return { procesados, errores }
  },
}

async function expirar(
  suscripcion: SuscripcionAVencer,
  ahora: Date,
  opciones: { precio: string | null; gracia?: boolean },
): Promise<{ procesado: boolean; error: boolean }> {
  const desde = opciones.gracia ? SubscriptionStatus.PAST_DUE : SubscriptionStatus.ACTIVE

  const cambio = await prisma.subscription.updateMany({
    where: { id: suscripcion.id, status: desde },
    data: {
      status: SubscriptionStatus.EXPIRED,
      graceUntil: null,
      pastDueSince: null,
    },
  })

  if (cambio.count === 0) {
    return { procesado: false, error: false }
  }

  const sincronizacion = await sincronizarPublicacion(suscripcion.profileId)

  if (!sincronizacion.ok) {
    logger.warn('cron: se venció la suscripción pero no se pudo despublicar', {
      subscriptionId: suscripcion.id,
      error: sincronizacion.error,
    })
  }

  const email = suscripcion.profile.user.email
  const nombre = suscripcion.profile.user.name ?? suscripcion.profile.name

  const reserva = await reservarEmail({
    profileId: suscripcion.profileId,
    email,
    template: 'perfil_despublicado',
    dedupeKey: `${suscripcion.id}:${claveDePeriodo(suscripcion.currentPeriodEnd ?? ahora)}`,
  })

  if (!reserva) {
    return { procesado: true, error: false }
  }

  const envio = await enviarEmailPerfilDespublicado({ email, nombre, precio: opciones.precio })

  if (!envio.ok) {
    await liberarEmail(reserva)
    logger.warn('cron: no se pudo avisar que el perfil fue despublicado', {
      subscriptionId: suscripcion.id,
      error: envio.error,
    })

    return { procesado: true, error: true }
  }

  return { procesado: true, error: false }
}
