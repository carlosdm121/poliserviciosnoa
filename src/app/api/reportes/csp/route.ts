/**
 * Endpoint que recibe los reportes de violación de Content-Security-Policy
 * enviados por el navegador (Report-To / report-uri).
 *
 * Se usa mientras la CSP está en modo Report-Only (CSP_REPORT_ONLY=1, el
 * valor por defecto): el navegador no bloquea nada, solo envía los reportes
 * aquí para revisarlos antes de pasar a modo enforce.
 *
 * El body se loguea sin datos personales y se responde 204 No Content: el
 * navegador no espera contenido, y devolver algo distinto puede confundirlo.
 */

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  // Loguear el reporte sin datos personales: el navegador puede incluir
  // URLs, pero no cookies ni tokens. Se guarda el cuerpo crudo redactado.
  logger.warn('csp: reporte de violación de política de seguridad', {
    reporte: body,
  })

  return new NextResponse(null, { status: 204 })
}
