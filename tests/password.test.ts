import { describe, expect, it } from 'vitest'

import { generarPasswordTemporal, validarPoliticaPassword } from '@/lib/password'

describe('generarPasswordTemporal', () => {
  it('cumple la política mínima y no usa caracteres ambiguos', () => {
    const password = generarPasswordTemporal()

    // El password temporal generado ahora incluye un símbolo, debería
    // cumplir la política de complejidad (12+ chars, mayúscula, minúscula,
    // número, símbolo, sin secuencias obvias de 4+ dígitos).
    expect(() => validarPoliticaPassword(password)).not.toThrow()
    expect(password).toHaveLength(12)
    expect(password).not.toMatch(/[0O1lI]/)
  })

  it('genera claves distintas', () => {
    expect(generarPasswordTemporal()).not.toBe(generarPasswordTemporal())
  })
})
