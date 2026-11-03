import { NextResponse } from 'next/server'
import { z } from 'zod'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { normalizarWhatsapp } from '@/lib/phone'
import { firmaValida } from '@/lib/whatsapp/firma'
import { procesarMensajeEntrante } from '@/services/verificacion-whatsapp'
import { registrarErrorWebhook } from '@/services/monitoreo'

/**
 * Webhook de Meta WhatsApp Cloud API.
 *
 * Es la única puerta por la que entra un mensaje al sistema, así que la
 * validación de la firma no es opcional: sin ella, cualquiera que encuentre la
 * URL podría mandar mensajes con el formato de Meta y confirmar códigos de
 * verificación en nombre de otros.
 *
 * Regla general del proyecto: responder rápido. Meta da un timeout corto y
 * reintenta; cada reintento vuelve a pasar por la guarda de idempotencia del
 * servicio.
 */

/** El webhook nunca se cachea: es una ruta con efecto. */
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — handshake de Meta
// ---------------------------------------------------------------------------

/**
 * Suscripción del webhook.
 *
 * Meta manda GET una sola vez, al configurar la URL, para comprobar que
 * quien la responde conoce el token. Si se devuelve el `challenge` sin
 * verificarlo, cualquiera puede apuntar su webhook a nuestra URL y ver los
 * mensajes de los clientes.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)

  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (modo !== 'subscribe' || token !== env.whatsapp.verifyToken || !challenge) {
    logger.warn('whatsapp: handshake rechazado')
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ---------------------------------------------------------------------------
// POST — mensajes entrantes
// ---------------------------------------------------------------------------

/** Forma mínima del payload. No se valida entero: llega solo lo que se usa. */
const mensajeEntrante = z.object({
  id: z.string(),
  from: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
})

const webhook = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z.array(mensajeEntrante).optional(),
            }),
          }),
        ),
      }),
    )
    .optional(),
})

export async function POST(request: Request): Promise<Response> {
  const cuerpoCrudo = await request.text()

  if (!firmaValida(cuerpoCrudo, request.headers.get('x-hub-signature-256'))) {
    // 401 y no un detalle: decir "tu firma no coincide" confirma que la ruta
    // existe y cómo funciona.
    logger.warn('whatsapp: firma inválida, webhook rechazado')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const parseado = webhook.safeParse(JSON.parse(cuerpoCrudo) as unknown)

  if (!parseado.success) {
    // Un payload con otra forma no es un ataque: Meta manda estados de
    // entrega, reacciones y multimedia con la misma ruta.
    return new NextResponse('OK', { status: 200 })
  }

  const mensajes = parseado.data.entry?.flatMap((entrada) =>
    entrada.changes.flatMap((cambio) => cambio.value.messages ?? []),
  )

  for (const mensaje of mensajes ?? []) {
    // Anything que no sea un mensaje de texto no tiene código que extraer.
    if (mensaje.type !== 'text' || !mensaje.text) continue

    const remitente = normalizarWhatsapp(mensaje.from) ?? mensaje.from

    try {
      const resultado = await procesarMensajeEntrante(remitente, mensaje.text.body, mensaje.id)

      if (!resultado.ok) {
        // Error de base: se devuelve 500 para que Meta reintente. La guarda de
        // idempotencia evita que el reintento duplique efectos.
        logger.error('whatsapp: el procesamiento falló', { error: resultado.error })

        await registrarErrorWebhook({
          proveedor: 'whatsapp',
          tipoEvento: 'mensaje',
          error: resultado.error,
        })

        return new NextResponse('Internal Server Error', { status: 500 })
      }

      logger.info('whatsapp: mensaje procesado', {
        accion: resultado.data.accion,
        tipo: mensaje.type,
      })
    } catch (error: unknown) {
      logger.error('whatsapp: excepción procesando el mensaje', {
        error: error instanceof Error ? error.message : String(error),
      })

      await registrarErrorWebhook({
        proveedor: 'whatsapp',
        tipoEvento: 'mensaje',
        error: error instanceof Error ? error.message : String(error),
      })

      return new NextResponse('Internal Server Error', { status: 500 })
    }
  }

  // 200 siempre que no haya habido un error transitorio, incluso si no había
  // nada que hacer. Un 200 rápido es lo que evita que Meta reintente.
  return new NextResponse('OK', { status: 200 })
}