'use server'

import { redirect } from 'next/navigation'

import { enviarEmailVerificacion } from '@/lib/email'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { ipHasheada } from '@/lib/peticion'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/ratelimit'
import { crearTokenVerificacion } from '@/lib/verificacion-email'
import { emailSchema } from '@/schemas/contacto'

/** Reenvíos permitidos por hora, por IP y por email. */
const REENVIOS_POR_HORA = 3

const MENSAJE_ENVIADO = 'Si el email está registrado, te mandamos un enlace.'

function volver(mensaje: string, correcto: boolean): never {
  const clave = correcto ? 'ok' : 'error'

  redirect(`/reenviar-verificacion?${clave}=${encodeURIComponent(mensaje)}`)
}

/**
 * Reenvía el email de verificación.
 *
 * Responde siempre lo mismo exista o no la cuenta: la página no sirve para
 * averiguar qué emails están registrados.
 */
export async function reenviarVerificacion(datos: FormData): Promise<void> {
  const email = String(datos.get('email') ?? '').trim()

  const parseado = emailSchema.safeParse(email)
  if (!parseado.success) {
    return volver(parseado.error.issues[0]?.message ?? 'Revisá el email.', false)
  }

  const normalizado = parseado.data
  const ipHash = await ipHasheada()

  const [limiteIp, limiteEmail] = await Promise.all([
    rateLimit(`verificacion:ip:${ipHash}`, REENVIOS_POR_HORA, 3600),
    rateLimit(`verificacion:email:${hashValor(normalizado)}`, REENVIOS_POR_HORA, 3600),
  ])

  if (limiteIp.limitado || limiteEmail.limitado) {
    return volver('Probaste demasiadas veces. Esperá una hora.', false)
  }

  const usuario = await prisma.user.findUnique({
    where: { email: normalizado },
    select: { name: true, emailVerified: true },
  })

  if (usuario && !usuario.emailVerified) {
    try {
      const token = await crearTokenVerificacion(normalizado)

      await enviarEmailVerificacion({
        email: normalizado,
        nombre: usuario.name ?? 'bienvenido',
        token,
      })
    } catch (error) {
      logger.error('reenviarVerificacion: fallo el envío', { error })
      return volver('No pudimos enviar el email. Probá en un rato.', false)
    }
  }

  return volver(MENSAJE_ENVIADO, true)
}
