import { createHash } from 'node:crypto'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { firmaValidaWebhook } from '@/lib/mp/firma'
import { leerEvento, leerRecursoId } from '@/lib/mp/evento'
import { procesarWebhookMercadoPago } from '@/services/webhook-mercadopago'
import { registrarErrorWebhook } from '@/services/monitoreo'

/**
 * Webhook de Mercado Pago.
 *
 * La ruta hace tres cosas y nada más: verificar la firma, leer el evento y
 * delegar. Todo lo que decide estados vive en el servicio, para que se pueda
 * testear sin levantar Next.
 *
 * **La firma de Mercado Pago no cubre el body.** Firma un manifest con el id
 * del recurso, el `x-request-id` y el `ts`. Eso alcanza para saber que la
 * notificación la mandó Mercado Pago, pero no para confiar en el estado que
 * dice: por eso el servicio vuelve a consultar la API. Acá se valida la firma
 * antes de procesar y se calcula el hash del body solo para trazabilidad.
 */

/** El webhook nunca se cachea: es una ruta con efecto. */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const cuerpoCrudo = await request.text()

  let cuerpo: unknown

  try {
    cuerpo = JSON.parse(cuerpoCrudo) as unknown
  } catch {
    logger.warn('webhook MP: body inválido')
    return new Response('Bad Request', { status: 400 })
  }

  /**
   * El id puede venir en el body o en el query string. Se prefiere el body y se
   * cae al query porque Mercado Pago usó las dos formas según la versión del
   * panel. Sin id no hay manifest que firmar.
   */
  const url = new URL(request.url)
  const recursoId = leerRecursoId(cuerpo) ?? url.searchParams.get('data.id')

  if (!recursoId) {
    logger.warn('webhook MP: notificación sin data.id')
    return new Response('Bad Request', { status: 400 })
  }

  const firmaValida = firmaValidaWebhook({
    dataId: recursoId,
    header: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    secreto: env.MP_WEBHOOK_SECRET,
  })

  if (!firmaValida) {
    // 401 sin detalle: explicar qué parte de la firma falló le sirve al que
    // está probando, no al que opera el sistema.
    logger.warn('webhook MP: firma inválida, notificación rechazada')
    return new Response('Unauthorized', { status: 401 })
  }

  const evento = leerEvento(cuerpo)

  if (!evento) {
    /**
     * Un evento de otro tipo es normal: Mercado Pago manda por la misma URL
     * notificaciones de Point y de otras integraciones. Se responde 200 para
     * que no reintente algo que nunca vamos a procesar.
     */
    return respuesta({ accion: 'ignorado', motivo: 'tipo no soportado' })
  }

  const payloadHash = createHash('sha256').update(cuerpoCrudo, 'utf8').digest('hex')

  const resultado = await procesarWebhookMercadoPago({ evento, payloadHash })

  if (!resultado.ok) {
    logger.error('webhook MP: el procesamiento falló', {
      tipo: evento.tipo,
      recursoId: evento.recursoId,
      error: resultado.error,
    })

    await registrarErrorWebhook({
      proveedor: 'mercadopago',
      tipoEvento: evento.tipo,
      error: resultado.error,
    })

    // 500 para que Mercado Pago reintente. La idempotencia del servicio evita
    // que el reintento duplique el pago o el email.
    return new Response('Internal Server Error', { status: 500 })
  }

  logger.info('webhook MP: notificación procesada', {
    accion: resultado.data.accion,
    tipo: resultado.data.tipo,
    recursoId: resultado.data.recursoId,
  })

  return respuesta(resultado.data)
}

function respuesta(datos: unknown): Response {
  return new Response(JSON.stringify(datos), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
