import { describe, expect, it } from 'vitest'
import { registroProfesionalSchema } from '@/schemas'

describe('registroProfesionalSchema — rubros', () => {
  const base = {
    name: 'Carlos Ramírez',
    email: 'carlos@test.com',
    password: 'contraseña123',
    whatsapp: '3811234567',
  }

  it('rechaza primary vacío', () => {
    const result = registroProfesionalSchema.safeParse({
      ...base,
      primaryCategoryId: '',
      secondaryCategoryId: '',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('Elegí tu rubro principal')
  })

  it('acepta solo primary (secondary undefined)', () => {
    const result = registroProfesionalSchema.safeParse({
      ...base,
      primaryCategoryId: 'cat-1',
    })
    expect(result.success).toBe(true)
    expect(result.data.secondaryCategoryId).toBeUndefined()
  })

  it('acepta primary + secondary distinto', () => {
    const result = registroProfesionalSchema.safeParse({
      ...base,
      primaryCategoryId: 'cat-1',
      secondaryCategoryId: 'cat-2',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza secondary igual al primary', () => {
    const result = registroProfesionalSchema.safeParse({
      ...base,
      primaryCategoryId: 'cat-1',
      secondaryCategoryId: 'cat-1',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('distinto del principal')
  })
})