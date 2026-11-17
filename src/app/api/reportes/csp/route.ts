/**
 * Endpoint que recibe los reportes de violación de Content-Security-Policy
 * enviados por el navegador (Report-To / report-uri).
 *
 * Sirve en los dos modos: en Report-Only el navegador solo avisa, y en enforce
 * avisa de lo que bloqueó. Los reportes se revisan en el log.
 *
 * Es público y lo llama el navegador de cualquiera, así que lleva rate limit:
 * sin él, la ruta es un sumidero de logs gratis.
 *
 * El body se loguea sin datos personales y se responde 204 No Content: el
 * navegador no espera contenido, y devolver algo distinto puede confundirlo.
 */

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { ipHasheada } from '@/lib/peticion'
import { rateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/** Reportes por minuto y por IP. Un navegador sano manda unos pocos. */
const REPORTES_POR_MINUTO = 60

/** Tope del texto logueado. Un body de megabytes no entra al log. */
const MAX_LARGO_REPORTE = 2_000

export async function POST(request: Request): Promise<Response> {
  const limite = await rateLimit(
    `csp:ip:${await ipHasheada()}`,
    REPORTES_POR_MINUTO,
    60,
  )

  // 429 explícito: el navegador no reintenta los reportes de CSP, así que
  // cortar acá no pierde información; un bucle, en cambio, se frena.
  if (limite.limitado) {
    return new NextResponse(null, { status: 429 })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  // Loguear el reporte sin datos personales: el navegador puede incluir
  // URLs, pero no cookies ni tokens. Se recorta para que nadie llene el log
  // con un cuerpo enorme.
  logger.warn('csp: reporte de violación de política de seguridad', {
    reporte: JSON.stringify(body).slice(0, MAX_LARGO_REPORTE),
  })

  return new NextResponse(null, { status: 204 })
}
