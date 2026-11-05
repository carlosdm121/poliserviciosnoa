import { describe, expect, it } from 'vitest'

import { generarPasswordTemporal, validarPoliticaPassword } from '@/lib/password'

describe('generarPasswordTemporal', () => {
  it('cumple la política mínima y no usa caracteres ambiguos', () => {
    const password = generarPasswordTemporal()

    expect(password).toHaveLength(12)
    expect(() => validarPoliticaPassword(password)).not.toThrow()
    expect(password).not.toMatch(/[0O1lI]/)
  })

  it('genera claves distintas', () => {
    expect(generarPasswordTemporal()).not.toBe(generarPasswordTemporal())
  })
})
