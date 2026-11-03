import { WhatsAppVerificationStatus } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * Servicio de monitoreo.
 *
 * Lee los últimos errores de webhooks (Mercado Pago y WhatsApp) y las últimas
 * corridas del cron para el panel de administración. No expone datos
 * personales: los campos de error son mensajes técnicos, no cuerpos de
 * petición ni tokens.
 */

export type ErrorWebhook = {
  id: string
  proveedor: string
  tipoEvento: string
  error: string | null
  creadoEn: Date
}

export type EjecucionCron = {
  id: string
  job: string
  ok: boolean
  procesados: number
  errores: number
  duracionMs: number
  error: string | null
  detalle: string | null
  ejecutadoEn: Date
}

export type EstadoMonitoreo = {
  webhooks: ErrorWebhook[]
  cron: EjecucionCron[]
  erroresWebhook24h: number
  cronFallido24h: number
  verificacionesVencidas24h: number
  verificacionesPendientesVencidas: number
}

/** Cuántos errores de webhook mostrar en el panel. */
const LIMITE_WEBHOOKS = 20

/** Cuántas corridas del cron mostrar en el panel. */
const LIMITE_CRON = 20

export async function obtenerEstadoMonitoreo(): Promise<EstadoMonitoreo> {
  const ahora = new Date()
  const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)

  const [
    webhooks,
    cron,
    erroresWebhook24h,
    cronFallido24h,
    verificacionesVencidas24h,
    verificacionesPendientesVencidas,
  ] = await Promise.all([
      // Últimos webhooks con error, de Mercado Pago y WhatsApp.
      prisma.webhookEvent.findMany({
        where: {
          error: { not: null },
          provider: { in: ['mercadopago', 'whatsapp'] },
        },
        orderBy: { createdAt: 'desc' },
        take: LIMITE_WEBHOOKS,
        select: {
          id: true,
          provider: true,
          eventType: true,
          error: true,
          createdAt: true,
        },
      }),

      // Últimas corridas del cron.
      prisma.cronJobRun.findMany({
        orderBy: { ejecutadoEn: 'desc' },
        take: LIMITE_CRON,
        select: {
          id: true,
          job: true,
          ok: true,
          procesados: true,
          errores: true,
          duracionMs: true,
          error: true,
          detalle: true,
          ejecutadoEn: true,
        },
      }),

      // Errores de webhook en las últimas 24 h.
      prisma.webhookEvent.count({
        where: {
          error: { not: null },
          provider: { in: ['mercadopago', 'whatsapp'] },
          createdAt: { gte: hace24h },
        },
      }),

      // Corridas del cron fallidas en las últimas 24 h.
      prisma.cronJobRun.count({
        where: {
          ok: false,
          ejecutadoEn: { gte: hace24h },
        },
      }),

      // Verificaciones de WhatsApp vencidas en las últimas 24 h.
      prisma.whatsAppVerification.count({
        where: {
          status: WhatsAppVerificationStatus.EXPIRED,
          createdAt: { gte: hace24h },
        },
      }),

      // Verificaciones que siguen PENDING pero ya vencieron por reloj.
      prisma.whatsAppVerification.count({
        where: {
          status: WhatsAppVerificationStatus.PENDING,
          expiresAt: { lt: ahora },
        },
      }),
    ])

  return {
    webhooks: webhooks.map((w) => ({
      id: w.id,
      proveedor: w.provider,
      tipoEvento: w.eventType,
      error: w.error,
      creadoEn: w.createdAt,
    })),
    cron: cron.map((c) => ({
      id: c.id,
      job: c.job,
      ok: c.ok,
      procesados: c.procesados,
      errores: c.errores,
      duracionMs: c.duracionMs,
      error: c.error,
      detalle: c.detalle,
      ejecutadoEn: c.ejecutadoEn,
    })),
    erroresWebhook24h,
    cronFallido24h,
    verificacionesVencidas24h,
    verificacionesPendientesVencidas,
  }
}

/** Registra un error de webhook para trazabilidad (llamado desde las rutas de webhook). */
export async function registrarErrorWebhook(params: {
  proveedor: string
  tipoEvento: string
  error: string | null
}): Promise<void> {
  try {
    await prisma.webhookEvent.create({
      data: {
        id: crypto.randomUUID(),
        provider: params.proveedor,
        eventType: params.tipoEvento,
        processedAt: null,
        payloadHash: null,
        error: params.error,
      },
    })
  } catch (error: unknown) {
    // Si falla el registro del error, no queremos tumbar el webhook.
    logger.error('monitoreo: no se pudo registrar el error de webhook', {
      proveedor: params.proveedor,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
