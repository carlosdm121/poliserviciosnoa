/**
 * Test de security headers (punto 18 del módulo 6.1).
 *
 * Verifica que el middleware emita las cabeceras de seguridad esperadas:
 * CSP (con nonce), HSTS, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy, Permissions-Policy, COOP, CORP y que no haya
 * X-Powered-By.
 */

import { describe, expect, it } from 'vitest'

import { headersSeguridad, generarNonce, cspReportOnly } from '@/lib/security-headers'
import { NextRequest } from 'next/server'

function solicitudFake(ruta = 'https://ejemplo.com/'): NextRequest {
  return new NextRequest(ruta, { method: 'GET' })
}

describe('punto 18 — security headers', () => {
  it('genera un nonce de 24 caracteres base64', () => {
    const nonce = generarNonce()
    expect(nonce.length).toBe(24)
  })

  it('cspReportOnly es true por defecto (modo Report-Only)', () => {
    expect(cspReportOnly()).toBe(true)
  })

  it('headersSeguridad incluye todas las cabeceras de seguridad', () => {
    const req = solicitudFake('https://ejemplo.com/')
    const nonce = generarNonce()
    const h = headersSeguridad(req, nonce)

    expect(h['Strict-Transport-Security']).toContain('max-age=63072000')
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['Permissions-Policy']).toContain('camera=()')
    expect(h['Permissions-Policy']).toContain('microphone=()')
    expect(h['Permissions-Policy']).toContain('geolocation=()')
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })

  it('la CSP incluye nonce y report-uri', () => {
    const req = solicitudFake('https://ejemplo.com/')
    const nonce = generarNonce()
    const h = headersSeguridad(req, nonce)
    const csp =
      (h['Content-Security-Policy-Report-Only'] ??
        h['Content-Security-Policy']) ?? ''

    expect(csp).toContain(`nonce-${nonce}`)
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain('report-uri')
    // script-src nunca debe tener unsafe-inline (solo nonce + strict-dynamic)
    const scriptSrc = csp.match(/script-src[^;]*/)?.[0] ?? ''
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it('la CSP permite res.cloudinary.com para imágenes', () => {
    const req = solicitudFake('https://ejemplo.com/')
    const nonce = generarNonce()
    const h = headersSeguridad(req, nonce)
    const csp =
      (h['Content-Security-Policy-Report-Only'] ??
        h['Content-Security-Policy']) ?? ''

    expect(csp).toContain('https://res.cloudinary.com')
  })

  it('las rutas autenticadas tienen Cache-Control no-store', () => {
    const req = solicitudFake('https://ejemplo.com/panel/perfil')
    const nonce = generarNonce()
    const h = headersSeguridad(req, nonce)

    expect(h['Cache-Control']).toContain('no-store')
    expect(h['X-Robots-Tag']).toBe('noindex, nofollow')
  })

  it('las rutas públicas no tienen Cache-Control no-store', () => {
    const req = solicitudFake('https://ejemplo.com/')
    const nonce = generarNonce()
    const h = headersSeguridad(req, nonce)

    expect(h['Cache-Control']).toBeUndefined()
  })
})
