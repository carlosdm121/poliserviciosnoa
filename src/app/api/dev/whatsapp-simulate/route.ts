import { NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { normalizarWhatsapp } from '@/lib/phone'
import { procesarMensajeEntrante } from '@/services/verificacion-whatsapp'

/**
 * Simulador de mensajes entrantes.
 *
 * Existe solo en desarrollo. Sin él no se puede probar el flujo de verificación
 * entero —pedir código, mandarlo, ver el panelactualizarse— sin tener el número
 * de Meta configurado ni pagar el primer mensaje de plantilla.
 *
 * Importa el MISMO servicio que el webhook. Si tuviera lógica propia, los
 * tests pasarían y el webhook de producción fallaría: el simulador sirve para
 * probar producción, no para reemplazarla.
 */

export const dynamic = 'force-dynamic'

const entrada = z.object({
  from: z.string().min(1, 'Falta el número del remitente'),
  text: z.string().min(1, 'Falta el texto del mensaje'),
  messageId: z.string().optional(),
})

export async function POST(request: Request): Promise<Response> {
  // Defensa de despliegue: la ruta no debe existir en producción ni aunque
  // alguien la conozca. Un 404 es mejor que un chequeo de entorno, porque no
  // deja ver que la simulación existe.
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 })
  }

  const cuerpo = await request.json().catch(() => null)
  const parseado = entrada.safeParse(cuerpo)

  if (!parseado.success) {
    return NextResponse.json(
      { error: parseado.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    )
  }

  const { from, text, messageId } = parseado.data

  const remitente = normalizarWhatsapp(from)

  if (!remitente) {
    return NextResponse.json(
      { error: 'El número del remitente no es un celular argentino válido.' },
      { status: 400 },
    )
  }

  // El id sintético replica la forma del wamid de Meta para que la guarda de
  // idempotencia del servicio se ejercite igual que en producción.
  const id = messageId ?? `wamid.SIMULADO.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`

  logger.info('whatsapp: mensaje simulado', { remitente, id })

  try {
    const resultado = await procesarMensajeEntrante(remitente, text, id)

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true, accion: resultado.data.accion, remitente, id })
  } catch (error: unknown) {
    logger.error('whatsapp: fallo en el simulador', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Error procesando el mensaje simulado.' }, { status: 500 })
  }
}