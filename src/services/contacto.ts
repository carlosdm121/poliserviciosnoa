import { Prisma } from '@prisma/client'

import { enlaceWhatsApp } from '@/lib/constantes'
import { prisma } from '@/lib/prisma'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'
import { ERROR_CODES, err, ok, type Resultado } from '@/types/resultado'

/** Ventana durante la cual un mismo cliente no vuelve a sumar contacto. */
const VENTANA_CONTACTO_MS = 24 * 60 * 60 * 1000

export type ContactoRegistrado = {
  /** URL de WhatsApp con el mensaje ya codificado. */
  url: string
  /** Si el clic se contó (false para bots). */
  contado: boolean
  /** Si se creó un ContactIntent nuevo. */
  intencionCreada: boolean
}

/**
 * Registra el clic de WhatsApp y redirige.
 *
 * El clic y la estadística diaria se escriben siempre juntos. El
 * `ContactIntent` solo existe cuando hay sesión CLIENT: para un visitante
 * anónimo no hay identidad y no se inventa una guardando IP o huella.
 *
 * La ventana de 24 h se protege con un advisory lock por par
 * cliente/perfil. Sin lock, dos pestañas abiertas al mismo tiempo pueden
 * leer "no hay contacto previo" y crear dos intenciones, inflando el
 * contador de contactos.
 */
export async function registrarContacto(params: {
  slug: string
  clientId?: string | null
  /** Los bots no suman métricas, pero igual se los redirige. */
  contar?: boolean
  ahora?: Date
}): Promise<Resultado<ContactoRegistrado>> {
  const ahora = params.ahora ?? new Date()

  const perfil = await prisma.profile.findFirst({
    where: { slug: params.slug, ...CONDICION_PERFIL_PUBLICO },
    select: { id: true, userId: true, whatsappE164: true },
  })

  if (!perfil) {
    return err('Ese perfil no está disponible.', ERROR_CODES.NO_ENCONTRADO)
  }

  const url = enlaceWhatsApp(perfil.whatsappE164.replace(/\D/g, ''))

  if (params.contar === false) {
    return ok({ url, contado: false, intencionCreada: false })
  }

  const dia = diaEstadistica(ahora)
  let intencionCreada = false

  await prisma.$transaction(async (tx) => {
    const datosPerfil: Prisma.ProfileUpdateInput = {
      whatsappClicks: { increment: 1 },
    }

    if (params.clientId && params.clientId !== perfil.userId) {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`contacto:${params.clientId}:${perfil.id}`}))) AS bloqueo`

      const ultimo = await tx.contactIntent.findFirst({
        where: { clientId: params.clientId, profileId: perfil.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })

      const vencido =
        !ultimo || ahora.getTime() - ultimo.createdAt.getTime() >= VENTANA_CONTACTO_MS

      if (vencido) {
        await tx.contactIntent.create({
          data: {
            clientId: params.clientId,
            profileId: perfil.id,
            createdAt: ahora,
          },
        })

        datosPerfil.contactsCount = { increment: 1 }
        intencionCreada = true
      }
    }

    await tx.profile.update({ where: { id: perfil.id }, data: datosPerfil })

    await tx.profileDailyStat.upsert({
      where: { profileId_date: { profileId: perfil.id, date: dia } },
      create: {
        profileId: perfil.id,
        date: dia,
        whatsappClicks: 1,
      },
      update: { whatsappClicks: { increment: 1 } },
    })
  })

  return ok({ url, contado: true, intencionCreada })
}

/**
 * Día de la estadística.
 *
 * Se usa UTC porque es la convención del proyecto para fechas de negocio y
 * porque `@db.Date` guarda un día, no un instante. El corte a las 21:00 de
 * Tucumán es una limitación conocida; el dato que importa es la tendencia,
 * no el minuto exacto.
 */
export function diaEstadistica(ahora: Date): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))
}
