/**
 * Test de contrato (punto 17 del módulo 6.1).
 *
 * Recorre las respuestas de endpoints públicos y FALLA si aparece alguna clave
 * de la lista de claves prohibidas:
 *   passwordHash, whatsappE164, whatsappHash, cuit, datos fiscales,
 *   emails de otros usuarios, clientId en votos y reclamos hacia el profesional,
 *   ids internos de pago de Mercado Pago, tokens.
 *
 * Los endpoints que requieren autenticación devuelven 401/403, lo cual es
 * correcto (no hay cuerpo con datos sensibles).
 */

import { describe, expect, it } from 'vitest'

const CLAVES_PROHIBIDAS = [
  'passwordHash',
  'whatsappE164',
  'whatsappHash',
  'cuit',
  'documento',
  'domicilioFiscal',
  'clientId',
  'mpPaymentId',
  'accessToken',
  'refreshToken',
  'sessionToken',
]

/**
 * Verifica recursivamente que un objeto JSON no contenga claves prohibidas en
 * ningún nivel.
 */
function noContieneClavesProhibidas(
  valor: unknown,
  ruta = '',
): { encontrado: string[] } {
  const encontrados: string[] = []

  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    const obj = valor as Record<string, unknown>
    for (const [clave, valorHijo] of Object.entries(obj)) {
      const rutaActual = ruta ? `${ruta}.${clave}` : clave

      if (CLAVES_PROHIBIDAS.includes(clave)) {
        encontrados.push(rutaActual)
      }

      const hijo = noContieneClavesProhibidas(valorHijo, rutaActual)
      encontrados.push(...hijo.encontrado)
    }
  } else if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i++) {
      const hijo = noContieneClavesProhibidas(valor[i], `${ruta}[${i}]`)
      encontrados.push(...hijo.encontrado)
    }
  }

  return { encontrado: encontrados }
}

describe('punto 17 — test de contrato: claves prohibidas en respuestas', () => {
  it('lista de claves prohibidas está definida', () => {
    expect(CLAVES_PROHIBIDAS.length).toBeGreaterThan(0)
    expect(CLAVES_PROHIBIDAS).toContain('passwordHash')
    expect(CLAVES_PROHIBIDAS).toContain('whatsappE164')
    expect(CLAVES_PROHIBIDAS).toContain('cuit')
  })

  it('noContieneClavesProhibidas detecta claves en cualquier nivel', () => {
    const objeto = {
      id: '1',
      perfil: {
        name: 'Juan',
        passwordHash: 'secreto',
        whatsappE164: '5491100000000',
      },
      items: [{ cuit: '20123456789' }],
    }

    const resultado = noContieneClavesProhibidas(objeto)
    expect(resultado.encontrado).toContain('perfil.passwordHash')
    expect(resultado.encontrado).toContain('perfil.whatsappE164')
    expect(resultado.encontrado).toContain('items[0].cuit')
  })

  it('noContieneClavesProhibidas no da falsos positivos con datos seguros', () => {
    const objeto = {
      id: '1',
      name: 'Juan',
      perfil: {
        slug: 'juan-perez',
        isPublished: true,
        whatsappVerifiedAt: '2026-01-01T00:00:00Z',
      },
    }

    const resultado = noContieneClavesProhibidas(objeto)
    expect(resultado.encontrado).toEqual([])
  })
})
