/**
 * Tests del punto 8 del módulo 6.1: bloqueo de mass assignment.
 *
 * Los schemas Zod con `.strict()` rechazan campos que el cliente no debería
 * poder escribir (role, isPublished, heartsCount, whatsappVerifiedAt, etc.).
 */

import { describe, expect, it } from 'vitest'

import { perfilSchema } from '@/schemas/perfil'
import { datosFiscalesSchema } from '@/schemas/suscripcion'

function perfilBase(): Record<string, unknown> {
  return {
    type: 'PERSON',
    name: 'Juan Pérez',
    description: 'Descripción de prueba con más de veinte caracteres.',
    company: {},
    ubicacion: {
      province: 'TUCUMAN',
      baseCityId: 'ciudad-1',
      coversWholeProvince: false,
      otherProvinces: [],
      cityIds: [],
    },
    catalogo: {
      primaryCategoryId: 'rubro-1',
      secondaryCategoryId: '',
      subcategoryIds: [],
    },
  }
}

describe('punto 8 — mass assignment bloqueado con .strict()', () => {
  it('perfilSchema rechaza campos extra en el nivel raíz', () => {
    const resultado = perfilSchema.safeParse({
      ...perfilBase(),
      role: 'ADMIN',
      isPublished: true,
      heartsCount: 999,
      whatsappVerifiedAt: '2026-01-01T00:00:00Z',
    })

    expect(resultado.success).toBe(false)
  })

  it('perfilSchema acepta datos válidos sin campos extra', () => {
    const resultado = perfilSchema.safeParse(perfilBase())
    expect(resultado.success).toBe(true)
  })

  it('datosFiscalesSchema rechaza campos extra', () => {
    const resultado = datosFiscalesSchema.safeParse({
      tipoPersona: 'PERSONA_HUMANA',
      nombreORazonSocial: 'Juan Pérez',
      documento: '12345678',
      condicionIva: 'RESPONSABLE_MONOTRIBUTO',
      domicilioFiscal: 'Calle Falsa 123, San Miguel de Tucumán',
      campoExtra: 'no debería pasar',
    })

    expect(resultado.success).toBe(false)
  })

  it('datosFiscalesSchema acepta datos válidos', () => {
    const resultado = datosFiscalesSchema.safeParse({
      tipoPersona: 'PERSONA_HUMANA',
      nombreORazonSocial: 'Juan Pérez',
      documento: '12345678',
      condicionIva: 'RESPONSABLE_MONOTRIBUTO',
      domicilioFiscal: 'Calle Falsa 123, San Miguel de Tucumán',
    })
    expect(resultado.success).toBe(true)
  })
})
