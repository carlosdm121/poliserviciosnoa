import { describe, expect, it } from 'vitest'

import { digitoVerificador, validarCuit } from '@/lib/cuit'
import { perfilSchema, LIMITES_PERFIL } from '@/schemas/perfil'

/**
 * Validación del formulario de perfil.
 *
 * Lo que se prueba acá es la **forma**: que el Zod rechace lo que tiene que
 * rechazar y avise con un mensaje que el profesional pueda corregir. Las
 * relaciones con la base (que el rubro exista, que la ciudad sea de esa
 * provincia, los límites contra el estado real) se prueban contra el Postgres
 * efímero, en `scripts/verificar-whatsapp.ts`.
 */

/** Base válida contra la que se prueba cada variación. */
const VALIDO = {
  type: 'PERSON' as const,
  name: 'Carlos Ramírez',
  description: 'Electricista con quince años de oficio en Tucumán. Hago instalaciones y tableros.',
  company: {},
  ubicacion: {
    province: 'TUCUMAN' as const,
    baseCityId: 'ciudad-1',
    coversWholeProvince: false,
    otherProvinces: [] as string[],
    cityIds: [] as string[],
  },
  catalogo: {
    primaryCategoryId: 'rubro-1',
    secondaryCategoryId: '',
    subcategoryIds: [] as string[],
    licenseNumber: '',
  },
}

function con(cambios: Record<string, unknown> = {}) {
  return { ...VALIDO, ...cambios }
}

describe('perfilSchema', () => {
  it('acepta un perfil de persona completo', () => {
    const resultado = perfilSchema.safeParse(VALIDO)

    expect(resultado.success).toBe(true)
  })

  it('exige nombre y descripción con mínimo de caracteres', () => {
    expect(perfilSchema.safeParse(con({ name: 'A' })).success).toBe(false)
    expect(perfilSchema.safeParse(con({ description: 'Muy corto' })).success).toBe(false)
  })

  it('rechaza el contacto externo en la descripción', () => {
    const conTelefono = perfilSchema.safeParse(
      con({
        description: 'Electricista en San Miguel de Tucumán. Llamame al 3814123456 a cualquier hora.',
      }),
    )

    expect(conTelefono.success).toBe(false)

    const conLink = perfilSchema.safeParse(
      con({
        description: 'Electricista en Tucumán. Más info en https://facebook.com/miperfil y coordino.',
      }),
    )

    expect(conLink.success).toBe(false)
  })

  it('exige razón social y CUIT si el perfil es de empresa', () => {
    const incompleto = perfilSchema.safeParse(con({ type: 'COMPANY' }))

    expect(incompleto.success).toBe(false)

    if (!incompleto.success) {
      const mensajes = incompleto.error.issues.map((i) => i.message)
      expect(mensajes.some((m) => m.includes('razón social'))).toBe(true)
      expect(mensajes.some((m) => m.includes('CUIT'))).toBe(true)
    }
  })

  it('exige un CUIT válido si el perfil es de empresa', () => {
    const resultado = perfilSchema.safeParse(
      con({ type: 'COMPANY', company: { companyName: 'El service SRL', cuit: '123' } }),
    )

    expect(resultado.success).toBe(false)
  })

  it('acepta una empresa con CUIT válido', () => {
    // El dígito verificador se calcula, así que el test no depende de un
    // número inventado que capaz está mal.
    const prefijo = '3412345678'
    const cuit = `${prefijo}${digitoVerificador(`${prefijo}0`)}`

    const resultado = perfilSchema.safeParse(
      con({
        type: 'COMPANY',
        company: { companyName: 'El service SRL', cuit },
      }),
    )

    expect(resultado.success).toBe(true)
  })

  it('rechaza que el rubro secundario sea el mismo que el principal', () => {
    const resultado = perfilSchema.safeParse(
      con({
        catalogo: { ...VALIDO.catalogo, secondaryCategoryId: 'rubro-1' },
      }),
    )

    expect(resultado.success).toBe(false)
  })

  it('rechaza subcategorías repetidas', () => {
    const resultado = perfilSchema.safeParse(
      con({
        catalogo: { ...VALIDO.catalogo, subcategoryIds: ['sub-1', 'sub-1'] },
      }),
    )

    expect(resultado.success).toBe(false)
  })

  it('rechaza poner la ciudad base en la cobertura', () => {
    const resultado = perfilSchema.safeParse(
      con({
        ubicacion: { ...VALIDO.ubicacion, cityIds: ['ciudad-1'] },
      }),
    )

    expect(resultado.success).toBe(false)
  })

  it('impone el límite de ciudades en el formulario', () => {
    const demasiadas = Array.from({ length: LIMITES_PERFIL.ciudades + 1 }, (_, i) => `c-${i}`)

    expect(perfilSchema.safeParse(con({ ubicacion: { ...VALIDO.ubicacion, cityIds: demasiadas } })).success).toBe(false)
  })

  it('impone el límite de subcategorías en el formulario', () => {
    const demasiadas = Array.from({ length: LIMITES_PERFIL.subcategorias + 1 }, (_, i) => `s-${i}`)

    expect(
      perfilSchema.safeParse(con({ catalogo: { ...VALIDO.catalogo, subcategoryIds: demasiadas } })).success,
    ).toBe(false)
  })

  it('no acepta un tipo de perfil inventado', () => {
    expect(perfilSchema.safeParse(con({ type: 'ROBOT' })).success).toBe(false)
  })

  it('no acepta una provincia que no existe', () => {
    expect(perfilSchema.safeParse(con({ ubicacion: { ...VALIDO.ubicacion, province: 'MISIONES' } })).success).toBe(false)
  })
})