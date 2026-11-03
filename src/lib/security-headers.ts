/**
 * Headers de seguridad centralizados (punto 18 del módulo 6.1).
 *
 * Se definen acá para que el middleware y next.config.mjs compartan los mismos
 * valores, y no se olvide ninguno al agregar una ruta nueva.
 *
 * Modo de operación: por defecto se envían en modo Report-Only
 * (`Content-Security-Policy-Report-Only`) para no romper el sitio mientras se
 * revisan las violaciones del navegador. Cuando el endpoint de reportes no
 * muestre infracciones por un tiempo razonable, se cambia a `enforce` poniendo
 * `CSP_REPORT_ONLY=0` en el entorno.
 */

import type { NextRequest } from 'next/server'

/** Si se envía la CSP en modo Report-Only (no bloquea, solo reporta). */
export function cspReportOnly(): boolean {
  return process.env.CSP_REPORT_ONLY !== '0'
}

/**
 * Genera un nonce criptográfico por request para la CSP.
 *
 * Next.js inyecta sus scripts con este nonce cuando el valor coincide con el
 * atributo `nonce` del `<script>`. Así se puede eliminar `unsafe-inline` de
 * `script-src` y solo los scripts firmados por el servidor se ejecutan.
 */
export function generarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Buffer.from(bytes).toString('base64')
}

/** Cabecera CSP en modo enforce o report-only según el entorno. */
const CSP_CLAVE = cspReportOnly()
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy'

/** Endpoint al que el navegador envía los reportes de violación de la CSP. */
const CSP_REPORTE = '/api/reportes/csp'

/**
 * Construye el valor de la cabecera CSP.
 *
 * @param nonce Nonce generado para este request (se inyecta en scripts inline).
 */
export function construirCSP(nonce: string): string {
  return [
    "default-src 'self'",
    // Estilos: Tailwind y Next inyectan CSS inline; se tolera 'unsafe-inline'
    // porque el riesgo real de XSS está en scripts, no en estilos.
    "style-src 'self' 'unsafe-inline'",
    // Scripts: solo los firmados con nonce del servidor, más Mercado Pago.
    `script-src 'self' 'nonce-${nonce}' https://sdk.mercadopago.com`,
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.mercadopago.com https://api.resend.com",
    `frame-src 'self' https://sdk.mercadopago.com`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Upgrade automático de HTTP a HTTPS.
    'upgrade-insecure-requests',
    // Reportes de violación al endpoint propio.
    `report-to csp-endpoint`,
    `report-uri ${CSP_REPORTE}`,
  ].join('; ')
}

/**
 * Agrupa todos los headers de seguridad para aplicar en el middleware.
 *
 * @param request Request de Next.js (para derivar el nonce y saber si es ruta autenticada).
 * @param nonce Nonce generado para este request.
 */
export function headersSeguridad(
  request: NextRequest,
  nonce: string,
): Record<string, string> {
  const rutaAutenticada =
    request.nextUrl.pathname.startsWith('/panel') ||
    request.nextUrl.pathname.startsWith('/admin') ||
    request.nextUrl.pathname.startsWith('/mis-contactos') ||
    request.nextUrl.pathname.startsWith('/api')

  const headers: Record<string, string> = {
    // HSTS: dos años, subdominios incluidos, preload cuando el dominio esté listo.
    'Strict-Transport-Security':
      'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    [CSP_CLAVE]: construirCSP(nonce),
  }

  // Reporte de CSP: el navegador envía las violaciones a este endpoint.
  headers['Report-To'] = JSON.stringify({
    group: 'csp-endpoint',
    max_age: 86400,
    endpoints: [{ url: CSP_REPORTE }],
  })

  // Rutas autenticadas: nunca en caché compartida ni indexables.
  if (rutaAutenticada) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
    headers['X-Robots-Tag'] = 'noindex, nofollow'
  }

  return headers
}
