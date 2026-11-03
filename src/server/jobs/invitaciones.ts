import { Prisma } from '@prisma/client'

import { enviarInvitacionVotar } from '@/lib/email'
import {
  aplicarLimiteSemanal,
  filtrarElegibles,
  inicioVentanaSemanal,
  limiteContactoElegible,
  type CandidatoInvitacion,
} from '@/lib/invitacion'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'
import { liberarEmail, reservarEmail } from '@/server/jobs/email-log'
import type { Job, ResultadoJob } from '@/server/jobs/registry'

/**
 * Invitaciones a valorar por email.
 *
 * Depende del módulo 2.7 (registro de jobs del cron) y del 3.1
 * (ContactIntent, votos). El job es idempotente: corre dos veces no manda
 * correos duplicados gracias a `EmailLog` + `VoteInvite`.
 */
export const jobInvitacionesVotar: Job = {
  name: 'invitaciones-votar',

  async run(ahora: Date): Promise<ResultadoJob> {
    const limiteContacto = limiteContactoElegible(ahora)
    const inicioSemana = inicioVentanaSemanal(ahora)

    // 1. Candidatos: contacto mayor a 48 h, perfil publicado, cliente no dado
    //    de baja en las invitaciones.
    const candidatos = await prisma.contactIntent.findMany({
      where: {
        createdAt: { lte: limiteContacto },
        profile: CONDICION_PERFIL_PUBLICO,
        client: {
          voteInvitesOptOut: { not: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        profileId: true,
        clientId: true,
        profile: { select: { id: true, slug: true, name: true } },
        client: { select: { id: true, email: true, name: true } },
      },
    })

    if (candidatos.length === 0) {
      return { procesados: 0 }
    }

    // 2. Quienes ya votaron o ya recibieron invitación para ese par. Se consulta
    //    de una vez para no hacer N+1.
    const pares = candidatos.map((c) => ({
      clientId: c.clientId,
      profileId: c.profileId,
    }))

    const [votosExistentes, invitacionesExistentes] = await Promise.all([
      prisma.profileVote.findMany({
        where: {
          OR: pares,
        },
        select: { clientId: true, profileId: true },
      }),
      prisma.voteInvite.findMany({
        where: {
          OR: pares,
        },
        select: { clientId: true, profileId: true },
      }),
    ])

    const paresConVoto = new Set(
      votosExistentes.map((v) => `${v.clientId}:${v.profileId}`),
    )
    const paresConInvitacion = new Set(
      invitacionesExistentes.map((i) => `${i.clientId}:${i.profileId}`),
    )

    // 3. Elegibles: sin voto y sin invitación previa.
    const elegibles: CandidatoInvitacion[] = filtrarElegibles(
      candidatos.map((c) => ({
        clientId: c.clientId,
        profileId: c.profileId,
        clientEmail: c.client.email,
        clientName: c.client.name,
        profileName: c.profile.name,
        profileSlug: c.profile.slug,
        contactadoEn: c.createdAt,
      })),
      paresConVoto,
      paresConInvitacion,
    )

    // 4. Invitaciones ya enviadas esta semana por cliente (límite 3/semana).
    const yaEnviadasEstaSemana = await prisma.voteInvite.groupBy({
      by: ['clientId'],
      where: { sentAt: { gte: inicioSemana } },
      _count: true,
    })

    const enviadasEstaSemana = new Map(
      yaEnviadasEstaSemana.map((r) => [r.clientId, r._count]),
    )

    // 5. Aplicar el límite semanal.
    const aEnviar = aplicarLimiteSemanal(elegibles, enviadasEstaSemana)

    let procesados = 0
    let errores = 0

    for (const candidato of aEnviar) {
      const reserva = await reservarEmail({
        profileId: candidato.profileId,
        email: candidato.clientEmail,
        template: 'invitacion_votar',
        // Dedupe por cliente + perfil: aunque el cron corra dos veces, el
        // email sale una sola vez.
        dedupeKey: `invitacion_votar:${candidato.clientId}:${candidato.profileId}`,
      })

      if (!reserva) continue

      const envio = await enviarInvitacionVotar({
        email: candidato.clientEmail,
        nombre: candidato.clientName ?? candidato.profileName,
        nombreProfesional: candidato.profileName,
        slug: candidato.profileSlug,
        clientId: candidato.clientId,
      })

      if (!envio.ok) {
        await liberarEmail(reserva)
        errores += 1
        logger.warn('cron: no se pudo enviar la invitación a votar', {
          clientId: candidato.clientId,
          profileId: candidato.profileId,
          error: envio.error,
        })
        continue
      }

      await prisma.voteInvite.create({
        data: {
          clientId: candidato.clientId,
          profileId: candidato.profileId,
          sentAt: ahora,
        },
      })

      procesados += 1
    }

    return { procesados, errores }
  },
}
