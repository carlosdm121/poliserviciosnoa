import { describe, expect, it } from 'vitest'

import {
  enmascararTelefono,
  explicarTelefonoInvalido,
  formatearWhatsapp,
  mismoTelefono,
  normalizarWhatsapp,
  variantesTelefono,
} from '@/lib/phone'

/**
 * Normalización de teléfonos.
 *
 * El criterio no es "no rompe", es "la misma persona no queda registrada como
 * cinco personas distintas". Cada caso de esta lista es una forma que alguien
 * escribió de verdad.
 */

describe('normalizarWhatsapp', () => {
  const CANONICO = '5493814123456'

  it.each([
    ['381 4123456', 'local con espacio'],
    ['381-4123456', 'local con guion'],
    ['(381) 4123456', 'local con paréntesis'],
    ['0381 15-4123456', 'con 0 de trunk y 15 al medio'],
    ['0381154123456', 'con 0 y 15 pegados'],
    ['153814123456', '15 adelante del código de área'],
    ['5493814123456', 'ya canónico'],
    ['+54 9 381 412-3456', 'con signos y espacios'],
    ['543814123456', 'con 54 y sin el 9'],
    ['5493814123456', 'internacional completo'],
    ['9 381 412 3456', '9 suelto adelante'],
  ])('normaliza "%s" (%s)', (entrada) => {
    expect(normalizarWhatsapp(entrada)).toBe(CANONICO)
  })

  it('descarta letras en vez de adivinar', () => {
    expect(normalizarWhatsapp('38141234abc56')).toBeNull()
  })

  it.each([
    ['', 'vacío'],
    ['123', 'muy corto'],
    ['3814123', 'incompleto'],
    ['+1 202 555 0143', 'número de Estados Unidos'],
    ['+34 612 345 678', 'número de España'],
    ['5491141234567', 'código de área que no existe'],
    ['54938141234567', 'demasiado largo'],
  ])('rechaza "%s" (%s)', (entrada) => {
    expect(normalizarWhatsapp(entrada)).toBeNull()
  })

  it('da el mismo resultado para todos los formatos del mismo número', () => {
    const formatos = ['3814123456', '0381 15-4123456', '5493814123456', '543814123456']

    const resultados = new Set(formatos.map(normalizarWhatsapp))

    expect(resultados.size).toBe(1)
  })
})

describe('variantesTelefono', () => {
  it('devuelve las dos formas del mismo número', () => {
    const variantes = variantesTelefono('5493814123456')

    expect(variantes).toContain('5493814123456')
    expect(variantes).toContain('543814123456')
    expect(variantes).toHaveLength(2)
  })

  it('reconoce el mismo número con y sin el 9', () => {
    expect(mismoTelefono('5493814123456', '543814123456')).toBe(true)
    expect(mismoTelefono('5493814123456', '5493814123456')).toBe(true)
  })

  it('no confunde números distintos', () => {
    expect(mismoTelefono('5493814123456', '5493814123457')).toBe(false)
    expect(mismoTelefono('5493814123456', '5492614123456')).toBe(false)
  })
})

describe('formatearWhatsapp y enmascararTelefono', () => {
  it('muestra el número con el 9 para humanos', () => {
    expect(formatearWhatsapp('5493814123456')).toBe('+54 9 381 412-3456')
  })

  it('enmascara todo menos los dos últimos dígitos', () => {
    const enmascarado = enmascararTelefono('5493814123456')

    expect(enmascarado).toBe('+54 9 381 ***-**56')
    expect(enmascarado).not.toContain('4123')
  })

  it('enmascara sin inventar formato si el número es raro', () => {
    expect(enmascararTelefono('123')).toBe('***')
  })
})

describe('explicarTelefonoInvalido', () => {
  it('habla el idioma del usuario, no el del protocolo', () => {
    expect(explicarTelefonoInvalido('')).toContain('número')
    expect(explicarTelefonoInvalido('123')).toContain('incompleto')
    expect(explicarTelefonoInvalido('+1 202 555 0143')).toContain('Argentina')
  })
})