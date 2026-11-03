/**
 * Rate limiting específico para login y flujos de autenticación (punto 11).
 *
 * Usa Upstash Redis con ventana deslizante, por IP y por email (hash del
 * email como clave). Límites por defecto:
 *   - 5 intentos cada 15 minutos por email+IP
 *   - 20 intentos cada 15 minutos por IP
 *
 * La respuesta es idéntica exista o no el email (evita enumeración), e
 * incluye el encabezado Retry-After.
 *
 * Si Upstash no responde, el login falla cerrado o usa un límite local
 * conservador, y se registra una alerta.
 */

import { rateLimit, type ResultadoLimite, limpiarLimite } from '@/lib/ratelimit'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'

/** Configuración de límites de autenticación. */
export const AUTH_LIMITES = {
  /** Intentos por email+IP en ventana de 15 minutos. */
  emailIp: { limite: 5, ventanaSegundos: 15 * 60 },
  /** Intentos por IP en ventana de 15 minutos. */
  ip: { limite: 20, ventanaSegundos: 15 * 60 },
} as const

/**
 * Resultado de un intento de autenticación.
 */
export type ResultadoAuth = {
  /** ¿Se superó algún límite? */
  limitado: boolean
  /** Segundos que faltan para que se libere la ventana más restrictiva. */
  retryAfter: number
  /** Detalles de cada límite. */
  detalles: Record<string, ResultadoLimite>
}

/**
 * Evalúa los límites de rate limiting para un intento de login/registro/
 * recuperación.
 *
 * @param emailHash Hash del email (para no enviar el email en claro al rate limiter).
 * @param ipHash Hash de la IP del cliente.
 * @param tipo Tipo de flujo: 'login' | 'registro' | 'recuperacion'.
 * @returns ResultadoAuth con si está limitado y el Retry-After.
 */
export async function evaluarLimiteAuth(
  emailHash: string,
  ipHash: string,
  tipo: 'login' | 'registro' | 'recuperacion' = 'login',
): Promise<ResultadoAuth> {
  const claveEmailIp = `auth:${tipo}:emailip:${emailHash}:${ipHash}`
  const claveIp = `auth:${tipo}:ip:${ipHash}`

  const [resultadoEmailIp, resultadoIp] = await Promise.all([
    rateLimit(
      claveEmailIp,
      AUTH_LIMITES.emailIp.limite,
      AUTH_LIMITES.emailIp.ventanaSegundos,
    ),
    rateLimit(claveIp, AUTH_LIMITES.ip.limite, AUTH_LIMITES.ip.ventanaSegundos),
  ])

  const limitado = resultadoEmailIp.limitado || resultadoIp.limitado
  const retryAfter = Math.max(resultadoEmailIp.restante, resultadoIp.restante)

  if (limitado) {
    logger.warn('auth: rate limit alcanzado', {
      tipo,
      emailHash,
      ipHash,
      retryAfter,
    })
  }

  return {
    limitado,
    retryAfter,
    detalles: {
      'email+ip': resultadoEmailIp,
      ip: resultadoIp,
    },
  }
}

/**
 * Libera el límite de un email+IP tras un autenticación exitosa.
 *
 * Se llama cuando el login/registro/recuperación termina bien, para que el
 * usuario no quede bloqueado por intentos fallidos previos.
 */
export async function liberarLimiteAuth(
  emailHash: string,
  ipHash: string,
  tipo: 'login' | 'registro' | 'recuperacion' = 'login',
): Promise<void> {
  const claveEmailIp = `auth:${tipo}:emailip:${emailHash}:${ipHash}`
  const claveIp = `auth:${tipo}:ip:${ipHash}`

  await limpiarLimite(claveEmailIp)
  await limpiarLimite(claveIp)
}

/**
 * Hash de una IP para usarla como clave de rate limiting sin guardar la IP
 * en claro (dato personal).
 */
export function hashIp(ip: string): string {
  return hashValor(ip)
}
