import { enviarEmailAlertaSLA } from '@/lib/email'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'
import { ticketsFueraDeSLA } from '@/services/soporte'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

/**
 * Alerta de SLA de soporte.
 *
 * Revisa los tickets abiertos o en curso que superaron el plazo de primera
 * respuesta (24 h hábiles) o de resolución (72 h hábiles) y avisa por email
 * al buzón de soporte para que alguien los atienda.
 *
 * Es idempotente: cada corrida vuelve a calcular desde cero y solo avisa de
 * lo que sigue vencido. Un ticket que ya se respondió no aparece.
 */
export const jobSLA: Job = {
  name: 'sla-soporte',

  async run(ahora: Date): Promise<ResultadoJob> {
    const { sinPrimeraRespuesta, sinResolver } = await ticketsFueraDeSLA(ahora)

    const total = sinPrimeraRespuesta.length + sinResolver.length

    if (total === 0) {
      return { procesados: 0, detalle: 'sin tickets fuera de SLA' }
    }

    const destinatario =
      env.contactEmail ?? 'contacto@poliserviciosnoa.com'

    const envios = []

    if (sinPrimeraRespuesta.length > 0) {
      envios.push(
        enviarEmailAlertaSLA({
          email: destinatario,
          tipo: 'primera_respuesta',
          tickets: sinPrimeraRespuesta,
        }),
      )
    }

    if (sinResolver.length > 0) {
      envios.push(
        enviarEmailAlertaSLA({
          email: destinatario,
          tipo: 'resolucion',
          tickets: sinResolver,
        }),
      )
    }

    const resultados = await Promise.allSettled(envios)
    const errores = resultados.filter(
      (r) => r.status === 'rejected',
    ).length

    logger.info('cron: SLA de soporte', {
      sinPrimeraRespuesta: sinPrimeraRespuesta.length,
      sinResolver: sinResolver.length,
      errores,
    })

    return { procesados: total, errores }
  },
}
