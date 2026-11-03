/**
 * Protección CSRF para acciones y route handlers que modifican datos
 * (punto 9 del módulo 6.1).
 *
 * Se verifica el encabezado `Origin` o `Host` de la request contra el origen
 * esperado (NEXTAUTH_URL). Si no coincide, se rechaza con 403. Esto evita que
 * un sitio de terceros fuerce una mutación desde el navegador del usuario.
 *
 * Se usa en route handlers y Server Actions que escriben datos. Las peticiones
 * GET y las que no modifican estado no requieren esta verificación.
 */

import { env } from '@/lib/env'

/**
 * Extrae el origen esperado de NEXTAUTH_URL.
 */
function origenEsperado(): string {
  return env.NEXTAUTH_URL
}

/**
 * Valida que la request venga del origen esperado (Origin o Host).
 *
 * Lanza un error si la petición no pasa la verificación CSRF.
 *
 * @param origin Valor del encabezado `Origin` (puede ser undefined).
 * @param host Valor del encabezado `Host` (fallback si no hay Origin).
 * @param metodo Método HTTP. Se salta la verificación para métodos seguros (GET, HEAD, OPTIONS).
 */
export function verificarCsrf(
  origin: string | null | undefined,
  host: string | null | undefined,
  metodo: string,
): void {
  const metodosSeguros = new Set(['GET', 'HEAD', 'OPTIONS'])

  // Las peticiones que no modifican estado no necesitan protección CSRF.
  if (metodosSeguros.has(metodo.toUpperCase())) {
    return
  }

  const esperado = origenEsperado()

  // Intentar coincidir con Origin primero (es más confiable).
  if (origin) {
    const origenNormalizado = origin.endsWith('/') ? origin.slice(0, -1) : origin
    const esperadoNormalizado = esperado.endsWith('/') ? esperado.slice(0, -1) : esperado
    if (origenNormalizado === esperadoNormalizado) {
      return
    }
  }

  // Fallback: comparar Host contra el host de NEXTAUTH_URL.
  if (host) {
    const hostUrl = new URL(esperado)
    if (host === hostUrl.host) {
      return
    }
  }

  throw new Error('Verificación CSRF fallida: origen no permitido.')
}
