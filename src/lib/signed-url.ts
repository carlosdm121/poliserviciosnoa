/**
 * URLs firmadas de corta duración para documentos privados (puntos 7 y 16).
 *
 * Los documentos y evidencias privadas (constancias de empresa, pruebas de
 * reclamo) se almacenan como recursos privados en Cloudinary. Nunca se sirve
 * una URL pública. En su lugar, se genera una URL firmada con un token que
 * expira y se verifica en el servidor antes de devolver el recurso.
 *
 * El token tiene este formato:
 *   base64url( JSON { r, exp, sig } )
 * donde r es el identificador del recurso, exp es la fecha de expiración y
 * sig es HMAC-SHA256 sobre r:exp con una clave secreta del entorno.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/** Vida máxima de una URL firmada (10 minutos por defecto). */
export const URL_FIRMADA_VIDA_SEGUNDOS = 10 * 60

/** Clave usada para firmar URLs de documentos privados. */
function claveFirma(): string {
  const clave = env.DATA_ENCRYPTION_KEY
  if (!clave) {
    throw new Error('DATA_ENCRYPTION_KEY es requerida para firmar URLs de documentos.')
  }
  return clave
}

/**
 * Genera una URL firmada para acceder a un documento privado.
 *
 * @param resourceId Identificador del recurso (publicId de Cloudinary o id de evidencia).
 * @param segundosVida Tiempo de vida en segundos (máximo 60 minutos).
 * @returns Token de firma que se agrega como query param `?signed=` a la URL del documento.
 */
export function firmarUrlDocumento(
  resourceId: string,
  segundosVida = URL_FIRMADA_VIDA_SEGUNDOS,
): string {
  const exp = Math.floor(Date.now() / 1000) + Math.min(segundosVida, 60 * 60)
  const mensaje = `${resourceId}:${exp}`
  const sig = createHmac('sha256', claveFirma()).update(mensaje).digest('base64url')

  const payload = { r: resourceId, exp, sig }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

/**
 * Valida un token de firma y devuelve el resourceId si es válido y no expiró.
 *
 * Lanza un error si el token está mal formado, expiró o la firma no coincide.
 *
 * @param token Token firmado generado por `firmarUrlDocumento`.
 * @returns resourceId del documento.
 */
export function validarUrlFirmada(token: string): string {
  let payload: { r: string; exp: number; sig: string }

  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    payload = JSON.parse(json)
  } catch {
    throw new Error('Token de URL firmada inválido.')
  }

  if (!payload || typeof payload.r !== 'string' || typeof payload.exp !== 'number' || typeof payload.sig !== 'string') {
    throw new Error('Token de URL firmada inválido: campos faltantes.')
  }

  // Verificar expiración.
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('Token de URL firmada expirado.')
  }

  // Verificar firma en tiempo constante.
  const mensaje = `${payload.r}:${payload.exp}`
  const sigEsperada = createHmac('sha256', claveFirma()).update(mensaje).digest('base64url')

  const bufferA = Buffer.from(payload.sig, 'utf8')
  const bufferB = Buffer.from(sigEsperada, 'utf8')

  if (bufferA.length !== bufferB.length) {
    throw new Error('Token de URL firmada inválido: firma incorrecta.')
  }

  if (!timingSafeEqual(bufferA, bufferB)) {
    throw new Error('Token de URL firmada inválido: firma incorrecta.')
  }

  return payload.r
}
