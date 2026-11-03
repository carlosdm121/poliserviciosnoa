import { describe, expect, it } from 'vitest'

import {
  MAXIMO_DESCRIPCION,
  tieneContactoExterno,
  limpiarTexto,
  revisarDescripcion,
} from '@/lib/texto-perfil'

/**
 * Filtro de contacto externo en la descripción.
 *
 * La razón del filtro es de negocio, no moral: si el cliente encuentra un
 * teléfono en la descripción escribe directo y la suscripción no se cobra.
 */

const DESCRIPCION_VALIDA =
  'Electricista con 15 años de oficio en Tucumán. Hago instalaciones, tableros y reparación de artefactos.'

describe('revisarDescripcion', () => {
  it('acepta una descripción normal', () => {
    expect(revisarDescripcion(DESCRIPCION_VALIDA).ok).toBe(true)
  })

  it('acepta una descripción corta si es válida', () => {
    expect(revisarDescripcion('Plomero en San Miguel de Tucumán.', 10).ok).toBe(true)
  })

  it('rechaza una descripción demasiado corta', () => {
    const resultado = revisarDescripcion('Plomero')

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('CORTO_DEMASIADO')
  })

  it('rechaza una descripción demasiado larga', () => {
    const resultado = revisarDescripcion('a'.repeat(MAXIMO_DESCRIPCION + 1))

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('MUY_LARGA')
  })

  it.each([
    ['3814123456'],
    ['+54 9 381 412-3456'],
    ['381 412 3456'],
    ['3814-123456'],
    ['llámame al 0381 15 4123456'],
  ])('rechaza el teléfono "%s" dentro del texto', (telefono) => {
    const resultado = revisarDescripcion(`Hace veinte años que trabajo en esto. ${telefono} Atención de lunes a viernes.`)

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('CONTACTO_EXTERNO')
  })

  it.each([
    ['https://facebook.com/miperfil'],
    ['www.miweb.com.ar'],
    ['miweb.com.ar'],
    ['escribime por https://wa.me/5493814123456'],
  ])('rechaza el enlace "%s" dentro del texto', (enlace) => {
    const resultado = revisarDescripcion(`Trabajo de calidad desde 2010. Más info en ${enlace} y coordino por el portal.`)

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('CONTACTO_EXTERNO')
  })

  it('rechaza un usuario de red social', () => {
    const resultado = revisarDescripcion('Diseño y desarrollo web. También en @midisenio desde 2018.')

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('CONTACTO_EXTERNO')
  })

  it('rechaza caracteres de control', () => {
    const resultado = revisarDescripcion(`Plomería en general\u0000con más de diez años de oficio.`)

    expect(resultado.ok).toBe(false)
    expect(resultado.problema).toBe('CARACTERES_INVALIDOS')
  })

  it('el mensaje nombra lo que hay que sacar', () => {
    const resultado = revisarDescripcion('Mi número es 3814123456 y atiendo toda la semana por la mañana.')

    expect(resultado.detalle).toContain('3814123456')
  })
})

describe('tieneContactoExterno', () => {
  it('detecta sin rechazar', () => {
    expect(tieneContactoExterno('Escribime al 3814123456')).toBe(true)
    expect(tieneContactoExterno('Mirá mi web.com')).toBe(true)
    expect(tieneContactoExterno('Hago instalación y pintura')).toBe(false)
  })
})

describe('limpiarTexto', () => {
  it('colapsa espacios y corta al máximo', () => {
    expect(limpiarTexto('  hola    mundo  ')).toBe('hola mundo')
    expect(limpiarTexto('a'.repeat(MAXIMO_DESCRIPCION + 100))).toHaveLength(MAXIMO_DESCRIPCION)
  })
})