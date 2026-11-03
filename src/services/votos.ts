import { Prisma, ProfileType, Province, UserRole } from '@prisma/client'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { dominiosDesechablesExtra } from '@/services/configuracion'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'
import { esEmailDesechable, registrarRiesgo } from '@/services/riesgo'
import { ERROR_CODES, err, ok, type Resultado } from '@/types/resultado'

/** Umbral de votos por hora que dispara la señal de abuso. */
const VOTOS_POR_HORA_PARA_SENAL = 10

/** Ventana para agrupar votos con dominio desechable. */
const VENTANA_DOMINIOS_MS = 7 * 24 * 60 * 60 * 1000

/** Votos del mismo dominio desechable que disparan la señal. */
const DOMINIOS_PARA_SENAL = 3

export type MotivoNoVotable =
  | 'SIN_SESION'
  | 'NO_ES_CLIENTE'
  | 'PERFIL_NO_DISPONIBLE'
  | 'ES_TU_PERFIL'
  | 'SIN_CONTACTO'
  | 'CONTACTO_RECIENTE'

export type EstadoVoto = {
  votado: boolean
  corazones: number
  puedeVotar: boolean
  motivo: MotivoNoVotable | null
  /** Horas que faltan para poder votar, cuando aplica. */
  horasRestantes: number | null
}

/**
 * Estado del corazón para pintar la card o /mis-contactos.
 *
 * No crea ni borra nada. Es la consulta que decide si el botón alterna o
 * muestra el tooltip explicativo.
 */
export async function estadoVoto(params: {
  profileId: string
  clientId?: string | null
  ahora?: Date
}): Promise<EstadoVoto> {
  const ahora = params.ahora ?? new Date()

  const perfil = await prisma.profile.findFirst({
    where: { id: params.profileId, ...CONDICION_PERFIL_PUBLICO },
    select: { id: true, userId: true, heartsCount: true, user: { select: { email: true } } },
  })

  if (!perfil) {
    return {
      votado: false,
      corazones: 0,
      puedeVotar: false,
      motivo: 'PERFIL_NO_DISPONIBLE',
      horasRestantes: null,
    }
  }

  if (!params.clientId) {
    return {
      votado: false,
      corazones: perfil.heartsCount,
      puedeVotar: false,
      motivo: 'SIN_SESION',
      horasRestantes: null,
    }
  }

  const [cliente, voto, contacto] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.clientId },
      select: { id: true, role: true, email: true },
    }),
    prisma.profileVote.findUnique({
      where: { profileId_clientId: { profileId: perfil.id, clientId: params.clientId } },
      select: { id: true },
    }),
    prisma.contactIntent.findFirst({
      where: { profileId: perfil.id, clientId: params.clientId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const votado = Boolean(voto)
  const base = { votado, corazones: perfil.heartsCount }

  if (!cliente || cliente.role !== UserRole.CLIENT) {
    return { ...base, puedeVotar: false, motivo: 'NO_ES_CLIENTE', horasRestantes: null }
  }

  if (cliente.id === perfil.userId || cliente.email === perfil.user.email) {
    return { ...base, puedeVotar: false, motivo: 'ES_TU_PERFIL', horasRestantes: null }
  }

  if (!contacto) {
    return { ...base, puedeVotar: false, motivo: 'SIN_CONTACTO', horasRestantes: null }
  }

  const minimoMs = env.vote.minHoursAfterContact * 60 * 60 * 1000
  const transcurrido = ahora.getTime() - contacto.createdAt.getTime()

  if (transcurrido < minimoMs) {
    const horasRestantes = Math.ceil((minimoMs - transcurrido) / (60 * 60 * 1000))
    return {
      ...base,
      puedeVotar: false,
      motivo: 'CONTACTO_RECIENTE',
      horasRestantes,
    }
  }

  return { ...base, puedeVotar: true, motivo: null, horasRestantes: null }
}

/**
 * Pone o saca el corazón.
 *
 * Las reglas se verifican de nuevo acá, no se confía en lo que dijo la UI:
 * sesión CLIENT, perfil publicado, no ser el dueño y haber contactado al
 * menos `VOTE_MIN_HOURS_AFTER_CONTACT` horas antes. El rate limit de 20 por
 * hora vive en la Server Action, que es quien tiene la IP o el usuario.
 */
export async function alternarVoto(params: {
  profileId: string
  clientId: string
  ahora?: Date
}): Promise<Resultado<{ votado: boolean; corazones: number }>> {
  const ahora = params.ahora ?? new Date()

  const [perfil, cliente] = await Promise.all([
    prisma.profile.findFirst({
      where: { id: params.profileId, ...CONDICION_PERFIL_PUBLICO },
      select: { id: true, userId: true, user: { select: { email: true } } },
    }),
    prisma.user.findUnique({
      where: { id: params.clientId },
      select: { id: true, role: true, email: true },
    }),
  ])

  if (!perfil) {
    return err('Ese perfil no está disponible.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (!cliente || cliente.role !== UserRole.CLIENT) {
    return err('Necesitás una cuenta de cliente para valorar.', ERROR_CODES.SIN_PERMISOS)
  }

  if (cliente.id === perfil.userId || cliente.email === perfil.user.email) {
    return err('No podés valorar tu propio perfil.', ERROR_CODES.SIN_PERMISOS)
  }

  const limite = new Date(
    ahora.getTime() - env.vote.minHoursAfterContact * 60 * 60 * 1000,
  )

  const contacto = await prisma.contactIntent.findFirst({
    where: {
      profileId: perfil.id,
      clientId: params.clientId,
      createdAt: { lte: limite },
    },
    select: { id: true },
  })

  if (!contacto) {
    return err(
      `Podés valorar a este profesional después de ${env.vote.minHoursAfterContact} horas de haberlo contactado.`,
      ERROR_CODES.SIN_PERMISOS,
    )
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Un lock por par evita que dos requests simultáneos lean "no votó" y
      // los dos intenten crear. La restricción única también protege, pero
      // con P2002 una de las dos operaciones falla en vez de resolverse.
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`voto:${perfil.id}:${params.clientId}`}))) AS bloqueo`

      const existente = await tx.profileVote.findUnique({
        where: {
          profileId_clientId: { profileId: perfil.id, clientId: params.clientId },
        },
        select: { id: true },
      })

      if (existente) {
        await tx.profileVote.delete({ where: { id: existente.id } })

        // updateMany con `gt: 0` evita dejar el contador en negativo si una
        // inconsistencia vieja lo puso en cero.
        await tx.profile.updateMany({
          where: { id: perfil.id, heartsCount: { gt: 0 } },
          data: { heartsCount: { decrement: 1 } },
        })
      } else {
        await tx.profileVote.create({
          data: { profileId: perfil.id, clientId: params.clientId, createdAt: ahora },
        })
        await tx.profile.update({
          where: { id: perfil.id },
          data: { heartsCount: { increment: 1 } },
        })
      }

      const actualizado = await tx.profile.findUniqueOrThrow({
        where: { id: perfil.id },
        select: { heartsCount: true },
      })

      return { votado: !existente, corazones: actualizado.heartsCount }
    })

    if (resultado.votado) {
      await evaluarRiesgosDeVoto(perfil.id, params.clientId, ahora).catch(() => {
        /* el voto ya está hecho: una señal que no se registra no lo revierte */
      })
    }

    return ok(resultado)
  } catch (error: unknown) {
    // P2002: el lock no existió (otra instancia, otro camino) y la unique
    // frenó el duplicado. El estado correcto es "votado"; se devuelve el
    // contador real en vez de un error que la UI no sabría explicar.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const actual = await prisma.profile.findUnique({
        where: { id: perfil.id },
        select: { heartsCount: true },
      })

      return ok({ votado: true, corazones: actual?.heartsCount ?? 0 })
    }

    return err('No pudimos registrar tu voto. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Anula un voto desde administración.
 *
 * Borra el voto, corrige el contador y deja rastro en `AuditLog`. El motivo es
 * obligatorio: una anulación sin explicación es indistinguible de un error.
 */
export async function anularVoto(params: {
  voteId: string
  motivo: string
  actor: { id: string; email: string }
}): Promise<Resultado<{ corazones: number }>> {
  const motivo = params.motivo.trim()

  if (motivo.length < 5) {
    return err('Escribí el motivo de la anulación.', ERROR_CODES.VALIDACION)
  }

  const voto = await prisma.profileVote.findUnique({
    where: { id: params.voteId },
    select: { id: true, profileId: true, clientId: true },
  })

  if (!voto) {
    return err('Ese voto ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    const corazones = await prisma.$transaction(async (tx) => {
      await tx.profileVote.delete({ where: { id: voto.id } })

      await tx.profile.updateMany({
        where: { id: voto.profileId, heartsCount: { gt: 0 } },
        data: { heartsCount: { decrement: 1 } },
      })

      await tx.auditLog.create({
        data: {
          actorId: params.actor.id,
          actorEmail: params.actor.email,
          action: 'ANULAR_VOTO',
          entityType: 'ProfileVote',
          entityId: voto.id,
          before: { profileId: voto.profileId, clientId: voto.clientId },
          after: { motivo },
        },
      })

      const perfil = await tx.profile.findUniqueOrThrow({
        where: { id: voto.profileId },
        select: { heartsCount: true },
      })

      return perfil.heartsCount
    })

    return ok({ corazones })
  } catch {
    return err('No pudimos anular el voto. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

export type ContactoDelCliente = {
  profileId: string
  slug: string
  nombre: string
  tipo: ProfileType
  imagenUrl: string | null
  ciudad: string | null
  provincia: Province | null
  rubro: string | null
  corazones: number
  votado: boolean
  puedeVotar: boolean
  motivo: MotivoNoVotable | null
  horasRestantes: number | null
  contactadoEn: Date
  publicado: boolean
}

/**
 * Profesionales contactados por un cliente.
 *
 * Deduplica por perfil aunque haya varios ContactIntent: el cliente quiere
 * ver "a quién contacté", no cuántas veces abrió el mismo WhatsApp. La
 * consulta trae todo lo necesario para pintar la lista sin N+1.
 */
export async function listarContactos(params: {
  clientId: string
  ahora?: Date
}): Promise<ContactoDelCliente[]> {
  const ahora = params.ahora ?? new Date()

  const intenciones = await prisma.contactIntent.findMany({
    where: { clientId: params.clientId },
    orderBy: { createdAt: 'desc' },
    distinct: ['profileId'],
    select: {
      createdAt: true,
      profile: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          isPublished: true,
          heartsCount: true,
          images: {
            where: { isHidden: false },
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { url: true },
          },
          baseCity: { select: { name: true, province: true } },
          categories: {
            where: { isPrimary: true },
            take: 1,
            select: { category: { select: { name: true } } },
          },
        },
      },
    },
  })

  const ids = intenciones.map((intencion) => intencion.profile.id)

  const votos = ids.length
    ? await prisma.profileVote.findMany({
        where: { clientId: params.clientId, profileId: { in: ids } },
        select: { profileId: true },
      })
    : []

  const votados = new Set(votos.map((voto) => voto.profileId))
  const minimoMs = env.vote.minHoursAfterContact * 60 * 60 * 1000

  return intenciones.map(({ createdAt, profile }) => {
    const transcurrido = ahora.getTime() - createdAt.getTime()
    const habilitadoPorTiempo = transcurrido >= minimoMs
    const puedeVotar = profile.isPublished && habilitadoPorTiempo
    const votado = votados.has(profile.id)

    return {
      profileId: profile.id,
      slug: profile.slug,
      nombre: profile.name,
      tipo: profile.type,
      imagenUrl: profile.images[0]?.url ?? null,
      ciudad: profile.baseCity?.name ?? null,
      provincia: profile.baseCity?.province ?? null,
      rubro: profile.categories[0]?.category.name ?? null,
      corazones: profile.heartsCount,
      votado,
      puedeVotar,
      motivo: !profile.isPublished
        ? 'PERFIL_NO_DISPONIBLE'
        : !habilitadoPorTiempo
          ? 'CONTACTO_RECIENTE'
          : null,
      horasRestantes: habilitadoPorTiempo
        ? null
        : Math.ceil((minimoMs - transcurrido) / (60 * 60 * 1000)),
      contactadoEn: createdAt,
      publicado: profile.isPublished,
    }
  })
}

/**
 * Señales de abuso del corazón.
 *
 * Son contexto, no bloqueo: un cliente entusiasta puede votar diez perfiles
 * en una hora sin ser un atacante. La señal existe para que alguien mire el
 * patrón completo, no para sancionar automáticamente.
 */
async function evaluarRiesgosDeVoto(
  profileId: string,
  clientId: string,
  ahora: Date,
): Promise<void> {
  const desdeUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000)

  const votosDelCliente = await prisma.profileVote.count({
    where: { clientId, createdAt: { gte: desdeUnaHora } },
  })

  if (votosDelCliente >= VOTOS_POR_HORA_PARA_SENAL) {
    const yaSenalado = await prisma.riskSignal.findFirst({
      where: {
        profileId,
        type: 'MUCHOS_VOTOS_MISMO_CLIENTE',
        resolvedAt: null,
        createdAt: { gte: desdeUnaHora },
      },
      select: { id: true },
    })

    if (!yaSenalado) {
      await registrarRiesgo(profileId, 'MUCHOS_VOTOS_MISMO_CLIENTE', {
        votosUltimaHora: votosDelCliente,
        umbral: VOTOS_POR_HORA_PARA_SENAL,
      })
    }
  }

  const desdeVentana = new Date(ahora.getTime() - VENTANA_DOMINIOS_MS)

  const votantes = await prisma.profileVote.findMany({
    where: { profileId, createdAt: { gte: desdeVentana } },
    select: { client: { select: { email: true } } },
  })

  const porDominio = new Map<string, number>()
  const dominiosExtra = await dominiosDesechablesExtra()

  for (const { client } of votantes) {
    if (!esEmailDesechable(client.email, dominiosExtra)) continue

    const dominio = client.email.slice(client.email.lastIndexOf('@') + 1).toLowerCase()
    porDominio.set(dominio, (porDominio.get(dominio) ?? 0) + 1)
  }

  for (const [dominio, votos] of porDominio) {
    if (votos < DOMINIOS_PARA_SENAL) continue

    const yaSenalado = await prisma.riskSignal.findFirst({
      where: {
        profileId,
        type: 'VOTOS_DOMINIO_DESECHABLE',
        resolvedAt: null,
        createdAt: { gte: desdeVentana },
      },
      select: { id: true },
    })

    if (yaSenalado) continue

    await registrarRiesgo(profileId, 'VOTOS_DOMINIO_DESECHABLE', {
      dominio,
      votos,
      ventanaDias: 7,
    })
  }
}

