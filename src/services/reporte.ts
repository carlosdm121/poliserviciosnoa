import { ReportReason, ReportStatus } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { registrarRiesgo } from '@/services/riesgo'
import {
  corteVentanaReportes,
  esMotivoReporteValido,
  MOTIVOS_REPORTE,
  REPORTES_PARA_SENAL,
  verificarLimiteReporte,
} from '@/lib/reporte'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Crea un reporte público de un perfil (visitante anónimo, sin login).
 *
 * Reglas:
 * - Rate limit: un reporte por IP y perfil por día.
 * - Dedupe: un visitante (IP hasheada) no reporta el mismo perfil dos veces
 *   en el mismo día.
 * - Varios reportes distintos al mismo perfil generan una RiskSignal para el
 *   administrador (señal, no bloqueo).
 *
 * `ipHash` sale de `ipHasheada()` en la ruta/acción, nunca de la IP en claro.
 */
export async function crearReporte(params: {
  slug: string
  motivo: ReportReason
  detalle?: string
  ipHash: string
  ahora: Date
}): Promise<Resultado<{ id: string }>> {
  if (!esMotivoReporteValido(params.motivo)) {
    return err('Motivo de reporte inválido.', ERROR_CODES.VALIDACION)
  }

  const limitado = await verificarLimiteReporte(params.ipHash, params.slug)

  if (limitado) {
    return err(
      'Ya enviaste un reporte para este perfil hoy.',
      ERROR_CODES.LIMITE_ALCANZADO,
    )
  }

  // Dedupe por día: mismo IP y perfil, mismo día UTC.
  const inicioDia = new Date(
    Date.UTC(
      params.ahora.getUTCFullYear(),
      params.ahora.getUTCMonth(),
      params.ahora.getUTCDate(),
    ),
  )

  const yaReportado = await prisma.report.findFirst({
    where: {
      reporterIpHash: params.ipHash,
      createdAt: { gte: inicioDia },
    },
    select: { id: true },
  })

  if (yaReportado) {
    return err(
      'Ya enviaste un reporte para este perfil hoy.',
      ERROR_CODES.LIMITE_ALCANZADO,
    )
  }

  const perfil = await prisma.profile.findFirst({
    where: { slug: params.slug },
    select: { id: true },
  })

  if (!perfil) {
    return err('Ese perfil no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    const reporte = await prisma.report.create({
      data: {
        profileId: perfil.id,
        reason: params.motivo,
        detail: params.detalle ?? null,
        reporterIpHash: params.ipHash,
        status: ReportStatus.PENDIENTE,
      },
      select: { id: true },
    })

    // Señal de abuso si varios visitantes distintos reportan el mismo perfil.
    await evaluarSenalReportes(perfil.id, params.ahora).catch(() => undefined)

    return ok({ id: reporte.id })
  } catch (error: unknown) {
    logger.error('reporte: no se pudo crear el reporte', {
      slug: params.slug,
      error: error instanceof Error ? error.message : String(error),
    })

    return err('No pudimos registrar el reporte. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Evalúa si un perfil merece una señal de riesgo por múltiples reportes.
 *
 * Señal, no bloqueo: varios visitantes reportando el mismo perfil es motivo
 * para que el administrador revise, no para suspender automáticamente.
 */
async function evaluarSenalReportes(profileId: string, ahora: Date): Promise<void> {
  const desde = corteVentanaReportes(ahora)

  const cantidad = await prisma.report.count({
    where: {
      profileId,
      createdAt: { gte: desde },
    },
  })

  if (cantidad < REPORTES_PARA_SENAL) return

  const yaSenalada = await prisma.riskSignal.findFirst({
    where: {
      profileId,
      type: 'REPORTES_MULTIPLES',
      resolvedAt: null,
      createdAt: { gte: desde },
    },
    select: { id: true },
  })

  if (yaSenalada) return

  await registrarRiesgo(profileId, 'REPORTES_MULTIPLES', {
    reportes24h: cantidad,
    umbral: REPORTES_PARA_SENAL,
  }).catch(() => undefined)
}

/** Texto legible de cada motivo, para la UI. */
export function textoMotivoReporte(motivo: ReportReason): string {
  return MOTIVOS_REPORTE[motivo]
}
