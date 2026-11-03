/**
 * Tokens de recuperación de contraseña (punto 10 del módulo 6.1).
 *
 * Se guardan HASHEADOS (nunca en claro), son de un solo uso, vencen a los
 * 30-60 minutos y al usarse invalidan las sesiones (sessionVersion de User).
 *
 * El flujo:
 * 1. El usuario pide recuperación → se genera un token aleatorio, se hashea
 *    con SHA-256 y se guarda en PasswordResetToken con expiración.
 * 2. El token se envía por email al usuario.
 * 3. El usuario presenta el token + nueva contraseña → se hashea el token
 *    recibido, se compara con el hash guardado, se verifica que no esté
 *    usado ni expirado, se actualiza la contraseña, se marca el token como
 *    usado y se incrementa sessionVersion del usuario (invalidando sesiones
 *    previas).
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

/** Vida del token en segundos (30 minutos por defecto). */
export const TOKEN_VIDA_SEGUNDOS = 30 * 60

/** Longitud del token aleatorio en bytes. */
const TOKEN_LONGITUD_BYTES = 32

/**
 * Genera un token aleatorio criptográficamente seguro y su hash.
 *
 * @param userId ID del usuario al que pertenece el token.
 * @returns { token, expiresAt } El token en claro (para enviarlo por email)
 *   y la fecha de expiración. El hash se guarda en la base internamente.
 */
export async function crearTokenRecuperacion(userId: string): Promise<{
  token: string
  expiresAt: Date
}> {
  const token = randomBytes(TOKEN_LONGITUD_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_VIDA_SEGUNDOS * 1000)

  // Hashear el token antes de guardarlo. Nunca se guarda el token en claro.
  const tokenHash = await hashToken(token)

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      used: false,
    },
  })

  return { token, expiresAt }
}

/**
 * Valida un token de recuperación y devuelve el usuario si es válido.
 *
 * Lanza un error si el token no existe, ya se usó, expiró o no coincide.
 *
 * @param token Token en claro recibido del usuario.
 * @returns El usuario asociado al token.
 */
export async function validarTokenRecuperacion(token: string): Promise<{
  id: string
  email: string
}> {
  const tokenHash = await hashToken(token)

  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!registro) {
    throw new Error('Token de recuperación inválido.')
  }

  if (registro.used) {
    throw new Error('Token de recuperación ya fue usado.')
  }

  if (registro.expiresAt < new Date()) {
    throw new Error('Token de recuperación expirado.')
  }

  const usuario = registro.user

  return { id: usuario.id, email: usuario.email }
}

/**
 * Consume un token de recuperación: lo marca como usado y devuelve el userId.
 *
 * Debe llamarse tras verificar que la nueva contraseña se guardó correctamente,
 * para invalidar el token y evitar reusos.
 *
 * @param token Token en claro recibido del usuario.
 * @returns userId del usuario.
 */
export async function consumirTokenRecuperacion(token: string): Promise<string> {
  const tokenHash = await hashToken(token)

  const registro = await prisma.passwordResetToken.update({
    where: { tokenHash },
    data: { used: true },
    select: { userId: true },
  })

  return registro.userId
}

/**
 * Limpia tokens expirados o usados. Se llama periódicamente (cron diario).
 */
export async function limpiarTokensRecuperacion(): Promise<number> {
  const resultado = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ used: true }, { expiresAt: { lt: new Date() } }],
    },
  })

  return resultado.count
}

/**
 * Hashea un token de recuperación con SHA-256.
 *
 * SHA-256 alcanza aquí porque el token tiene 256 bits de entropia y el
 * atacante no puede elegir el preimage. Se usa hash (no cifrado reversible)
 * para que, si se filtra la base, el atacante no pueda recuperar los tokens.
 */
async function hashToken(token: string): Promise<string> {
  // Usar crypto.subtle no está disponible en Node sin Web Crypto; usar node:crypto.
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Invalida todas las sesiones del usuario incrementando sessionVersion.
 *
 * Se llama al usar un token de recuperación (punto 10): las sesiones
 * previas dejan de ser válidas porque el sessionVersion del token JWT
 * ya no coincide con el de la base.
 */
export async function invalidarSesionesUsuario(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  })
}
