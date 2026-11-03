import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { enmascararTelefono } from '@/lib/phone'

import type { MensajeWhatsApp, ResultadoEnvio, WhatsAppProvider } from './provider'

/**
 * Proveedor real: Meta WhatsApp Cloud API.
 *
 * Se llama directo a `fetch` contra el endpoint en vez de usar el SDK oficial.
 * El SDK pesa ~200 kB para wrapping de un solo endpoint que son dos POST con
 * JSON, y el presupuesto de bundle del módulo 12 es 150 kB (ver D8).
 *
 * La API responde 200 con un cuerpo que contiene `errors` cuando la petición
 * fue rechazada: si se chequea solo el status HTTP, un token vencido parece un
 * envío exitoso y el profesional nunca recibe la confirmación.
 */

const BASE = 'https://graph.facebook.com/v21.0'

export class WhatsAppCloudProvider implements WhatsAppProvider {
  readonly nombre = 'whatsapp-cloud'

  estaConfigurado(): boolean {
    return Boolean(env.whatsapp.accessToken && env.whatsapp.phoneId)
  }

  async enviarTexto(para: string, mensaje: MensajeWhatsApp): Promise<ResultadoEnvio> {
    if (!this.estaConfigurado()) {
      return {
        ok: false,
        messageId: null,
        detalle: 'La API de WhatsApp no está configurada (faltan token o phone_id).',
      }
    }

    const url = `${BASE}/${env.whatsapp.phoneId}/messages`

    const texto: Record<string, unknown> = { body: mensaje.cuerpo }
    if (mensaje.enlace) texto.preview_url = true

    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: para,
          type: 'text',
          text: texto,
        }),
      })

      const cuerpo = (await respuesta.json()) as {
        messages?: { id?: string }[]
        error?: { message?: string; code?: number }
      }

      const messageId = cuerpo.messages?.[0]?.id ?? null

      if (!respuesta.ok || !messageId || cuerpo.error) {
        const detalle = cuerpo.error?.message ?? `HTTP ${respuesta.status}`

        logger.error('whatsapp: envío rechazado por Meta', {
          status: respuesta.status,
          codigo: cuerpo.error?.code,
          detalle,
        })

        return { ok: false, messageId, detalle }
      }

      return { ok: true, messageId }
    } catch (error) {
      // Red caída o timeout. El estado ya está persistido en la base para
      // cuando esto es una respuesta a una verificación: el profesional ve el
      // OK en pantalla igual, así que hay que dejar rastro del problema.
      logger.error('whatsapp: fallo de red al enviar', {
        error: error instanceof Error ? error.message : String(error),
        para: enmascararTelefono(para),
      })

      return {
        ok: false,
        messageId: null,
        detalle: 'No se pudo contactar al servidor de WhatsApp.',
      }
    }
  }
}