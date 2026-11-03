/**
 * Reglas puras del módulo 3.5 — invitación a valorar por email.
 *
 * Las consultas a la base y el envío de email viven en el job
 * (`src/server/jobs/invitaciones.ts`). Acá va lo que se puede decidir con
 * objetos en la mano: firma del enlace de baja, elegibilidad y límite semanal.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/** Horas mínimas desde el contacto hasta que se invita a valorar. */
export const HORAS_MINIMAS_DESPUES_DE_CONTACTO = 48

/** Máximo de invitaciones por cliente en una semana. */
export const MAX_INVITACIONES_POR_CLIENTE_POR_SEMANA = 3

/** Ventana de la semana en milisegundos. */
export const VENTANA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000

/** Par cliente/perfil que ya recibió invitación o voto. */
export type ParClientePerfil = {
  clientId: string
  profileId: string
}

/** Candidato a invitación, tal como llega de la consulta del job. */
export type CandidatoInvitacion = {
  clientId: string
  profileId: string
  clientEmail: string
  clientName: string | null
  profileName: string
  profileSlug: string
  contactadoEn: Date
}

/** Firma HMAC-SHA256 del enlace de baja de invitaciones. */
export function firmarBaja(clientId: string): string {
  return createHmac('sha256', env.CRON_SECRET)
    .update(`baja:invitacion:${clientId}`)
    .digest('hex')
}

/**
 * Verifica la firma de un enlace de baja en tiempo constante.
 *
 * Devuelve false si el largo de la firma no coincide (evita que
 * `timingSafeEqual` tire por buffers de distinto largo).
 */
export function verificarFirmaBaja(clientId: string, sig: string): boolean {
  const esperado = firmarBaja(clientId)

  if (sig.length !== esperado.length) return false

  return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(esperado, 'utf8'))
}

/**
 * Filtra candidatos eliminando quienes ya tienen voto o invitación previa.
 *
 * Se pasa por separado los sets de pares (clientId, profileId) que ya tienen
 * voto o invitación, consultados de una vez en la base para no hacer N+1.
 */
export function filtrarElegibles(
  candidatos: CandidatoInvitacion[],
  paresConVoto: Set<string>,
  paresConInvitacion: Set<string>,
): CandidatoInvitacion[] {
  return candidatos.filter(
    (c) =>
      !paresConVoto.has(`${c.clientId}:${c.profileId}`) &&
      !paresConInvitacion.has(`${c.clientId}:${c.profileId}`),
  )
}

/**
 * Aplica el límite de 3 invitaciones por cliente por semana.
 *
 * `enviadasEstaSemana` es un mapa clientId → cantidad ya enviadas esta
 * semana (incluyendo las de esta misma corrida, que se van sumando a medida
 * que se procesan).
 */
export function aplicarLimiteSemanal(
  elegibles: CandidatoInvitacion[],
  enviadasEstaSemana: Map<string, number>,
): CandidatoInvitacion[] {
  const resultado: CandidatoInvitacion[] = []

  for (const c of elegibles) {
    const ya = enviadasEstaSemana.get(c.clientId) ?? 0
    if (ya >= MAX_INVITACIONES_POR_CLIENTE_POR_SEMANA) continue

    resultado.push(c)
    enviadasEstaSemana.set(c.clientId, ya + 1)
  }

  return resultado
}

/**
 * Fecha límite: contactos más viejos que esta fecha son elegibles.
 */
export function limiteContactoElegible(ahora: Date): Date {
  return new Date(ahora.getTime() - HORAS_MINIMAS_DESPUES_DE_CONTACTO * 60 * 60 * 1000)
}

/**
 * Inicio de la ventana semanal para contar invitaciones ya enviadas.
 */
export function inicioVentanaSemanal(ahora: Date): Date {
  return new Date(ahora.getTime() - VENTANA_SEMANA_MS)
}
