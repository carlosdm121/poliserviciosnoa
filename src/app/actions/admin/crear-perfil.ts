'use server'

import { exigirSuperAdmin } from '@/lib/admin-auth'
import { generarSlugPerfil } from '@/lib/constantes'
import { logger } from '@/lib/logger'
import { generarPasswordTemporal, hashearPassword } from '@/lib/password'
import { prisma } from '@/lib/prisma'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** Datos que el admin necesita para crear un espacio (perfil) para un profesional. */
export type DatosCrearEspacio = {
  nombre: string
  email: string
  tipo: 'PERSON' | 'COMPANY'
  ciudadId: string
  rubroPrincipalId: string
  rubroSecundarioId?: string
}

export type EspacioCreado = {
  profileId: string
  slug: string
  email: string
  /** Clave temporal en claro: se muestra una sola vez al admin. */
  password: string
}

/** Estado que consume el formulario del panel. */
export type EstadoCreacionEspacio =
  | ({ ok: true; nombre: string } & EspacioCreado)
  | { ok: false; error: string }

/**
 * Crea un espacio (perfil) para un profesional desde el panel de administración.
 *
 * El admin lo crea cuando la persona ya pagó. La cuenta nace con una clave
 * temporal que se devuelve una sola vez para que el admin se la envíe: el
 * profesional entra a `/login`, cambia la clave y edita su espacio en
 * `/panel/espacio`.
 */
export async function adminCrearEspacio(
  datos: DatosCrearEspacio,
): Promise<Resultado<EspacioCreado>> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return admin

  const { nombre, email, tipo, ciudadId, rubroPrincipalId, rubroSecundarioId } = datos

  if (!nombre || nombre.length < 2) {
    return err('El nombre del profesional es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (!email || !email.includes('@')) {
    return err('Escribí un email válido.', ERROR_CODES.VALIDACION)
  }

  if (!ciudadId || !rubroPrincipalId) {
    return err('Elegí la ciudad y el rubro principal.', ERROR_CODES.VALIDACION)
  }

  const slug = generarSlugPerfil(nombre)
  const password = generarPasswordTemporal()
  // Se hashea antes de abrir la transacción: bcrypt tarda ~250 ms y no hay
  // razón para mantener una conexión de base tomada mientras calcula.
  const passwordHash = await hashearPassword(password)

  try {
    const profileId = await prisma.$transaction(async (tx) => {
      const existente = await tx.user.findUnique({ where: { email }, select: { id: true } })
      if (existente) throw new Error('ESE_EMAIL_YA_EXISTE')

      const slugExistente = await tx.profile.findUnique({
        where: { slug },
        select: { id: true },
      })
      if (slugExistente) throw new Error('ESE_SLUG_YA_EXISTE')

      // La cuenta nace con contraseña: sin ella el profesional no podría
      // entrar a editar su espacio, que es justamente lo que se le entrega.
      const usuario = await tx.user.create({
        data: {
          email,
          name: nombre,
          role: 'PROFESSIONAL',
          emailVerified: new Date(),
          passwordHash,
        },
        select: { id: true },
      })

      const perfil = await tx.profile.create({
        data: {
          userId: usuario.id,
          type: tipo,
          name: nombre,
          slug,
          baseCityId: ciudadId,
          description: '',
          moderationStatus: 'APPROVED',
          moderationReviewedAt: new Date(),
          moderationReviewedBy: admin.data.email,
        },
        select: { id: true },
      })

      await tx.profileCategory.create({
        data: {
          profileId: perfil.id,
          categoryId: rubroPrincipalId,
          isPrimary: true,
        },
      })

      if (rubroSecundarioId) {
        await tx.profileCategory.create({
          data: {
            profileId: perfil.id,
            categoryId: rubroSecundarioId,
            isPrimary: false,
          },
        })
      }

      const plan = await tx.plan.findFirst({
        where: { isActive: true },
        orderBy: { vigenteDesde: 'desc' },
        select: { id: true, amount: true },
      })

      if (!plan) throw new Error('SIN_PLAN_ACTIVO')

      // Queda PENDING hasta que el admin vea la transferencia acreditada y
      // registre el pago. Activar acá dejaría entrar a cualquiera con un
      // comprobante falso.
      await tx.subscription.create({
        data: {
          profileId: perfil.id,
          planId: plan.id,
          planAmount: plan.amount,
          status: 'PENDING',
        },
      })

      return perfil.id
    })

    logger.info('admin: espacio creado', {
      admin: admin.data.email,
      profileId,
      slug,
      email,
    })

    return ok({ profileId, slug, email, password })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'ESE_EMAIL_YA_EXISTE') {
      return err('Ese email ya está registrado en otro espacio.', ERROR_CODES.DUPLICADO)
    }
    if (error instanceof Error && error.message === 'ESE_SLUG_YA_EXISTE') {
      return err('Ya existe un espacio con ese nombre. Probá de nuevo.', ERROR_CODES.DUPLICADO)
    }
    if (error instanceof Error && error.message === 'SIN_PLAN_ACTIVO') {
      return err('No hay un plan de suscripción activo. Configuralo antes de crear espacios.', ERROR_CODES.ESTADO_INVALIDO)
    }

    logger.error('admin: error al crear espacio', { nombre, email, error })
    return err('No pudimos crear el espacio. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Versión de formulario (FormData) que usa el panel.
 *
 * Devuelve el estado en vez de redirigir para poder mostrar una sola vez la
 * clave temporal; ponerla en la URL la dejaría en el historial y en los logs.
 */
export async function adminCrearEspacioAction(
  datosForm: FormData,
): Promise<EstadoCreacionEspacio> {
  const nombre = String(datosForm.get('nombre') ?? '').trim()
  const email = String(datosForm.get('email') ?? '').trim().toLowerCase()
  const tipo = datosForm.get('tipo') === 'COMPANY' ? 'COMPANY' : 'PERSON'
  const ciudadId = String(datosForm.get('ciudadId') ?? '')
  const rubroPrincipalId = String(datosForm.get('rubroPrincipalId') ?? '')
  const rubroSecundarioId = String(datosForm.get('rubroSecundarioId') ?? '') || undefined

  const resultado = await adminCrearEspacio({
    nombre,
    email,
    tipo,
    ciudadId,
    rubroPrincipalId,
    rubroSecundarioId,
  })

  if (!resultado.ok) {
    return { ok: false, error: resultado.error }
  }

  return { ok: true, nombre, ...resultado.data }
}
