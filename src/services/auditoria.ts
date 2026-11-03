import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { calcularPagina, normalizarPagina, POR_PAGINA } from '@/lib/admin'

/**
 * Registro de auditoría.
 *
 * Toda acción del panel deja una fila acá. El registro no es un log técnico:
 * es la respuesta a "¿quién suspendió este perfil y por qué?", que es lo
 * primero que se pregunta cuando una decisión se discute.
 *
 * `before` y `after` guardan solo datos no sensibles: nunca teléfonos,
 * emails ni documentos. Para eso están los ids y los motivos.
 */

export type ActorAuditoria = {
  id: string
  email: string
}

export type EntradaAuditoria = {
  actor: ActorAuditoria
  accion: string
  entidad: string
  entidadId?: string | null
  antes?: Prisma.InputJsonValue
  despues?: Prisma.InputJsonValue
  ipHash?: string | null
}

type ClienteTransaccion = Pick<Prisma.TransactionClient, 'auditLog'>

/**
 * Escribe la fila de auditoría.
 *
 * Acepta un cliente de transacción para que la acción y su rastro entren o
 * fallen juntos. Una suspensión sin auditoría es peor que una suspensión
 * fallida: no se puede revertir con criterio.
 */
export async function registrarAuditoria(
  entrada: EntradaAuditoria,
  cliente: ClienteTransaccion = prisma,
): Promise<void> {
  await cliente.auditLog.create({
    data: {
      actorId: entrada.actor.id,
      actorEmail: entrada.actor.email,
      action: entrada.accion,
      entityType: entrada.entidad,
      entityId: entrada.entidadId ?? null,
      before: entrada.antes,
      after: entrada.despues,
      ipHash: entrada.ipHash ?? null,
    },
  })
}

export type FiltrosAuditoria = {
  accion?: string
  actorEmail?: string
  pagina?: number
}

export type FilaAuditoria = {
  id: string
  actorEmail: string
  action: string
  entityType: string
  entityId: string | null
  before: Prisma.JsonValue
  after: Prisma.JsonValue
  createdAt: Date
}

/** Listado paginado, más nuevo primero. */
export async function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<{
  filas: FilaAuditoria[]
  pagina: ReturnType<typeof calcularPagina>
}> {
  const where: Prisma.AuditLogWhereInput = {}

  if (filtros.accion?.trim()) {
    where.action = { contains: filtros.accion.trim(), mode: 'insensitive' }
  }

  if (filtros.actorEmail?.trim()) {
    where.actorEmail = { contains: filtros.actorEmail.trim(), mode: 'insensitive' }
  }

  const total = await prisma.auditLog.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      actorEmail: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
    },
  })

  return { filas, pagina }
}
