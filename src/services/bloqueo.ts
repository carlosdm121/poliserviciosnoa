import { Prisma } from '@prisma/client'

import { hashTelefono, hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Lista de bloqueo de identificadores.
 *
 * Reemplaza lo que aportaba el KYC como filtro: un profesional que se suspende
 * por fraude tiene su teléfono y su email bloqueados, así que no puede volver
 * con la misma cuenta,. Tampoco puede cambiar de número para esquivar el
 * bloqueo si el CUIT o el teléfono viejo están en la lista.
 *
 * Se guarda el HASH, nunca el valor. La lista cumple dos funciones —impedir un
 * alta y tapar un número ya usado— y ninguna necesita recuperar el dato. Si se
 * lleva la base no obtiene los teléfonos ni los emails de los bloqueados, que
 * es justamente lo que un atacante busca.
 */

export type TipoBloqueo = 'WHATSAPP_HASH' | 'EMAIL' | 'CUIT_HASH'

/** Hash del email, en minúsculas, tal como se guarda en `User.email`. */
export function hashEmail(email: string): string {
  return hashValor(email.trim().toLowerCase())
}

/** Hash de un teléfono ya normalizado a E.164. */
export function hashTelefonoBloqueado(e164: string): string {
  return hashTelefono(e164)
}

/**
 * ¿Está bloqueado este identificador?
 *
 * Se consulta en el registro, en la verificación del número y al cargar un
 * CUIT. Son los tres momentos en los que alguien podría estar reinscribiendo
 * con la misma identidad bloqueada.
 *
 * @param tipo Qué se está consultando. El mismo valor puede estar bloqueado
 *   como email y permitido como teléfono: son cosas distintas.
 * @param valor Valor en claro. Se hashea adentro; el llamador nunca ve el hash.
 */
export async function estaBloqueado(tipo: TipoBloqueo, valor: string): Promise<boolean> {
  const valueHash = hashearSegun(tipo, valor)

  if (!valueHash) return false

  const bloqueado = await prisma.blockedIdentifier.findUnique({
    where: { type_valueHash: { type: tipo, valueHash } },
    select: { id: true },
  })

  return bloqueado !== null
}

/**
 * Bloquea un identificador.
 *
 * Solo lo llama una acción de administrador, y siempre con motivo: un bloqueo
 * sin motivo escrito es indistinguible de un error, y después nadie puede
 * revertirlo con criterio.
 *
 * Idempotente: si ya estaba bloqueado devuelve `ok` sin duplicar la fila, para
 * que reintentar una suspensión no falle.
 */
export async function bloquearIdentificador(
  tipo: TipoBloqueo,
  valor: string,
  motivo: string,
  adminEmail: string,
): Promise<Resultado<null>> {
  if (!motivo.trim()) {
    return err('Escribí por qué se bloquea. Sin motivo no queda registro.', ERROR_CODES.VALIDACION)
  }

  const valueHash = hashearSegun(tipo, valor)

  if (!valueHash) {
    return err('Ese valor no se puede bloquear.', ERROR_CODES.VALIDACION)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.blockedIdentifier.upsert({
        where: { type_valueHash: { type: tipo, valueHash } },
        create: { type: tipo, valueHash, reason: motivo.trim(), createdBy: adminEmail },
        update: { reason: motivo.trim(), createdBy: adminEmail },
      })

      await tx.auditLog.create({
        data: {
          actorId: adminEmail,
          actorEmail: adminEmail,
          action: 'bloqueo.agregar',
          entityType: 'BlockedIdentifier',
          entityId: valueHash,
          after: { tipo, motivo: motivo.trim() },
        },
      })
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error('bloqueo: error al bloquear el identificador', { error, tipo })
      return err('No pudimos registrar el bloqueo.', ERROR_CODES.DESCONOCIDO)
    }

    throw error
  }

  logger.info('bloqueo: identificador bloqueado', { tipo, motivo: motivo.trim() })

  return ok(null)
}

/**
 * Levanta un bloqueo.
 *
 * Va con AuditLog por la misma razón que el alta: si alguien levanta el
 * bloqueo de una persona por error, hay que poder saber quién y cuándo.
 */
export async function desbloquearIdentificador(
  tipo: TipoBloqueo,
  valor: string,
  adminEmail: string,
): Promise<Resultado<null>> {
  const valueHash = hashearSegun(tipo, valor)

  if (!valueHash) {
    return err('Ese valor no se puede desbloquear.', ERROR_CODES.VALIDACION)
  }

  const bloqueado = await prisma.blockedIdentifier.findUnique({
    where: { type_valueHash: { type: tipo, valueHash } },
    select: { id: true },
  })

  if (!bloqueado) {
    return err('Ese identificador no estaba bloqueado.', ERROR_CODES.NO_ENCONTRADO)
  }

  await prisma.$transaction([
    prisma.blockedIdentifier.delete({ where: { id: bloqueado.id } }),
    prisma.auditLog.create({
      data: {
        actorId: adminEmail,
        actorEmail: adminEmail,
        action: 'bloqueo.quitar',
        entityType: 'BlockedIdentifier',
        entityId: valueHash,
        before: { tipo },
      },
    }),
  ])

  return ok(null)
}

/** Lista de bloqueos, para el panel de administración. */
export async function listarBloqueos(): Promise<
  { type: string; reason: string; createdBy: string; createdAt: Date }[]
> {
  return prisma.blockedIdentifier.findMany({
    orderBy: { createdAt: 'desc' },
    select: { type: true, reason: true, createdBy: true, createdAt: true },
  })
}

/** Hash según el tipo. Devuelve `null` si el valor no tiene forma válida. */
function hashearSegun(tipo: TipoBloqueo, valor: string): string | null {
  const limpio = valor.trim()

  if (!limpio) return null

  switch (tipo) {
    case 'EMAIL':
      // Un email sin arroba no es un email; hashearlo lo convertiría en un
      // bloqueo que nunca coincide con nada.
      return limpio.includes('@') ? hashEmail(limpio) : null

    case 'WHATSAPP_HASH':
      return /^\d{11,13}$/.test(limpio) ? hashTelefono(limpio) : null

    case 'CUIT_HASH':
      return /^\d{11}$/.test(limpio) ? hashValor(limpio) : null

    default:
      return null
  }
}