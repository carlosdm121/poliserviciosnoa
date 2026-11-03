/**
 * Reglas puras de reportes públicos (visitante anónimo, sin login).
 *
 * Un visitante reporta un perfil desde /p/[slug]. No hay sesión, así que se
 * identifica al visitante por su IP hasheada. Un reporte por visitante y
 * perfil por día, y varios reportes distintos generan una RiskSignal para el
 * administrador.
 */

import { ReportReason } from '@prisma/client'

import { rateLimit } from '@/lib/ratelimit'

/** Motivos válidos de reporte público. */
export const MOTIVOS_REPORTE: Record<ReportReason, string> = {
  DUDOSO: 'Perfil dudoso.',
  DATO_FALSO: 'Dato falso.',
  CONTENIDO_INADECUADO: 'Contenido inadecuado.',
  ESTAFO: 'Estafa.',
  OTRO: 'Otro motivo.',
}

/** Máximo de reportes de visitantes distintos antes de señalar al perfil. */
export const REPORTES_PARA_SENAL = 3

/** Ventana para agrupar reportes de un mismo perfil. */
export const VENTANA_REPORTES_MS = 24 * 60 * 60 * 1000

/** Clave de rate limit: un reporte por IP y perfil por día. */
export function claveRateLimitReporte(ipHash: string, slug: string): string {
  return `reporte:ip:${ipHash}:${slug}`
}

/** Ventana del rate limit en segundos (24 h). */
export const VENTANA_RATE_LIMIT_REPORTE_SEGUNDOS = 24 * 60 * 60

/**
 * Verifica el rate limit de reportes por IP.
 *
 * Devuelve { limitado: true } si el visitante ya reportó este perfil hoy.
 */
export async function verificarLimiteReporte(ipHash: string, slug: string) {
  const resultado = await rateLimit(
    claveRateLimitReporte(ipHash, slug),
    1,
    VENTANA_RATE_LIMIT_REPORTE_SEGUNDOS,
  )

  return resultado.limitado
}

/**
 * Fecha de corte: reportes más viejos que esta fecha ya no cuentan para la
 * señal de abuso.
 */
export function corteVentanaReportes(ahora: Date): Date {
  return new Date(ahora.getTime() - VENTANA_REPORTES_MS)
}

/**
 * Verifica que un motivo sea válido.
 */
export function esMotivoReporteValido(motivo: string): motivo is ReportReason {
  return Object.values(ReportReason).includes(motivo as ReportReason)
}
