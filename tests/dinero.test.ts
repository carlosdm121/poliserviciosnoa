import { describe, expect, it } from 'vitest'

import {
  aNumero,
  ErrorMontoInvalido,
  formatearAumentoPrecio,
  formatearPrecioMensual,
  formatArs,
} from '@/lib/dinero'

/**
 * Tests del formato de dinero.
 *
 * El caso que más importa acá no es el feliz: es que un monto **inválido**
 * reviente y no se convierta en "$NaN" en la pantalla de un profesional. Todo
 * el módulo de planes depende de que `aNumero` sea estricta, porque es la que
 * evita que una fila corrupta en la base termine en un precio inventado.
 */

describe('aNumero', () => {
  it('deja pasar un número', () => {
    expect(aNumero(10000)).toBe(10000)
  })

  it('convierte un string numérico', () => {
    // Viene del `.env` como texto cuando el seed lo lee.
    expect(aNumero('10000')).toBe(10000)
    expect(aNumero('10500.50')).toBe(10500.5)
  })

  it('convierte un Decimal de Prisma', () => {
    // `Plan.amount` es `Decimal(10,2)`, no un number.
    const decimal = { toNumber: () => 10000 }
    expect(aNumero(decimal)).toBe(10000)
  })

  it('rechaza NaN y Infinity en vez de devolverlos', () => {
    expect(() => aNumero(Number.NaN)).toThrow(ErrorMontoInvalido)
    expect(() => aNumero(Number.POSITIVE_INFINITY)).toThrow(ErrorMontoInvalido)
    expect(() => aNumero('no es un numero')).toThrow(ErrorMontoInvalido)
  })

  it('rechaza un monto negativo', () => {
    // Un plan en negativo no es una rebaja, es una fila corrupta.
    expect(() => aNumero(-1)).toThrow(ErrorMontoInvalido)
  })

  it('deja pasar el cero, que es un plan gratis', () => {
    expect(aNumero(0)).toBe(0)
  })
})

describe('formatArs', () => {
  it('no deja el espacio duro que mete Intl entre el $ y el número', () => {
    // `Intl.NumberFormat('es-AR', { style: 'currency' })` devuelve
    // "$ 10.000" con un U+00A0 en el medio. Acá se escribe "$10.000", y en
    // todas las pantallas y todos los emails el precio se vería roto.
const precio = formatArs(10000)

    expect(precio).toBe('$10.000')

    // Con escapes y no con el carácter pegado en el fuente: un U+00A0
    // escrito a ojo es invisible en el editor y en el diff, que es
    // exactamente el problema que este test viene a cazar.
    for (const espacio of ['\u00A0', '\u202F']) {
      expect(precio.includes(espacio), `quedó un espacio duro (U+${espacio.charCodeAt(0).toString(16)})`).toBe(
        false,
      )
    }
  })

it('pone el punto de miles, como se escribe acá', () => {
    expect(formatArs(10000)).toBe('$10.000')
  })

  it('usa coma decimal, no punto', () => {
    // El error clásico: "10.500.50" se lee como diez mil quinientos con punto.
    expect(formatArs(10500.5)).toBe('$10.500,50')
  })

  it('muestra los centavos solo cuando los hay', () => {
    expect(formatArs(10000)).toBe('$10.000')
    expect(formatArs(10000.99)).toBe('$10.000,99')
  })

  it('fuerza los decimales cuando se piden', () => {
    // Para facturas y textos legales, donde el centavo tiene que estar.
    expect(formatArs(10000, { conDecimales: true })).toBe('$10.000,00')
  })

  it('agrega el código de moneda cuando se pide', () => {
    expect(formatArs(10000, { conCodigo: true })).toBe('$10.000 ARS')
  })

  it('no inventa centavos por ruido de coma flotante', () => {
    // El bug clásico de decidir con `numero % 1`: un entero que llega con una
    // cola de 1e-10 se vería como "$10.000,00".
    expect(formatArs(10000.0000000001)).toBe('$10.000')
  })

  it('sí muestra los centavos cuando la diferencia es real', () => {
    // 0.1 + 0.2 da 0.30000000000000004: hay 30 centavos de verdad, y el
    // formateador tiene que redondear a 2. Este es el caso que el test anterior
    // daba por hecho y está mal: el ruido no está en que sea entero o no.
    expect(formatArs(10000 + 0.1 + 0.2)).toBe('$10.000,30')
  })

  it('formatea el cero sin inventar nada', () => {
    expect(formatArs(0)).toBe('$0')
  })

  it('aguanta un monto gigante sin perder precisión', () => {
    expect(formatArs(1234567.89)).toBe('$1.234.567,89')
  })

  it('propaga el error cuando el monto no es válido', () => {
    expect(() => formatArs(Number.NaN)).toThrow(ErrorMontoInvalido)
  })
})

describe('formatearPrecioMensual', () => {
  it('agrega el /mes', () => {
    expect(formatearPrecioMensual(10000)).toBe('$10.000/mes')
  })

  it('es el mismo precio con decimales si el plan los tiene', () => {
    expect(formatearPrecioMensual(10500.5)).toBe('$10.500,50/mes')
  })
})

describe('formatearAumentoPrecio', () => {
  it('menciona los dos precios', () => {
    const texto = formatearAumentoPrecio(10000, 12000)

    expect(texto).toContain('$10.000/mes')
    expect(texto).toContain('$12.000/mes')
  })

  it('dice que hay aviso previo, que es lo que evita la queja', () => {
    // El email de aumento es el lugar donde el cliente mira si le están
    // cobrando de más. Si el texto no promete aviso, la promesa tiene que
    // cumplirla el módulo M9.
    expect(formatearAumentoPrecio(10000, 12000).toLowerCase()).toContain('aviso previo')
  })
})