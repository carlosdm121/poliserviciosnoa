/**
 * Verificación de email del alta autoservicio.
 *
 * Reutiliza el modelo `VerificationToken` de Auth.js: `identifier` es el email
 * normalizado y `token` es el SHA-256 del token en claro. El token en claro
 * solo viaja en el enlace del email; nunca se guarda.
 *
 * El token vive 24 h. Al verificar, `User.emailVerified` queda con fecha. El
 * token usado no se borra: así abrir el enlace dos veces responde "ya estaba
 * verificado" en lugar de "enlace inválido". El job de limpieza lo borra
 * cuando vence.
 */

import { createHash, randomBytes } from 'node:crypto'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

/** Vida del token: 24 horas. */
export const TOKEN_VIDA_SEGUNDOS = 24 * 60 * 60

/** Longitud del token aleatorio en bytes. */
const TOKEN_LONGITUD_BYTES = 32

/** Resultado de abrir un enlace de verificación. */
export type EstadoVerificacion = 'VERIFICADO' | 'YA_VERIFICADO' | 'VENCIDO' | 'INVALIDO'

/** Token aleatorio en base64url: seguro para URL, sin `+`, `/` ni `=`. */
export function generarTokenVerificacion(): string {
  return randomBytes(TOKEN_LONGITUD_BYTES).toString('base64url')
}

/**
 * SHA-256 del token.
 *
 * Alcanza porque el token tiene 256 bits de entropía y el atacante no puede
 * elegir el preimage. Si se filtra la base, el hash no sirve para verificar.
 */
export function hashearTokenVerificacion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Fecha de vencimiento, separada para poder probarla sin base. */
export function fechaExpiracionToken(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + TOKEN_VIDA_SEGUNDOS * 1000)
}

/** Enlace que recibe el usuario por email. */
export function armarUrlVerificacion(token: string): string {
  return `${env.NEXTAUTH_URL}/verificar-email?token=${encodeURIComponent(token)}`
}

/**
 * Crea un token para el email y borra los anteriores.
 *
 * Un solo enlace válido a la vez: si el usuario pide reenvío, el email viejo
 * deja de servir.
 */
export async function crearTokenVerificacion(email: string): Promise<string> {
  const identifier = email.trim().toLowerCase()
  const token = generarTokenVerificacion()

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: hashearTokenVerificacion(token),
        expires: fechaExpiracionToken(),
      },
    }),
  ])

  return token
}

/**
 * Valida el token y marca el email como verificado.
 *
 * Es idempotente: si el email ya estaba verificado devuelve `YA_VERIFICADO`
 * sin tocar nada. Un token vencido se borra y devuelve `VENCIDO`.
 */
export async function verificarEmailConToken(token: string): Promise<EstadoVerificacion> {
  if (!token) return 'INVALIDO'

  const tokenHash = hashearTokenVerificacion(token)

  const registro = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  })

  if (!registro) return 'INVALIDO'

  const usuario = await prisma.user.findUnique({
    where: { email: registro.identifier },
    select: { id: true, emailVerified: true },
  })

  if (!usuario) {
    // La cuenta se borró después del alta: el token no sirve para nada.
    await prisma.verificationToken.deleteMany({
      where: { identifier: registro.identifier },
    })
    return 'INVALIDO'
  }

  // Se mira primero si ya estaba verificado: un enlace viejo de una cuenta ya
  // confirmada tiene que decir "ya estaba verificado", no "venció".
  if (usuario.emailVerified) return 'YA_VERIFICADO'

  if (registro.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token: tokenHash } })
    return 'VENCIDO'
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { emailVerified: new Date() },
  })

  return 'VERIFICADO'
}

/** Borra los tokens vencidos. Se llama desde el job diario de limpieza. */
export async function limpiarTokensVerificacion(ahora: Date = new Date()): Promise<number> {
  const resultado = await prisma.verificationToken.deleteMany({
    where: { expires: { lt: ahora } },
  })

  return resultado.count
}
