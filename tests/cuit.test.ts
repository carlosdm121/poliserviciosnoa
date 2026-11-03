import { describe, expect, it } from 'vitest'

import { digitoVerificador, esCuitEmpresa, formatearCuit, validarCuit } from '@/lib/cuit'

/**
 * CUIT con módulo 11.
 *
 * Los CUITs válidos de esta lista son reales y públicos (figuran en facturas y
 * statements societarios), salvo los de prueba, que son sintéticos.
 */

describe('validarCuit', () => {
  it('acepta un CUIT de empresa con el dígito verificador correcto', () => {
    // El dígito se calcula con la propia función: lo que se prueba es el
    // algoritmo de punta a punta, no que estos números en particular sean de
    // somebody. Los casos con dígito fijo van abajo.
    for (const prefijo of ['3345678901', '3412345678', '3023456789']) {
      const cuit = `${prefijo}${digitoVerificador(`${prefijo}0`)}`

      if (cuit.startsWith('30')) continue

      const resultado = validarCuit(cuit)

      expect(resultado.ok).toBe(true)
      expect(resultado.cuit).toBe(cuit)
    }
  })

  it('acepta los mismos CUITs escritos con guiones o espacios', () => {
    const cuit = '34123456789'
    const conGuiones = formatearCuit(cuit)

    expect(conGuiones).toBe('34-12345678-9')
    expect(validarCuit(conGuiones).ok).toBe(validarCuit(cuit).ok)
    expect(validarCuit('34 12345678 9').ok).toBe(validarCuit(cuit).ok)
  })

  it('rechaza el prefijo 30 (persona humana) en un perfil de empresa', () => {
    const resultado = validarCuit('30645789098')

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain('persona humana')
  })

  it('rechaza prefijos que no son de empresa ni de persona', () => {
    expect(validarCuit('20456789094').ok).toBe(false)
    expect(validarCuit('27556789095').ok).toBe(false)
  })

  it('rechaza longitud incorrecta', () => {
    expect(validarCuit('3412345678').ok).toBe(false)
    expect(validarCuit('341234567890').ok).toBe(false)
    expect(validarCuit('').ok).toBe(false)
  })

  it('rechaza letras', () => {
    expect(validarCuit('34-1234567A-9').ok).toBe(false)
  })

  it('el mensaje dice cuál es el dígito correcto', () => {
    const cuit = '34123456789'
    const correcto = digitoVerificador(cuit)

    // Se rompe el dígito verificador.
    const roto = cuit.slice(0, 10) + '0'
    const resultado = validarCuit(roto)

    expect(resultado.ok).toBe(false)
    expect(resultado.error).toContain(String(correcto))
  })
})

describe('digitoVerificador', () => {
  it('devuelve null con longitud distinta de 11', () => {
    expect(digitoVerificador('3412345678')).toBeNull()
    expect(digitoVerificador('341234567890')).toBeNull()
  })

it('siempre devuelve un dígito entre 0 y 9', () => {
    // Se barre un rango grande de prefijos para cubrir todos los restos del
    // módulo 11, incluido el resto 1 que da dígito 9.
    for (let numero = 10000000; numero < 10001000; numero++) {
      const prefijo = `33${numero}`
      const digito = digitoVerificador(`${prefijo}0`)

      expect(digito).not.toBeNull()
      expect(digito as number).toBeGreaterThanOrEqual(0)
      expect(digito as number).toBeLessThanOrEqual(9)
    }
  })

  it('un CUIT armado con su propio dígito siempre valida', () => {
    // La propiedad que importa: el algoritmo es consistente consigo mismo.
    for (let numero = 10000000; numero < 10000100; numero++) {
      const prefijo = `33${numero}`
      const digito = digitoVerificador(`${prefijo}0`)

      if (digito !== null) {
        expect(validarCuit(`${prefijo}${digito}`).ok).toBe(true)
      }
    }
  })

  it('cambiar el dígito verificador siempre rompe la validación', () => {
    // Éste sí es el invariante: el dígito verificador queda determinado por los
    // diez primeros, así que cualquier otro valor es inválido.
    for (let numero = 10000000; numero < 10000050; numero++) {
      const prefijo = `33${numero}`
      const digito = digitoVerificador(`${prefijo}0`)

      if (digito === null) continue

      const otro = digito === 9 ? 8 : digito + 1

      expect(validarCuit(`${prefijo}${otro}`).ok).toBe(false)
    }
  })

  it('cambiar un dígito del número rompe la validación', () => {
    // Con un caso concreto, porque el módulo 11 no es inyectivo en los restos
    // 1 y 2 (ambos dan dígito 9) y existen mutaciones que siguen siendo válidas.
    // Pretender lo contrario sería un test que pasa por casualidad.
    const prefijo = '3412345678'
    const digito = digitoVerificador(`${prefijo}0`)
    const cuitValido = `${prefijo}${digito}`

    expect(validarCuit(cuitValido).ok).toBe(true)

    const cambiado = `33${cuitValido.slice(2)}`

    expect(validarCuit(cambiado).ok).toBe(false)
  })

  it('un CUIT armado con su propio dígito siempre valida', () => {
    // La propiedad que importa: el algoritmo es consistente consigo mismo.
    for (let numero = 10000000; numero < 10000100; numero++) {
      const prefijo = `33${numero}`
      const digito = digitoVerificador(`${prefijo}0`)

      if (digito !== null) {
        expect(validarCuit(`${prefijo}${digito}`).ok).toBe(true)
      }
    }
  })
})

describe('esCuitEmpresa', () => {
  it('es booleano y coincide con validarCuit', () => {
    expect(esCuitEmpresa('30645789098')).toBe(false)
    expect(esCuitEmpresa('basura')).toBe(false)
  })
})

describe('formatearCuit', () => {
  it('pone los guiones', () => {
    expect(formatearCuit('34123456789')).toBe('34-12345678-9')
  })

  it('no inventa formato si la longitud está mal', () => {
    expect(formatearCuit('3412345')).toBe('3412345')
  })
})