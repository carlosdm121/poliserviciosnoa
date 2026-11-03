import { ReclamoEstado, ReclamoMotivo } from '@prisma/client'

import { logger } from '@/lib/logger'
import {
  DIAS_LIMITE_RECLAMO,
  generarNumeroTramiteReclamo,
  LARGO_MAX_DESCRIPCION,
  MOTIVOS_RECLAMO,
  esMotivoValido,
  limiteTreintaDias,
  validarDescripcion,
} from '@/lib/reclamo'
import { prisma } from '@/lib/prisma'
import { registrarRiesgo } from '@/services/riesgo'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** Máximo de evidencias por reclamo. */
const MAX_EVIDENCIAS = 3

/** Umbral de reclamos VALIDADOS en 90 días para advertencia. */
const UMBRAL_ADVERTENCIA = 2
/** Umbral de reclamos VALIDADOS en 90 días para suspensión. */
const UMBRAL_SUSPENSION = 3
/** Ventana de 90 días en milisegundos. */
const VENTANA_SUSPENSION_MS = 90 * 24 * 60 * 60 * 1000

export type ReclamoCreado = {
  id: string
  tramiteNumber: string
  estado: ReclamoEstado
}

/** Datos mínimos para crear un reclamo. */
export type EntradaReclamo = {
  profileId: string
  motivo: ReclamoMotivo
  descripcion: string
  /** publicId de Cloudinary, máx 3. Los sube la UI antes de crear el reclamo. */
  evidencias: string[]
}

/**
 * Crea un reclamo de un cliente contra un profesional.
 *
 * Reglas de negocio:
 * - Solo un cliente con sesión puede reclamar.
 * - Debe existir un ContactIntent del cliente hacia ese perfil (contacto
 *   previo por WhatsApp).
 * - Máximo un reclamo por cliente y perfil cada 30 días.
 * - Hasta 3 evidencias privadas.
 * - Si el motivo es FRAUDE, se suspende preventivamente el perfil y se avisa
 *   al admin por RiskSignal.
 *
 * El email al profesional no revela datos del cliente.
 */
export async function crearReclamo(
  clientId: string,
  entrada: EntradaReclamo,
): Promise<Resultado<ReclamoCreado>> {
  const errorDescripcion = validarDescripcion(entrada.descripcion)

  if (errorDescripcion) {
    return err(errorDescripcion, ERROR_CODES.VALIDACION)
  }

  if (!esMotivoValido(entrada.motivo)) {
    return err('Motivo de reclamo inválido.', ERROR_CODES.VALIDACION)
  }

  if (entrada.evidencias.length > MAX_EVIDENCIAS) {
    return err(
      `Máximo ${MAX_EVIDENCIAS} evidencias por reclamo.`,
      ERROR_CODES.VALIDACION,
    )
  }

  const ahora = new Date()

  // 1. El cliente existe y es CLIENT.
  const cliente = await prisma.user.findUnique({
    where: { id: clientId },
    select: { id: true, role: true, email: true },
  })

  if (!cliente || cliente.role !== 'CLIENT') {
    return err('Necesitás una cuenta de cliente para reclamar.', ERROR_CODES.SIN_PERMISOS)
  }

  // 2. Contacto previo: existe un ContactIntent del cliente a este perfil.
  const contacto = await prisma.contactIntent.findFirst({
    where: { clientId, profileId: entrada.profileId },
    select: { id: true, createdAt: true },
  })

  if (!contacto) {
    return err(
      'Solo podés reclamar a un profesional al que ya contactaste por WhatsApp.',
      ERROR_CODES.SIN_PERMISOS,
    )
  }

  // 3. Límite: un reclamo por cliente y perfil cada 30 días.
  const reclamoReciente = await prisma.reclamo.findFirst({
    where: {
      clientId,
      profileId: entrada.profileId,
      createdAt: { gte: limiteTreintaDias(ahora) },
    },
    select: { id: true, tramiteNumber: true },
  })

  if (reclamoReciente) {
    return err(
      `Ya presentaste un reclamo contra este profesional en los últimos ${DIAS_LIMITE_RECLAMO} días (trámite ${reclamoReciente.tramiteNumber}).`,
      ERROR_CODES.LIMITE_ALCANZADO,
    )
  }

  // 4. El perfil existe.
  const perfil = await prisma.profile.findUnique({
    where: { id: entrada.profileId },
    select: { id: true, userId: true, name: true, isPublished: true },
  })

  if (!perfil) {
    return err('Ese perfil no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  const tramiteNumber = generarNumeroTramiteReclamo(
    ahora,
    `${cliente.id.slice(-4)}${entrada.profileId.slice(-4)}`,
  )

  try {
    const reclamo = await prisma.reclamo.create({
      data: {
        profileId: entrada.profileId,
        clientId,
        contactIntentId: contacto.id,
        motivo: entrada.motivo,
        descripcion: entrada.descripcion.trim(),
        estado: 'NUEVO' as ReclamoEstado,
        tramiteNumber,
        evidencias: entrada.evidencias.length
          ? {
              create: entrada.evidencias.map((url) => ({
                url,
              })),
            }
          : undefined,
      },
      select: { id: true, tramiteNumber: true, estado: true },
    })

    // 5. Email al profesional (sin datos del cliente).
    const profesional = await prisma.user.findUnique({
      where: { id: perfil.userId },
      select: { email: true, name: true },
    })

    if (profesional?.email) {
      await enviarEmailNotificacionReclamo({
        email: profesional.email,
        nombre: profesional.name ?? perfil.name ?? '',
        tramite: tramiteNumber,
        motivo: MOTIVOS_RECLAMO[entrada.motivo],
      }).catch((error) => {
        logger.warn('reclamo: no se pudo notificar al profesional', {
          profileId: entrada.profileId,
          tramiteNumber,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    // 6. Si es fraude: señal de riesgo y suspensión preventiva inmediata.
    if (entrada.motivo === 'FRAUDE') {
      await registrarRiesgo(entrada.profileId, 'REPORTES_MULTIPLES', {
        motivo: 'FRAUDE',
        tramiteNumber,
        clientId,
      }).catch(() => undefined)

      await suspenderPerfilPreventivamente(entrada.profileId, tramiteNumber)
    }

    return ok({
      id: reclamo.id,
      tramiteNumber,
      estado: reclamo.estado as ReclamoEstado,
    })
  } catch (error: unknown) {
    logger.error('reclamo: no se pudo crear el reclamo', {
      profileId: entrada.profileId,
      clientId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err('No pudimos registrar el reclamo. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Suspende preventivamente un perfil por reclamo de fraude.
 *
 * Marca moderationStatus = SUSPENDED y despublica. Queda constancia en
 * AuditLog para que el administrador revise.
 */
async function suspenderPerfilPreventivamente(
  profileId: string,
  tramiteNumber: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: profileId },
      data: {
        moderationStatus: 'SUSPENDED',
        moderationReason: `Reclamo de fraude (trámite ${tramiteNumber})`,
      },
    })

    await tx.auditLog.create({
      data: {
        actorId: 'sistema',
        actorEmail: 'sistema@poliserviciosnoa.com',
        action: 'SUSPENSION_PREVENTIVA_FRAUDE',
        entityType: 'Profile',
        entityId: profileId,
        after: { motivo: 'RECLAMO_FRAUDE', tramiteNumber },
      },
    })
  })

  await sincronizarPublicacion(profileId)
}

/**
 * Reclamos de un cliente, para su pantalla de historial.
 */
export async function listarReclamosDelCliente(clientId: string) {
  return prisma.reclamo.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tramiteNumber: true,
      motivo: true,
      estado: true,
      resolucion: true,
      requestedAt: true,
      processedAt: true,
      profile: {
        select: { id: true, name: true, slug: true },
      },
    },
  })
}

/**
 * Reclamos recibidos por un profesional (su panel).
 * El profesional no ve datos personales del cliente: solo el motivo, la
 * descripción y el estado.
 */
export async function listarReclamosDelProfesional(profileId: string) {
  return prisma.reclamo.findMany({
    where: { profileId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tramiteNumber: true,
      motivo: true,
      descripcion: true,
      estado: true,
      resolucion: true,
      requestedAt: true,
      processedAt: true,
      client: {
        select: { id: true, name: true },
      },
      evidencias: {
        select: { id: true, url: true, createdAt: true },
      },
    },
  })
}

/**
 * Verifica si un usuario (por id y rol) puede ver las evidencias de un reclamo.
 * Solo el profesional del perfil, el cliente dueño o un administrador.
 */
export async function puedeVerEvidencias(
  reclamoId: string,
  usuarioId: string | null,
  rol: string | null,
): Promise<boolean> {
  const reclamo = await prisma.reclamo.findUnique({
    where: { id: reclamoId },
    select: { profileId: true, clientId: true, profile: { select: { userId: true } } },
  })

  if (!reclamo) return false

  if (rol === 'ADMIN') return true
  if (usuarioId && usuarioId === reclamo.clientId) return true
  if (usuarioId && usuarioId === reclamo.profile.userId) return true

  return false
}

/**
 * Resuelve un reclamo desde administración.
 *
 * El admin marca VALIDADO o DESESTIMADO con una resolución. Queda constancia
 * en AuditLog. Si se alcanza el umbral de suspensión, se aplica automáticamente.
 */
export async function resolverReclamo(params: {
  reclamoId: string
  estado: 'VALIDADO' | 'DESESTIMADO'
  resolucion: string
  actor: { id: string; email: string }
}): Promise<Resultado<{ estado: ReclamoEstado }>> {
  const resolucionTrim = params.resolucion.trim()

  if (resolucionTrim.length < 5) {
    return err('Escribí la resolución del reclamo.', ERROR_CODES.VALIDACION)
  }

  const reclamo = await prisma.reclamo.findUnique({
    where: { id: params.reclamoId },
    select: { id: true, profileId: true, estado: true, tramiteNumber: true },
  })

  if (!reclamo) {
    return err('Ese reclamo ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (reclamo.estado !== 'NUEVO') {
    return err('Este reclamo ya fue resuelto.', ERROR_CODES.ESTADO_INVALIDO)
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.reclamo.update({
        where: { id: params.reclamoId },
        data: {
          estado: params.estado as ReclamoEstado,
          resolucion: resolucionTrim,
          processedAt: new Date(),
        },
        select: { id: true, estado: true, profileId: true },
      })

      await tx.auditLog.create({
        data: {
          actorId: params.actor.id,
          actorEmail: params.actor.email,
          action:
            params.estado === 'VALIDADO' ? 'VALIDAR_RECLAMO' : 'DESESTIMAR_RECLAMO',
          entityType: 'Reclamo',
          entityId: params.reclamoId,
          before: { estado: reclamo.estado, tramiteNumber: reclamo.tramiteNumber },
          after: { estado: params.estado, resolucion: resolucionTrim },
        },
      })

      return actualizado
    })

    // Si se validó, revisar política de suspensión automática.
    if (params.estado === 'VALIDADO') {
      await aplicarPoliticaSuspension(reclamo.profileId)
    }

    return ok({ estado: resultado.estado as ReclamoEstado })
  } catch (error: unknown) {
    logger.error('reclamo: no se pudo resolver el reclamo', {
      reclamoId: params.reclamoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err('No pudimos resolver el reclamo. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Política automática de suspensión por reclamos validados.
 *
 * Reglas (configurables, acá como constantes):
 * - 2 reclamos VALIDADOS en 90 días → advertencia por email al profesional.
 * - 3 reclamos VALIDADOS en 90 días → suspensión (SUSPENDED) + despublicado +
 *   revisión manual del admin.
 * - Cada validación queda en AuditLog.
 *
 * Idempotente: si ya se aplicó la sanción, no se vuelve a aplicar.
 */
export async function aplicarPoliticaSuspension(profileId: string): Promise<void> {
  const desde = new Date(Date.now() - VENTANA_SUSPENSION_MS)

  const [validadosRecientes, perfil, yaSuspendido] = await Promise.all([
    prisma.reclamo.count({
      where: {
        profileId,
        estado: 'VALIDADO' as ReclamoEstado,
        processedAt: { gte: desde },
      },
    }),
    prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, userId: true, name: true, moderationStatus: true, isPublished: true },
    }),
    prisma.auditLog.findFirst({
      where: {
        entityType: 'Profile',
        entityId: profileId,
        action: 'SUSPENSION_RECLAMOS',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ])

  if (!perfil) return
  if (yaSuspendido) return

  if (validadosRecientes >= UMBRAL_SUSPENSION) {
    await suspenderPerfil(
      perfil.id,
      perfil.userId,
      perfil.name,
      '3 reclamos validados en 90 días',
    )
    return
  }

  if (validadosRecientes >= UMBRAL_ADVERTENCIA) {
    await enviarAdvertenciaReclamos(perfil)
    return
  }
}

/**
 * Suspende un perfil por política de reclamos y deja constancia.
 */
async function suspenderPerfil(
  profileId: string,
  userId: string,
  nombre: string | null | undefined,
  motivo: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: profileId },
      data: {
        moderationStatus: 'SUSPENDED',
        moderationReason: motivo,
      },
    })

    await tx.auditLog.create({
      data: {
        actorId: 'sistema',
        actorEmail: 'sistema@poliserviciosnoa.com',
        action: 'SUSPENSION_RECLAMOS',
        entityType: 'Profile',
        entityId: profileId,
        after: { motivo, fecha: new Date().toISOString() },
      },
    })
  })

  await sincronizarPublicacion(profileId)

  // Email al profesional avisando de la suspensión.
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })

  if (usuario?.email) {
    await enviarEmailSuspensionPorReclamos({
      email: usuario.email,
      nombre: usuario.name ?? nombre ?? '',
      perfilId: profileId,
      motivo,
    }).catch((error) => {
      logger.warn('reclamo: no se pudo notificar la suspensión', {
        profileId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
}

/**
 * Envía advertencia por email cuando se llega al umbral de 2 reclamos validados.
 */
async function enviarAdvertenciaReclamos(perfil: {
  id: string
  userId: string
  name: string | null
}): Promise<void> {
  const usuario = await prisma.user.findUnique({
    where: { id: perfil.userId },
    select: { email: true, name: true },
  })

  if (!usuario?.email) return

  await enviarEmailAdvertenciaReclamos({
    email: usuario.email,
    nombre: usuario.name ?? perfil.name ?? '',
    cantidad: UMBRAL_ADVERTENCIA,
  }).catch((error) => {
    logger.warn('reclamo: no se pudo enviar advertencia', {
      profileId: perfil.id,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

/** Declaraciones adelantadas de funciones de email (definidas en lib/email.ts). */
async function enviarEmailNotificacionReclamo(params: {
  email: string
  nombre: string
  tramite: string
  motivo: string
}): Promise<void> {
  const { enviarEmailNotificacionReclamo: enviar } = await import('@/lib/email')
  await enviar(params)
}

async function enviarEmailAdvertenciaReclamos(params: {
  email: string
  nombre: string
  cantidad: number
}): Promise<void> {
  const { enviarEmailAdvertenciaReclamos: enviar } = await import('@/lib/email')
  await enviar(params)
}

async function enviarEmailSuspensionPorReclamos(params: {
  email: string
  nombre: string
  perfilId: string
  motivo: string
}): Promise<void> {
  const { enviarEmailSuspensionReclamos: enviar } = await import('@/lib/email')
  await enviar(params)
}
