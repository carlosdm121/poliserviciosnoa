import { ReclamoEstado } from '@prisma/client'

import { logger } from '@/lib/logger'
import { aplicarPoliticaSuspension } from '@/services/reclamo'
import { prisma } from '@/lib/prisma'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

/**
 * Política automática de suspensión por reclamos validados.
 *
 * Corre en el cron diario (módulo 2.7). Revisa todos los perfiles con al menos
 * 2 reclamos VALIDADOS en los últimos 90 días y aplica:
 * - 2 validados → advertencia por email.
 * - 3 validados → suspensión (SUSPENDED) + despublicado + revisión manual.
 *
 * Es idempotente: si ya se aplicó la suspensión, no se vuelve a aplicar.
 */
export const jobPoliticaSuspensionReclamos: Job = {
  name: 'politica-suspension-reclamos',

  async run(ahora: Date): Promise<ResultadoJob> {
    const desde = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Perfiles con al menos 2 reclamos VALIDADOS en los últimos 90 días.
    const perfiles = await prisma.reclamo.groupBy({
      by: ['profileId'],
      where: {
        estado: ReclamoEstado.VALIDADO,
        processedAt: { gte: desde },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 2 } },
      },
    })

    let procesados = 0

    for (const { profileId, _count } of perfiles) {
      try {
        await aplicarPoliticaSuspension(profileId)
        procesados += 1

        logger.info('cron: política de suspensión aplicada', {
          profileId,
          reclamosValidados: _count,
        })
      } catch (error: unknown) {
        logger.error('cron: falló la política de suspensión para un perfil', {
          profileId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { procesados }
  },
}
