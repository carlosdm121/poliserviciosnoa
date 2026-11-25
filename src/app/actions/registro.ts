'use server'

import { Prisma } from '@prisma/client'
import { headers } from 'next/headers'

import { ipHasheada } from '@/lib/peticion'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/ratelimit'
import { encryptField } from '@/lib/db/encrypt'
import { generarSlugPerfil } from '@/lib/constantes'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { hashearPassword } from '@/lib/password'
import { estaBloqueado } from '@/services/bloqueo'
import { esEmailDesechable, registrarAltaDesdeIp, registrarRiesgo } from '@/services/riesgo'
import { registroProfesionalSchema, type RegistroProfesionalInput } from '@/schemas'
import { guardarPerfilEnTx } from '@/services/perfil'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** Máximo de altas de profesional por IP y hora. Evita crear cuentas en masa. */
const ALTAS_POR_IP_Y_HORA = 5

/**
 * Alta de profesional.
 *
 * Aplica las reglas que no se pueden dejar solo en el formulario:
 * 1. El email es único. La base lo impone con P2002, pero se traduce a un
 *    mensaje útil en vez de dejar que estalle la excepción.
 * 2. El WhatsApp es único en toda la plataforma. Dos perfiles con el mismo
 *    número es un problema de confianza: los clientes no saben a cuál le
 *    escriben.
 * 3. Se crea el `Profile` junto al `User` en una transacción: un usuario sin
 *    perfil no puede hacer nada y queda como basura.
 *
 * El perfil nace sin publicar: falta verificar WhatsApp, pagar y completar
 * los datos. Ver `services/publicacion.ts`.
 */
export async function registrarProfesional(
  data: RegistroProfesionalInput,
): Promise<Resultado<{ email: string }>> {
  // La IP se lee acá y no viene del formulario: si la mandara el cliente,
  // cualquiera la falsea y la señal de altas múltiples no sirve para nada.
  const ip = await ipDelRequest()
  const ipHash = ip ? await ipHasheada() : 'desconocida'

  const limiteAlta = await rateLimit(`alta:ip:${ipHash}`, ALTAS_POR_IP_Y_HORA, 3600)

  if (limiteAlta.limitado) {
    logger.warn('registro: límite de altas por IP alcanzado', { ipHash })
    return err(
      'Demasiados intentos de registro desde esta conexión. Probá más tarde.',
      ERROR_CODES.RATE_LIMIT,
    )
  }

  // Validar en el servidor aunque el formulario ya haya validado: el cliente
  // se puede manipular, y esta es la única frontera real.
  const parseado = registroProfesionalSchema.safeParse(data)
  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos del formulario.', ERROR_CODES.VALIDACION)
  }

  // Esquema plano: { ...perfil, email, password, whatsapp, aceptaTerminos }
  const { email, password, whatsapp, aceptaTerminos, ...perfil } = parseado.data
  const { name } = perfil

  if (!aceptaTerminos) {
    return err('Para crear la cuenta tenés que aceptar los términos.', ERROR_CODES.VALIDACION)
  }

  // Rubros: están en perfil.catalogo. Validar contra la base antes de crear.
  const { primaryCategoryId, secondaryCategoryId } = perfil.catalogo
  const rubrosSolicitados = [primaryCategoryId, secondaryCategoryId].filter(
    (valor): valor is string => Boolean(valor),
  )

  const rubrosValidos = await prisma.category.findMany({
    where: { id: { in: rubrosSolicitados }, isActive: true },
    select: { id: true },
  })

  if (rubrosValidos.length !== new Set(rubrosSolicitados).size) {
    return err(
      'Alguno de los rubros no existe o está desactivado.',
      ERROR_CODES.VALIDACION,
    )
  }

  if (secondaryCategoryId && secondaryCategoryId === primaryCategoryId) {
    return err(
      'El rubro secundario tiene que ser distinto del principal.',
      ERROR_CODES.VALIDACION,
    )
  }

  // Lista de bloqueo.
  const [emailBloqueado, whatsappBloqueado] = await Promise.all([
    estaBloqueado('EMAIL', email),
    estaBloqueado('WHATSAPP_HASH', whatsapp),
  ])

  if (emailBloqueado || whatsappBloqueado) {
    logger.warn('registro: intento con identificador bloqueado', { email, whatsapp })

    return err(
      'No pudimos crear la cuenta con esos datos. Escribinos y lo revisamos.',
      ERROR_CODES.SIN_PERMISOS,
    )
  }

  // Slug único.
  const slug = generarSlugPerfil(name)

  // Dentro de una única transacción: User + Profile + guardarPerfilEnTx.
  try {
    await prisma.$transaction(async (tx) => {
      // 1. User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await hashearPassword(password),
          name,
          role: 'PROFESSIONAL',
          emailVerified: null,
          signupIpHash: ip ? hashValor(ip) : null,
        },
      })

      // 2. Profile (mínimo)
      const profile = await tx.profile.create({
        data: {
          userId: user.id,
          name,
          slug,
          whatsappE164: encryptField(whatsapp),
          whatsappHash: hashValor(whatsapp),
          type: perfil.type,
          moderationStatus: 'PENDING_REVIEW',
        },
      })

      // 3. Perfil completo (rubros, ubicación, empresa, etc.)
      await guardarPerfilEnTx(tx, profile.id, perfil)
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const objetivo = error.meta?.target

      if (Array.isArray(objetivo) && objetivo.includes('email')) {
        return err(
          'Ya existe una cuenta con ese email. Probá entrar en lugar de registrarte.',
          ERROR_CODES.DUPLICADO,
        )
      }

      if (Array.isArray(objetivo) && (objetivo.includes('whatsappE164') || objetivo.includes('whatsapp'))) {
        return err(
          'Ese número de WhatsApp ya está en un perfil. Cada número puede tener un solo perfil.',
          ERROR_CODES.DUPLICADO,
        )
      }

      if (Array.isArray(objetivo) && objetivo.includes('cuit')) {
        return err(
          'Ese CUIT ya está en otro perfil. Cada empresa puede tener un solo perfil.',
          ERROR_CODES.DUPLICADO,
        )
      }
    }

    logger.error('registroProfesional: error inesperado', { error, email })
    return err('No pudimos crear tu cuenta. Probá de nuevo en un rato.', ERROR_CODES.DESCONOCIDO)
  }

  // Email de verificación (fuera de la transacción). Si falla, rollback borrando usuario.
  try {
    const { crearTokenVerificacion } = await import('@/lib/verificacion-email')
    const token = await crearTokenVerificacion(email)

    const { enviarEmailVerificacion } = await import('@/lib/email')
    await enviarEmailVerificacion({ email, nombre: name, token })
  } catch (error: unknown) {
    try {
      await prisma.user.delete({ where: { email } })
    } catch (rollbackError) {
      logger.error('registroProfesional: rollback fallido', { originalError: error, rollbackError })
    }
    logger.error('registroProfesional: no se pudo enviar el email de verificación', { error })
    return err('No pudimos crear tu cuenta. Probá de nuevo en un rato.', ERROR_CODES.ERROR_EXTERNO)
  }

  // Señales de riesgo.
  await registrarRiesgoDelAlta(email, ip).catch(() => {})

  return ok({ email })
}

/**
 * IP del cliente.
 *
 * Solo para hashear y contar altas. No es confiable al 100% —delante de Vercel
 * hay proxies— pero sirve para detectar veinte cuentas desde la misma conexión,
 * que es el patrón que se busca.
 */
async function ipDelRequest(): Promise<string | undefined> {
  const headersList = await headers()

  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    undefined
  )
}

/**
 * Señales de riesgo de un alta.
 *
 * Ninguna bloquea el registro: son contexto para que alguien mire. Un email
 * desechable no es prueba de nada —muchos profesionales legítimos se registran
 * con uno sin pensar— y bloquear por eso deja fuera a gente que iba a trabajar.
 */
async function registrarRiesgoDelAlta(email: string, ip?: string): Promise<void> {
  const perfil = await prisma.profile.findFirst({
    where: { user: { email } },
    select: { id: true },
  })

  if (!perfil) return

  if (esEmailDesechable(email)) {
    const dominio = email.slice(email.lastIndexOf('@') + 1).toLowerCase()

    await registrarRiesgo(perfil.id, 'EMAIL_DESECHABLE', { dominio })
  }

  await registrarAltaDesdeIp(ip ? hashValor(ip) : null, perfil.id)
}
