import { describe, expect, it } from 'vitest'

import { extraerCodigo, generarCodigo, hashCodigo, hashTelefono } from '@/lib/hash'

/**
 * Generación y lectura del código de verificación.
 *
 * El código es la prueba de titularidad, así que acá se prueba lo que un
 * atacante necesitaría: adivinarlo, distinguir dos números por hash o colar un
 * código en un párrafo cualquiera.
 */

describe('generarCodigo', () => {
  it('tiene 6 caracteres', () => {
    expect(generarCodigo()).toHaveLength(6)
  })

  it('nunca usa caracteres que se confunden entre sí', () => {
    // Sin 0 ni O, sin 1 ni I: el código se lee de un celular sin zoom y se
    // tipea a mano.
    for (let i = 0; i < 500; i++) {
      const codigo = generarCodigo()
      expect(codigo).not.toMatch(/[01OI]/)
      expect(codigo).toMatch(/^[2-9A-HJ-NP-Z]{6}$/)
    }
  })

  it('no repite el mismo código seguidas de veces', () => {
    const codigos = new Set(Array.from({ length: 200 }, generarCodigo))

    // 31^6 ≈ 887 millones de combinaciones. Con 200 muestras, la chance de
    // cualquier repetición es despreciable.
    expect(codigos.size).toBe(200)
  })
})

describe('extraerCodigo', () => {
  it('lee el formato que la propia UI le pide al usuario', () => {
    expect(extraerCodigo('Verifico mi número en PoliserviciosNOA. Código: K7M2XP')).toBe('K7M2XP')
  })

  it('es tolerante a mayúsculas, espacios y guiones', () => {
    expect(extraerCodigo('mi codigo es k7m2xp')).toBe('K7M2XP')
    expect(extraerCodigo('Código: k7m2xp')).toBe('K7M2XP')
    expect(extraerCodigo('CÓDIGO K7M2XP')).toBe('K7M2XP')
  })

  it('lee un código suelto sin la palabra "código"', () => {
    expect(extraerCodigo('soy yo, K7M2XP')).toBe('K7M2XP')
  })

  it('no confunde una palabra común con un código', () => {
    // Sin límites de palabra, "trabajo" devolvía TRABAJ y el profesional
    // recibía un error sin haber hecho nada malo.
    expect(extraerCodigo('hola, cuánto sale el trabajo?')).toBeNull()
    expect(extraerCodigo('reparacion urgente')).toBeNull()
  })

  it('devuelve null cuando no hay código', () => {
    expect(extraerCodigo('')).toBeNull()
    expect(extraerCodigo('hola qué tal')).toBeNull()
    // No puede contener 1 ni 0, así que tampoco es un código válido.
    expect(extraerCodigo('mi código es ABC123')).toBeNull()
  })
})

describe('hash', () => {
  it('el hash del mismo teléfono es siempre igual', () => {
    expect(hashTelefono('5493814123456')).toBe(hashTelefono('5493814123456'))
  })

  it('el hash distingue dos teléfonos distintos', () => {
    expect(hashTelefono('5493814123456')).not.toBe(hashTelefono('5493814123457'))
  })

  it('el hash del código no es el código', () => {
    const codigo = generarCodigo()

    expect(hashCodigo(codigo)).not.toBe(codigo)
    expect(hashCodigo(codigo)).toHaveLength(64)
  })

  it('los códigos distintos producen hashes distintos', () => {
    const hashes = new Set(Array.from({ length: 200 }, () => hashCodigo(generarCodigo())))

    expect(hashes.size).toBe(200)
  })
})