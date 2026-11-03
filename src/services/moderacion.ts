import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { BANDERA_APROBACION_MANUAL, exigeAprobacionManual } from '@/services/ajustes'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Ajustes del sitio y revisión de perfiles.
 *
 * Solo servicios: la interfaz de administración es el módulo 4.1 y todavía no
 * existe. Las reglas hay que escribirlas igual, porque desde el primer día
 * hay un operador que necesita poder aprobar, rechazar y suspender.
 *
 * El lector de la bandera vive en `ajustes.ts` y no acá, para que
 * `publicacion.ts` no tenga que importar este módulo y se arme un ciclo.
 */

export { BANDERA_APROBACION_MANUAL, exigeAprobacionManual }

/**
 * Prende o apende la revisión manual.
 *
 * Al cambiarla hay que resincronizar todos los perfiles: prenderla tiene que
 * sacar de la búsqueda los que estaban esperando, y apagarla tiene que
 * devolver. Sin esto, la bandera tarda hasta el próximo cron en tener efecto y
 * el administrador ve un cambio que no pasó nada.
 */
export async function setExigeAprobacionManual(
  activo: boolean,
  adminEmail: string,
): Promise<Resultado<null>> {
  await prisma.siteSetting.upsert({
    where: { key: BANDERA_APROBACION_MANUAL },
    create: { key: BANDERA_APROBACION_MANUAL, value: activo, updatedBy: adminEmail },
    update: { value: activo, updatedBy: adminEmail },
  })

  const perfiles = await prisma.profile.findMany({ select: { id: true } })

  // En serie y no en paralelo: son miles de escrituras sobre la misma base y
  // el cuello de botella es la conexión, no la CPU.
  for (const perfil of perfiles) {
    await sincronizarPublicacion(perfil.id)
  }

  logger.info('moderación: bandera de aprobación cambiada', {
    activo,
    perfilesResincronizados: perfiles.length,
  })

  return ok(null)
}

/**
 * Aprueba un perfil.
 *
 * Deja `APPROVED` y resincroniza la publicación, que es lo que hace que el
 * perfil aparezca en las búsquedas.
 */
export async function aprobarPerfil(
  profileId: string,
  adminEmail: string,
  nota?: string,
): Promise<Resultado<null>> {
  return cambiarModeracion(profileId, 'APPROVED', adminEmail, nota)
}

/** Rechaza un perfil. Queda fuera de las búsquedas hasta que se reitere. */
export async function rechazarPerfil(
  profileId: string,
  adminEmail: string,
  motivo: string,
): Promise<Resultado<null>> {
  if (!motivo.trim()) {
    return err('Escribí el motivo del rechazo. Se lo muestra al profesional.', ERROR_CODES.VALIDACION)
  }

  return cambiarModeracion(profileId, 'REJECTED', adminEmail, motivo)
}

/**
 * Suspende un perfil.
 *
 * Es el estado que se usa cuando el problema aparece después de publicar: un
 * reclamo, una suplantación, un fraude detectado. A diferencia del rechazo, el
 * motivo es obligatorio pero no se muestra al usuario final, sí al
 * profesional.
 */
export async function suspenderPerfil(
  profileId: string,
  adminEmail: string,
  motivo: string,
): Promise<Resultado<null>> {
  if (!motivo.trim()) {
    return err('Escribí el motivo de la suspensión. Sin motivo queda sin registro.', ERROR_CODES.VALIDACION)
  }

  return cambiarModeracion(profileId, 'SUSPENDED', adminEmail, motivo)
}

/**
 * Único lugar que escribe `moderationStatus`.
 *
 * Igual que con `isPublished` (D4): si dos módulos escriben el estado de
 * moderación por su cuenta, aparece un perfil suspendido que sigue visible o
 * un perfil aprobado que nadie aprobó.
 */
async function cambiarModeracion(
  profileId: string,
  estado: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
  adminEmail: string,
  motivo?: string,
): Promise<Resultado<null>> {
  const anterior = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { moderationStatus: true },
  })

  if (!anterior) {
    return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profileId },
        data: {
          moderationStatus: estado,
          moderationReason: motivo?.trim() || null,
          moderationReviewedAt: new Date(),
          moderationReviewedBy: adminEmail,
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: adminEmail,
          actorEmail: adminEmail,
          action: `moderacion.${estado.toLowerCase()}`,
          entityType: 'Profile',
          entityId: profileId,
          before: { estado: anterior.moderationStatus },
          after: { estado, motivo: motivo?.trim() ?? null },
        },
      })
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error('moderación: error al cambiar el estado', { error, profileId })
      return err('No pudimos cambiar el estado del perfil.', ERROR_CODES.DESCONOCIDO)
    }

    throw error
  }

  await sincronizarPublicacion(profileId)

  logger.info('moderación: estado cambiado', { profileId, estado, anterior: anterior.moderationStatus })

  return ok(null)
}

/** Perfiles esperando revisión, para la cola del panel de administración. */
export async function perfilesPendientesDeRevision(
  limite = 50,
): Promise<{ id: string; name: string; createdAt: Date }[]> {
  return prisma.profile.findMany({
    where: { moderationStatus: 'PENDING_REVIEW' },
    orderBy: { createdAt: 'asc' },
    take: limite,
    select: { id: true, name: true, createdAt: true },
  })
}