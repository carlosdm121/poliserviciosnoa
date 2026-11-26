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

export function hashearTokenVerificacion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function fechaExpiracionToken(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + TOKEN_VIDA_SEGUNDOS * 1000)
}

/** Enlace que recibe el usuario por email. */
export function armarUrlVerificacion(token: string): string {
  // Se recorta la barra final: `NEXTAUTH_URL=https://x.com/` armaría `//verificar-email`.
  const base = env.NEXTAUTH_URL.replace(/\/+$/, '')

  return `${base}/verificar-email?token=${encodeURIComponent(token)}`
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

  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier } })
    await tx.verificationToken.create({
      data: {
        identifier,
        token: hashearTokenVerificacion(token),
        expires: fechaExpiracionToken(),
      },
    })
  })

  return token
}

/** 
 * Valida el token y marca el email como verificado.
 * 
 * Devuelve un objeto con el estado y el email verificado.
 * 
 * Es idempotente: si el email ya estaba verificado devuelve `YA_VERIFICADO` sin tocar nada.
 * Un token vencido se borra y devuelve `VENCIDO`.
 */
export async function verificarEmailConToken(token: string): Promise<{ estado: EstadoVerificacion; email: string }> {
  if (!token) return { estado: 'INVALIDO', email: '' }

  const tokenHash = hashearTokenVerificacion(token)

  const registro = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  })

  if (!registro) return { estado: 'INVALIDO', email: '' }

  const usuario = await prisma.user.findUnique({
    where: { id: registro.identifier },
    select: { id: true, email: true, emailVerified: true },
  })

  if (!usuario) {
    // La cuenta se borró después del alta: el token no sirve para nada.
    await prisma.verificationToken.deleteMany({
      where: { identifier: registro.identifier },
    })
    return { estado: 'INVALIDO', email: '' }
  }

  // Se mira primero si ya estaba verificado: un enlace viejo de una cuenta ya
  // confirmada tiene que decir "ya estaba verificado", no "venció".
  if (usuario.emailVerified) {
    return { estado: 'YA_VERIFICADO', email: usuario.email }
  }

  if (registro.expires < new Date()) {
    await prisma.verificationToken.deleteMany({
      where: { token: tokenHash },
    })
    return { estado: 'VENCIDO', email: usuario.email }
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { emailVerified: new Date() },
  })

  return { estado: 'VERIFICADO', email: usuario.email }
}

/** Borra los tokens vencidos. Se llama desde el job diario de limpieza. */
export async function limpiarTokensVerificacion(ahora: Date = new Date()): Promise<number> {
  const resultado = await prisma.verificationToken.deleteMany({
    where: { expires: { lt: ahora } },
  })

  return resultado.count
}