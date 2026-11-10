/**
 * Protección CSRF basada en token (punto 7 del módulo 6.1).
 *
 * Cada acción de servidor que muta datos recibe un token que se valida contra
 * el valor almacenado en una cookie del cliente. El token viaja de la cookie
 * al servidor (never en la URL), así que un sitio de terceros no puede leerlo
 * ni inyectarlo en una petición falsificada.
 *
 * Las acciones de servidor críticas deben llamar a `validarTokenCsrf` al
 * inicio, junto con `requireRole`.
 *
 * Uso en una Server Action:
 *
 *   import { validarTokenCsrf } from '@/lib/csrf'
 *   export async function miAccion(csrfToken?: string) {
 *     if (!validarTokenCsrf(csrfToken)) throw new Error('Token CSRF inválido')
 *     ...
 *   }
 *
 * El token se genera al iniciar sesión y se pone en la cookie `csrf_token`
 * (httpOnly, secure, sameSite lax). No se expone al cliente por JS, pero
 * NextAuth / Next.js reenvía la cookie automáticamente en cada petición del
 * mismo origen, así que las Server Actions que se invocan desde formularios
 * del cliente pueden leerla con `cookies()` y pasarla como argumento.
 */

import { cookies } from 'next/headers'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const CSRF_TOKEN_NAME = 'csrf_token'

/** Genera un token CSRF criptográficamente seguro. */
export function generarTokenCsrf(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Valida el token recibido contra el guardado en la cookie `csrf_token`.
 *
 * @param tokenRecibido Valor enviado desde el cliente (puede ser undefined).
 * @returns `true` si ambos tokens existen y coinciden en tiempo constante.
 */
export async function validarTokenCsrf(tokenRecibido: string | null): Promise<boolean> {
  const cookieStore = await cookies()
  const tokenGuardado = cookieStore.get(CSRF_TOKEN_NAME)?.value

  if (!tokenRecibido || !tokenGuardado) return false

  try {
    return timingSafeEqual(
      Buffer.from(tokenRecibido, 'base64url'),
      Buffer.from(tokenGuardado, 'base64url'),
    )
  } catch {
    return false
  }
}

/**
 * Establece la cookie `csrf_token` con el valor indicado.
 *
 * @param token Token generado con `generarTokenCsrf`.
 */
export async function establecerCookieCsrf(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(CSRF_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}
