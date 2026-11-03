import {
  Prisma,
  type ModerationStatus,
  type ProfileType,
  type Province,
  type SubscriptionStatus,
} from '@prisma/client'

import { calcularPagina, normalizarPagina, POR_PAGINA } from '@/lib/admin'
import { borrarRecurso } from '@/lib/cloudinary'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, type ActorAuditoria } from '@/services/auditoria'
import { aprobarPerfil, rechazarPerfil, suspenderPerfil } from '@/services/moderacion'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Consultas y acciones de las secciones de perfiles del panel.
 *
 * Todo lo que escribe `moderationStatus` sigue pasando por `moderacion.ts`
 * (D4): acá solo se orquestan los datos propios de la sección y la auditoría.
 */

export type FiltrosPerfiles = {
  q?: string
  tipo?: ProfileType | ''
  provincia?: Province | ''
  moderacion?: ModerationStatus | ''
  suscripcion?: SubscriptionStatus | 'SIN_SUSCRIPCION' | ''
  whatsapp?: 'SI' | 'NO' | ''
  pagina?: number
}

export type FilaPerfilAdmin = {
  id: string
  name: string
  slug: string
  type: ProfileType
  companyName: string | null
  whatsappE164: string
  whatsappVerifiedAt: Date | null
  moderationStatus: ModerationStatus
  isPublished: boolean
  createdAt: Date
  email: string
  ciudad: string | null
  provincia: Province | null
  suscripcion: SubscriptionStatus | null
  vence: Date | null
}

export async function listarPerfilesAdmin(filtros: FiltrosPerfiles = {}): Promise<{
  filas: FilaPerfilAdmin[]
  pagina: ReturnType<typeof calcularPagina>
}> {
  const where: Prisma.ProfileWhereInput = {}

  // Cada bloque va en su propio `OR` dentro de `AND`: la búsqueda y la
  // provincia son condiciones independientes que deben cumplirse juntas.
  const condiciones: Prisma.ProfileWhereInput[] = []

  if (filtros.q?.trim()) {
    const texto = filtros.q.trim()

    condiciones.push({
      OR: [
        { name: { contains: texto, mode: 'insensitive' } },
        { companyName: { contains: texto, mode: 'insensitive' } },
        { tradeName: { contains: texto, mode: 'insensitive' } },
        { whatsappE164: { contains: texto } },
        { user: { email: { contains: texto, mode: 'insensitive' } } },
      ],
    })
  }

  if (filtros.tipo) where.type = filtros.tipo
  if (filtros.moderacion) where.moderationStatus = filtros.moderacion

  if (filtros.provincia) {
    condiciones.push({
      OR: [
        { baseCity: { province: filtros.provincia } },
        { coversOtherProvinces: { has: filtros.provincia } },
      ],
    })
  }

  if (condiciones.length > 0) where.AND = condiciones

  if (filtros.whatsapp === 'SI') where.whatsappVerifiedAt = { not: null }
  if (filtros.whatsapp === 'NO') where.whatsappVerifiedAt = null

  if (filtros.suscripcion === 'SIN_SUSCRIPCION') {
    where.subscription = { is: null }
  } else if (filtros.suscripcion) {
    where.subscription = { is: { status: filtros.suscripcion } }
  }

  const total = await prisma.profile.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.profile.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      companyName: true,
      whatsappE164: true,
      whatsappVerifiedAt: true,
      moderationStatus: true,
      isPublished: true,
      createdAt: true,
      user: { select: { email: true } },
      baseCity: { select: { name: true, province: true } },
      subscription: { select: { status: true, currentPeriodEnd: true } },
    },
  })

  return {
    filas: filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      slug: fila.slug,
      type: fila.type,
      companyName: fila.companyName,
      whatsappE164: fila.whatsappE164,
      whatsappVerifiedAt: fila.whatsappVerifiedAt,
      moderationStatus: fila.moderationStatus,
      isPublished: fila.isPublished,
      createdAt: fila.createdAt,
      email: fila.user.email,
      ciudad: fila.baseCity?.name ?? null,
      provincia: fila.baseCity?.province ?? null,
      suscripcion: fila.subscription?.status ?? null,
      vence: fila.subscription?.currentPeriodEnd ?? null,
    })),
    pagina,
  }
}

/** Detalle completo para revisar un perfil sin salir del panel. */
export async function perfilDetalleAdmin(profileId: string) {
  return prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      companyName: true,
      tradeName: true,
      cuit: true,
      website: true,
      description: true,
      shortBio: true,
      whatsappE164: true,
      whatsappVerifiedAt: true,
      whatsappVerifiedBy: true,
      moderationStatus: true,
      moderationReason: true,
      moderationReviewedAt: true,
      moderationReviewedBy: true,
      unpublishedReason: true,
      isPublished: true,
      licenseNumber: true,
      licenseReviewedAt: true,
      licenseReviewedBy: true,
      companyDocumentKey: true,
      companyDocumentReviewedAt: true,
      companyVerifiedAt: true,
      companyVerifiedBy: true,
      companyRejectionReason: true,
      createdAt: true,
      user: { select: { id: true, email: true, createdAt: true } },
      baseCity: { select: { name: true, province: true } },
      coverage: { select: { city: { select: { name: true, province: true } } } },
      categories: {
        select: { isPrimary: true, category: { select: { name: true } } },
      },
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          graceUntil: true,
          pastDueSince: true,
          planAmount: true,
        },
      },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          url: true,
          isHidden: true,
          hiddenReason: true,
          hiddenAt: true,
          hiddenBy: true,
        },
      },
      votes: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          client: { select: { email: true } },
        },
      },
      riskSignals: {
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, details: true, createdAt: true },
      },
      reports: {
        where: { status: { in: ['PENDIENTE', 'EN_REVISION'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, reason: true, detail: true, createdAt: true },
      },
      reclamos: {
        where: { estado: { in: ['NUEVO', 'EN_REVISION'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tramiteNumber: true,
          motivo: true,
          estado: true,
          createdAt: true,
        },
      },
    },
  })
}

/** Cola de altas esperando aprobación. */
export async function listarAprobaciones(paginaPedida?: number) {
  const where: Prisma.ProfileWhereInput = { moderationStatus: 'PENDING_REVIEW' }

  const total = await prisma.profile.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(paginaPedida), POR_PAGINA)

  const filas = await prisma.profile.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      companyName: true,
      whatsappE164: true,
      whatsappVerifiedAt: true,
      createdAt: true,
      user: { select: { email: true } },
      baseCity: { select: { name: true, province: true } },
    },
  })

  return { filas, pagina }
}

/** Constancias de inscripción cargadas y todavía sin resolver. */
export async function listarEmpresasPendientes(paginaPedida?: number) {
  const where: Prisma.ProfileWhereInput = {
    type: 'COMPANY',
    companyDocumentKey: { not: null },
  }

  const total = await prisma.profile.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(paginaPedida), POR_PAGINA)

  const filas = await prisma.profile.findMany({
    where,
    orderBy: { updatedAt: 'asc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      name: true,
      companyName: true,
      tradeName: true,
      cuit: true,
      companyDocumentKey: true,
      companyDocumentReviewedAt: true,
      companyVerifiedAt: true,
      companyRejectionReason: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  })

  return { filas, pagina }
}

/** Perfiles con matrícula informada, sin revisar primero. */
export async function listarMatriculas(paginaPedida?: number) {
  const where: Prisma.ProfileWhereInput = { licenseNumber: { not: null } }

  const total = await prisma.profile.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(paginaPedida), POR_PAGINA)

  const filas = await prisma.profile.findMany({
    where,
    orderBy: [{ licenseReviewedAt: 'asc' }, { createdAt: 'desc' }],
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      name: true,
      companyName: true,
      licenseNumber: true,
      licenseReviewedAt: true,
      licenseReviewedBy: true,
      whatsappVerifiedAt: true,
      createdAt: true,
      user: { select: { email: true } },
      categories: {
        where: { category: { requiresLicense: true } },
        select: { category: { select: { name: true, licenseLabel: true } } },
      },
    },
  })

  return { filas, pagina }
}

/** Contadores del resumen. Una consulta por bandeja, en paralelo. */
export async function contarBandejas(): Promise<{
  aprobaciones: number
  empresas: number
  matriculas: number
  riesgos: number
  reportes: number
  reclamos: number
  bloqueos: number
  tickets: number
}> {
  const [
    aprobaciones,
    empresas,
    matriculas,
    riesgos,
    reportes,
    reclamos,
    bloqueos,
    tickets,
  ] = await Promise.all([
    prisma.profile.count({ where: { moderationStatus: 'PENDING_REVIEW' } }),
    prisma.profile.count({ where: { type: 'COMPANY', companyDocumentKey: { not: null } } }),
    prisma.profile.count({ where: { licenseNumber: { not: null }, licenseReviewedAt: null } }),
    prisma.riskSignal.count({ where: { resolvedAt: null } }),
    prisma.report.count({ where: { status: { in: ['PENDIENTE', 'EN_REVISION'] } } }),
    prisma.reclamo.count({ where: { estado: { in: ['NUEVO', 'EN_REVISION'] } } }),
    prisma.blockedIdentifier.count(),
    prisma.supportTicket.count({ where: { estado: { in: ['ABIERTO', 'EN_CURSO'] } } }),
  ])

  return { aprobaciones, empresas, matriculas, riesgos, reportes, reclamos, bloqueos, tickets }
}

/** Reactiva un perfil suspendido o rechazado. Pasa por la regla de moderación. */
export async function reactivarPerfil(
  profileId: string,
  actor: ActorAuditoria,
  nota?: string,
): Promise<Resultado<null>> {
  return aprobarPerfil(profileId, actor.email, nota)
}

/** Suspende desde la tabla de perfiles. El motivo es obligatorio. */
export async function suspenderDesdePanel(
  profileId: string,
  actor: ActorAuditoria,
  motivo: string,
): Promise<Resultado<null>> {
  return suspenderPerfil(profileId, actor.email, motivo)
}

/** Rechaza un alta. Se le muestra el motivo al profesional. */
export async function rechazarDesdePanel(
  profileId: string,
  actor: ActorAuditoria,
  motivo: string,
): Promise<Resultado<null>> {
  return rechazarPerfil(profileId, actor.email, motivo)
}

/**
 * Marca un número como verificado a mano.
 *
 * Es la salida cuando el profesional no puede recibir el código (cambió de
 * número, el WhatsApp empresarial no recibe SMS). Queda registrado quién lo
 * verificó: una verificación manual sin autor es una puerta abierta.
 */
export async function verificarWhatsappManual(params: {
  profileId: string
  motivo: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const motivo = params.motivo.trim()

  if (motivo.length < 5) {
    return err('Escribí por qué verificás el número a mano.', ERROR_CODES.VALIDACION)
  }

  const perfil = await prisma.profile.findUnique({
    where: { id: params.profileId },
    select: { id: true, whatsappVerifiedAt: true, whatsappVerifiedBy: true },
  })

  if (!perfil) return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: perfil.id },
      data: {
        whatsappVerifiedAt: new Date(),
        whatsappVerifiedBy: `MANUAL:${params.actor.email}`,
      },
    })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: 'perfil.whatsapp_manual',
        entidad: 'Profile',
        entidadId: perfil.id,
        antes: { verificado: perfil.whatsappVerifiedAt !== null },
        despues: { verificado: true, motivo },
      },
      tx,
    )
  })

  await sincronizarPublicacion(perfil.id)

  logger.info('admin: whatsapp verificado a mano', {
    profileId: perfil.id,
    actor: params.actor.email,
  })

  return ok(null)
}

/**
 * Resuelve una constancia de inscripción.
 *
 * El documento se borra del almacenamiento privado al resolver, se apruebe o
 * se rechace: no hay razón para conservar el CUIT y el domicilio fiscal de una
 * empresa que ya fue revisada. El borrado remoto es best-effort; la fila de la
 * base se limpia igual.
 */
export async function resolverEmpresa(params: {
  profileId: string
  aprobar: boolean
  motivo: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const motivo = params.motivo.trim()

  if (!params.aprobar && motivo.length < 5) {
    return err('Escribí el motivo del rechazo.', ERROR_CODES.VALIDACION)
  }

  const perfil = await prisma.profile.findUnique({
    where: { id: params.profileId },
    select: {
      id: true,
      companyDocumentKey: true,
      companyVerifiedAt: true,
    },
  })

  if (!perfil) return err('No encontramos esa empresa.', ERROR_CODES.NO_ENCONTRADO)

  if (!perfil.companyDocumentKey) {
    return err('Esa empresa no tiene una constancia pendiente.', ERROR_CODES.ESTADO_INVALIDO)
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: perfil.id },
      data: params.aprobar
        ? {
            companyDocumentKey: null,
            companyDocumentReviewedAt: new Date(),
            companyVerifiedAt: new Date(),
            companyVerifiedBy: params.actor.email,
            companyRejectionReason: null,
          }
        : {
            companyDocumentKey: null,
            companyDocumentReviewedAt: new Date(),
            companyVerifiedAt: null,
            companyVerifiedBy: params.actor.email,
            companyRejectionReason: motivo,
          },
    })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: params.aprobar ? 'empresa.aprobar' : 'empresa.rechazar',
        entidad: 'Profile',
        entidadId: perfil.id,
        antes: { verificada: perfil.companyVerifiedAt !== null },
        despues: { verificada: params.aprobar, motivo: motivo || null },
      },
      tx,
    )
  })

  if (perfil.companyDocumentKey) {
    await borrarRecurso(perfil.companyDocumentKey).catch((error: unknown) => {
      logger.error('admin: no se pudo borrar la constancia', {
        profileId: perfil.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return ok(null)
}

/** Deja constancia de que alguien miró la matrícula informada. */
export async function marcarMatriculaRevisada(params: {
  profileId: string
  nota: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const perfil = await prisma.profile.findUnique({
    where: { id: params.profileId },
    select: { id: true, licenseNumber: true, licenseReviewedAt: true },
  })

  if (!perfil) return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)
  if (!perfil.licenseNumber) {
    return err('Ese perfil no informó matrícula.', ERROR_CODES.ESTADO_INVALIDO)
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: perfil.id },
      data: { licenseReviewedAt: new Date(), licenseReviewedBy: params.actor.email },
    })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: 'matricula.revisar',
        entidad: 'Profile',
        entidadId: perfil.id,
        antes: { revisada: perfil.licenseReviewedAt !== null },
        despues: { revisada: true, nota: params.nota.trim() || null },
      },
      tx,
    )
  })

  return ok(null)
}

