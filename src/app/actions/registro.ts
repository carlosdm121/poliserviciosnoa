'use server'

import { Prisma } from '@prisma/client'
import { headers } from 'next/headers'

import { ipHasheada } from '@/lib/peticion'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/ratelimit'
import { generarSlugPerfil } from '@/lib/constantes'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { hashearPassword } from '@/lib/password'
import { estaBloqueado } from '@/services/bloqueo'
import { esEmailDesechable, registrarAltaDesdeIp, registrarRiesgo } from '@/services/riesgo'
import { registroProfesionalSchema, type RegistroProfesionalInput } from '@/schemas'
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
  entrada: RegistroProfesionalInput,
): Promise<Resultado<{ email: string }>> {
  // La IP se lee acá y no viene del formulario: si la mandara el cliente,
  // cualquiera la falsea y la señal de altas múltiples no sirve para nada.
  const ip = ipDelRequest()
  const ipHash = ip ? ipHasheada() : 'desconocida'

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
  const parseado = registroProfesionalSchema.safeParse(entrada)
  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos del formulario.', ERROR_CODES.VALIDACION)
  }

  const { name, email, password, whatsapp } = parseado.data

  /**
   * Lista de bloqueo.
   *
   * Se consulta antes de crear nada. Un email o un teléfono bloqueados son de
   * cuentas suspendidas por fraude, y el mensaje tiene que ser el mismo para
   * los dos: si el de teléfono dijera "ya está en otro perfil", el tramposo
   * sabe que el número es real y solo tiene que cambiar el email.
   */
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

  // El slug es único y obligatorio en la base. Se genera acá y no se acepta
  // del cliente: un slug elegido a mano puede colisionar o quedar feo en la
  // URL pública.
  const slug = generarSlugPerfil(name)

  // El rol se define acá y no viene del cliente: si el formulario mandara el
  // rol, cualquiera se auto-asigna admin.
  const nuevoUsuario: Prisma.UserCreateInput = {
    email,
    passwordHash: await hashearPassword(password),
    name,
    role: 'PROFESSIONAL',
    emailVerified: new Date(),
    // La IP se guarda hasheada y solo para la señal de altas múltiples. No
    // sirve para nada más, y por eso no se guarda en claro.
    signupIpHash: ip ? hashValor(ip) : null,
    profile: {
      create: {
        name,
        slug,
        whatsappE164: whatsapp,
        type: 'PERSON',
        // El alta nace sin aprobar. Con la bandera `requireManualApproval`
        // apagada eso no frena la publicación; con la bandera prendida, frena.
        moderationStatus: 'PENDING_REVIEW',
      },
    },
  }

  try {
    await prisma.user.create({ data: nuevoUsuario })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: violación de índice único. Mirar qué campo lo disparó es lo que
      // permite dar el mensaje correcto en vez de un "algo salió mal".
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
    }

    // Cualquier otro error se registra completo del lado del servidor y se
    // devuelve un mensaje genérico: el detalle puede filtrar estructura de la
    // base a un atacante. El logger redacta el email y el teléfono.
    logger.error('registroProfesional: error inesperado', {
      error,
      email,
    })
    return err(
      'No pudimos crear tu cuenta. Probá de nuevo en un rato.',
      ERROR_CODES.DESCONOCIDO,
    )
  }

  // Enviar el email de verificación. Si falla, la cuenta queda creada pero sin
  // verificar: el usuario puede pedir que se lo reenvíen. Es preferible a tirar
  // atrás el registro entero por un problema del proveedor de email.
  try {
    const { enviarEmailVerificacion } = await import('@/lib/email')
    await enviarEmailVerificacion({ email, nombre: name })
  } catch (error: unknown) {
    logger.error('registroProfesional: no se pudo enviar el email de verificación', { error })
  }

  // Señales de riesgo. Van después del alta, no antes: son contexto para que
  // alguien mire, y si fallan el registro tiene que estar hecho igual.
  await registrarRiesgoDelAlta(email, ip).catch(() => {
    /* el registro ya está hecho: una señal que no se registra no lo reverses */
  })

  return ok({ email })
}

/**
 * IP del cliente.
 *
 * Solo para hashear y contar altas. No es confiable al 100% —delante de Vercel
 * hay proxies— pero sirve para detectar veinte cuentas desde la misma conexión,
 * que es el patrón que se busca.
 */
function ipDelRequest(): string | undefined {
  const headersList = headers()

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

/**
 * Email de verificación.
 *
 * Auth.js expone `/api/auth/verify-email?token=...` para confirmar. Acá solo
 * se dispara el envío; el token lo genera Auth.js y su vida es corta.
 */
export async function reenviarEmailVerificacion(email: string): Promise<Resultado<null>> {
  const usuario = await prisma.user.findUnique({ where: { email } })

  if (!usuario) {
    // Mismo mensaje que si existe: no le decimos a un atacante qué emails
    // están registrados.
    return ok(null)
  }

  if (usuario.emailVerified) {
    return err('Ese email ya está verificado.', ERROR_CODES.ESTADO_INVALIDO)
  }

  try {
    const { enviarEmailVerificacion } = await import('@/lib/email')
    await enviarEmailVerificacion({ email, nombre: usuario.name ?? 'bienvenido' })
    return ok(null)
  } catch (error: unknown) {
    logger.error('reenviarEmailVerificacion: fallo el envío', { error })
    return err('No pudimos enviar el email. Probá en un rato.', ERROR_CODES.ERROR_EXTERNO)
  }
}
