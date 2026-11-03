import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { ejecutarCron } from '@/server/jobs'

/**
 * Cron diario.
 *
 * Corre a las 12:00 UTC, que son las 09:00 en Argentina (UTC-3, sin horario de
 * verano). Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`; el mismo
 * header sirve para ejecutarlo a mano.
 *
 * Responde 200 aunque un job haya fallado: el resumen dice cuál falló y Vercel
 * no reintenta el endpoint entero. Reintentar todo por un job que falla
 * multiplicaría emails y trabajo. Los jobs que fallan se reintentan solos en la
 * próxima corrida porque son idempotentes.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(request: Request): boolean {
  const recibido = Buffer.from(request.headers.get('authorization') ?? '')
  const esperado = Buffer.from(`Bearer ${env.CRON_SECRET}`)

  if (recibido.length !== esperado.length) return false

  return timingSafeEqual(recibido, esperado)
}

export async function GET(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const resumen = await ejecutarCron()

    logger.info('cron diario: terminado', {
      ok: resumen.ok,
      jobs: resumen.jobs.map((job) => ({
        job: job.job,
        ok: job.ok,
        procesados: job.procesados,
        errores: job.errores,
      })),
    })

    return NextResponse.json(resumen, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    logger.error('cron diario: falló el orquestador', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json({ error: 'Error al ejecutar el cron' }, { status: 500 })
  }
}
