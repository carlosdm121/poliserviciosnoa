import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * Registro de jobs del cron diario.
 *
 * Cada job es una función idempotente con nombre, recibe la fecha y devuelve un
 * resumen. El registro existe para que los módulos 3.5, 4.3 y 4.4 agreguen un
 * job sin tocar el endpoint ni el orquestador: registran y listo.
 *
 * El aislamiento de errores es del orquestador, no de cada job. Un job que
 * olvida su try/catch no puede tumbar a los demás.
 */

export type ResultadoJob = {
  /** Filas que el job efectivamente procesó (no las que miró). */
  procesados: number
  /** Filas que fallaron y quedaron para la próxima corrida. */
  errores?: number
  /** Detalle corto para el JSON de respuesta. */
  detalle?: string
}

export type Job = {
  name: string
  run: (ahora: Date) => Promise<ResultadoJob>
}

export type ResumenJob = {
  job: string
  ok: boolean
  procesados: number
  errores: number
  duracionMs: number
  error?: string
  detalle?: string
}

export type ResumenCron = {
  ejecutadoEn: string
  ok: boolean
  jobs: ResumenJob[]
}

const jobs: Job[] = []

export function registrarJob(job: Job): void {
  if (jobs.some((registrado) => registrado.name === job.name)) {
    throw new Error(`El job "${job.name}" ya está registrado.`)
  }

  jobs.push(job)
}

export function jobsRegistrados(): readonly Job[] {
  return jobs
}

/**
 * Ejecuta todos los jobs.
 *
 * Secuencial a propósito: son pocos, comparten base y correrlos en paralelo
 * multiplica las conexiones sin ganar nada. Además, si el orden importa —avisos
 * antes de vencidas— el secuencial lo garantiza.
 *
 * `ahora` se inyecta para los tests y para poder ejecutar el cron con una fecha
 * distinta desde un script de verificación.
 */
export async function ejecutarTodos(ahora: Date = new Date()): Promise<ResumenCron> {
  const resumen: ResumenJob[] = []

  for (const job of jobs) {
    const inicio = Date.now()

    try {
      const resultado = await job.run(ahora)

      resumen.push({
        job: job.name,
        ok: true,
        procesados: resultado.procesados,
        errores: resultado.errores ?? 0,
        duracionMs: Date.now() - inicio,
        detalle: resultado.detalle,
      })

      await prisma.cronJobRun.create({
        data: {
          job: job.name,
          ok: true,
          procesados: resultado.procesados,
          errores: resultado.errores ?? 0,
          duracionMs: Date.now() - inicio,
          detalle: resultado.detalle ?? null,
        },
      })
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error)

      logger.error('cron: un job falló', { job: job.name, error: mensaje })

      resumen.push({
        job: job.name,
        ok: false,
        procesados: 0,
        errores: 1,
        duracionMs: Date.now() - inicio,
        error: mensaje,
      })

      await prisma.cronJobRun.create({
        data: {
          job: job.name,
          ok: false,
          procesados: 0,
          errores: 1,
          duracionMs: Date.now() - inicio,
          error: mensaje,
          detalle: null,
        },
      })
    }
  }

  return {
    ejecutadoEn: ahora.toISOString(),
    ok: resumen.every((job) => job.ok),
    jobs: resumen,
  }
}
