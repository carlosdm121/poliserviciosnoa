import { describe, expect, it } from 'vitest'
import { registroProfesionalSchema } from '@/schemas'

describe('registroProfesionalSchema — rubros', () => {
  const basePerfil = {
    type: 'PERSON' as const,
    name: 'Carlos Ramírez',
    description: 'Ofrezco servicios de plomería y gasista con 10 años de experiencia en la zona.',
    company: {},
    ubicacion: {
      province: 'TUCUMAN',
      baseCityId: 'city1234567890123456789012',
      coversWholeProvince: false,
      otherProvinces: [],
      cityIds: [],
    },
    catalogo: {
      primaryCategoryId: 'cat1234567890123456789012',
      subcategoryIds: [],
      licenseNumber: '',
    },
  }

  const baseCuenta = {
    email: 'carlos@test.com',
    password: 'contraseña123',
    whatsapp: '3811234567',
    aceptaTerminos: true as const,
  }

  it('rechaza primary vacío', () => {
    const result = registroProfesionalSchema.safeParse({
      ...basePerfil,
      catalogo: { ...basePerfil.catalogo, primaryCategoryId: '' },
      ...baseCuenta,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('Elegí tu rubro principal')
  })

  it('acepta solo primary (secondary undefined)', () => {
    const result = registroProfesionalSchema.safeParse({
      ...basePerfil,
      catalogo: { ...basePerfil.catalogo, primaryCategoryId: 'cat1234567890123456789012' },
      ...baseCuenta,
    })

    expect(result.success).toBe(true)

    if (!result.success) {
      throw new Error('expected success')
    }

    expect(result.data.catalogo.secondaryCategoryId).toBeUndefined()
  })

  it('acepta primary + secondary distinto', () => {
    const result = registroProfesionalSchema.safeParse({
      ...basePerfil,
      catalogo: {
        ...basePerfil.catalogo,
        primaryCategoryId: 'cat1234567890123456789012',
        secondaryCategoryId: 'cat2234567890123456789012',
      },
      ...baseCuenta,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza secondary igual al primary', () => {
    const result = registroProfesionalSchema.safeParse({
      ...basePerfil,
      catalogo: {
        ...basePerfil.catalogo,
        primaryCategoryId: 'cat1234567890123456789012',
        secondaryCategoryId: 'cat1234567890123456789012',
      },
      ...baseCuenta,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('distinto del principal')
  })
})