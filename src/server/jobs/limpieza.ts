import { RiskSignalType, WhatsAppVerificationStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Limpieza diaria.
 *
 * Dos cosas que crecen para siempre si nadie las mira:
 *
 * - Verificaciones de WhatsApp que nadie completó. A los 15 minutos dejaron de
 *   servir; quedan `PENDING` y cualquier consulta que busque la última
 *   "pendiente" puede encontrar una muerta.
 * - Señales de IP de hace más de 30 días. La señal de "varias altas desde la
 *   misma IP" es para el momento del alta; un mes después la IP ya se reasignó
 *   y el dato no dice nada, pero sigue vinculando personas.
 *
 * No se tocan las verificaciones `VERIFIED` ni las señales de otras categorías:
 * esas son historia del perfil, no basura.
 */
export const jobLimpieza: Job = {
  name: 'limpieza',

  async run(ahora: Date): Promise<ResultadoJob> {
    const limite = new Date(ahora.getTime() - 30 * MS_POR_DIA)

    const [verificaciones, senales] = await prisma.$transaction([
      prisma.whatsAppVerification.updateMany({
        where: {
          status: WhatsAppVerificationStatus.PENDING,
          expiresAt: { lt: ahora },
        },
        data: { status: WhatsAppVerificationStatus.EXPIRED },
      }),
      prisma.riskSignal.deleteMany({
        where: {
          type: RiskSignalType.MULTIPLES_ALTAS_MISMA_IP,
          createdAt: { lt: limite },
        },
      }),
    ])

    return {
      procesados: verificaciones.count + senales.count,
      detalle: `${verificaciones.count} verificaciones, ${senales.count} señales`,
    }
  },
}
