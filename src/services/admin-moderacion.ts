import {
  Prisma,
  type ComplaintStatus,
  type ReportStatus,
  type RiskSignalType,
} from '@prisma/client'

import { calcularPagina, normalizarPagina, POR_PAGINA } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, type ActorAuditoria } from '@/services/auditoria'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Bandejas de moderación: reportes anónimos, libro de quejas y señales.
 *
 * Las fotos y los votos se resuelven desde el detalle del perfil, porque
 * ocultar una foto sin ver el perfil entero es cómo se modera mal.
 */

export type FiltrosReportes = {
  estado?: ReportStatus | ''
  pagina?: number
}

export async function listarReportes(filtros: FiltrosReportes = {}) {
  const where: Prisma.ReportWhereInput = {}

  if (filtros.estado) where.status = filtros.estado

  const total = await prisma.report.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      reason: true,
      detail: true,
      status: true,
      resolution: true,
      createdAt: true,
      resolvedAt: true,
      profile: {
        select: {
          id: true,
          name: true,
          slug: true,
          moderationStatus: true,
          user: { select: { email: true } },
        },
      },
    },
  })

  return { filas, pagina }
}

/** Cierra un reporte con una resolución escrita. */
export async function resolverReporte(params: {
  reportId: string
  estado: 'EN_REVISION' | 'RESUELTO' | 'DESCARTADO'
  resolucion: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const resolucion = params.resolucion.trim()

  if (resolucion.length < 5) {
    return err('Escribí la resolución del reporte.', ERROR_CODES.VALIDACION)
  }

  const reporte = await prisma.report.findUnique({
    where: { id: params.reportId },
    select: { id: true, status: true, profileId: true },
  })

  if (!reporte) return err('Ese reporte ya no existe.', ERROR_CODES.NO_ENCONTRADO)

  const cierra = params.estado !== 'EN_REVISION'

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reporte.id },
      data: {
        status: params.estado,
        resolution: resolucion,
        resolvedAt: cierra ? new Date() : null,
      },
    })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: `reporte.${params.estado.toLowerCase()}`,
        entidad: 'Report',
        entidadId: reporte.id,
        antes: { estado: reporte.status },
        despues: { estado: params.estado, resolucion },
      },
      tx,
    )
  })

  return ok(null)
}

export type FiltrosQuejas = {
  estado?: ComplaintStatus | ''
  pagina?: number
}

/** Libro de quejas: reclamos de visitantes, no los reclamos entre partes. */
export async function listarQuejas(filtros: FiltrosQuejas = {}) {
  const where: Prisma.ComplaintWhereInput = {}

  if (filtros.estado) where.status = filtros.estado

  const total = await prisma.complaint.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.complaint.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      reference: true,
      message: true,
      status: true,
      createdAt: true,
    },
  })

  return { filas, pagina }
}

/**
 * Cambia el estado de una queja.
 *
 * `Complaint` no tiene campo de resolución: el motivo del cierre queda en la
 * auditoría, que es el único lugar que necesita explicar por qué se cerró.
 */
export async function resolverQueja(params: {
  complaintId: string
  estado: 'EN_REVISION' | 'RESUELTO'
  resolucion: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const resolucion = params.resolucion.trim()

  if (resolucion.length < 5) {
    return err('Escribí cómo se resolvió la queja.', ERROR_CODES.VALIDACION)
  }

  const queja = await prisma.complaint.findUnique({
    where: { id: params.complaintId },
    select: { id: true, status: true },
  })

  if (!queja) return err('Esa queja ya no existe.', ERROR_CODES.NO_ENCONTRADO)

  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { id: queja.id },
      data: { status: params.estado },
    })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: `queja.${params.estado.toLowerCase()}`,
        entidad: 'Complaint',
        entidadId: queja.id,
        antes: { estado: queja.status },
        despues: { estado: params.estado, resolucion },
      },
      tx,
    )
  })

  return ok(null)
}

export type FiltrosRiesgos = {
  tipo?: RiskSignalType | ''
  pagina?: number
}

/** Todas las señales sin resolver, con el perfil al que apuntan. */
export async function listarSenalesRiesgo(filtros: FiltrosRiesgos = {}) {
  const where: Prisma.RiskSignalWhereInput = { resolvedAt: null }

  if (filtros.tipo) where.type = filtros.tipo

  const total = await prisma.riskSignal.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.riskSignal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      type: true,
      details: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          name: true,
          slug: true,
          whatsappE164: true,
          whatsappVerifiedAt: true,
          moderationStatus: true,
          user: { select: { email: true } },
        },
      },
    },
  })

  return { filas, pagina }
}
