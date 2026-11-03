import { timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { procesarPendientes } from '@/services/facturacion'
import { NextResponse } from 'next/server'

/**
 * Cron de facturación.
 *
 * No hay cola externa: las facturas y notas pendientes viven en la base con
 * `nextAttemptAt`. Este endpoint las levanta, procesa un lote chico y devuelve
 * cuántas salieron. Vercel Cron lo llama con `Authorization: Bearer <CRON_SECRET>`
 * (ver `vercel.json`); también sirve a mano con el mismo header.
 *
 * Idempotente: procesar una factura dos veces no emite dos comprobantes. El
 * `updateMany` condicional de `procesarFactura` es el que decide quién gana.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(request: Request): boolean {
  const recibido = Buffer.from(request.headers.get('authorization') ?? '')
  const esperado = Buffer.from(`Bearer ${env.CRON_SECRET}`)

  if (recibido.length !== esperado.length) return false

  return timingSafeEqual(recibido, esperado)
}

export async function GET(request: Request): Promise<Response> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const resultado = await procesarPendientes()

    logger.info('cron facturación: lote procesado', resultado)

    return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    logger.error('cron facturación: falló el lote', { error })

    return NextResponse.json({ error: 'Error al procesar la cola' }, { status: 500 })
  }
}
