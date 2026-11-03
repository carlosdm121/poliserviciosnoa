import { describe, expect, it } from 'vitest'

import { formatearAumentoPrecio, formatArs } from '@/lib/dinero'
import { precioDeAlta } from '@/lib/suscripcion'

/**
 * Lógica pura del módulo 4.3: ajustes de precio con aviso.
 *
 * El aumento de precio no es un número escrito en el código: sale del plan,
 * se formatea con el mismo formateador que el resto del sitio, y un socio
 * fundador con precio congelado conserva su monto aunque el plan suba.
 */

describe('precioDeAlta (módulo 4.3)', () => {
  it('un socio fundador con precio congelado conserva su monto anterior', () => {
    const montoPrevio = 10000
    const montoDelPlan = 12000

    const resultado = precioDeAlta(montoPrevio, true, montoDelPlan)

    expect(resultado).toBe(10000)
  })

  it('un suscriptor sin congelamiento paga el monto nuevo del plan', () => {
    const montoPrevio = 10000
    const montoDelPlan = 12000

    const resultado = precioDeAlta(montoPrevio, false, montoDelPlan)

    expect(resultado).toBe(12000)
  })

  it('una primera alta (sin monto previo) paga el monto del plan aunque esté congelada', () => {
    const montoDelPlan = 12000

    const resultado = precioDeAlta(null, true, montoDelPlan)

    expect(resultado).toBe(12000)
  })
})

describe('formatearAumentoPrecio', () => {
  it('muestra el antes y el después con el formato del sitio', () => {
    const texto = formatearAumentoPrecio(10000, 12000)

    expect(texto).toContain('$10.000/mes')
    expect(texto).toContain('$12.000/mes')
    expect(texto).toContain('renovación')
  })
})

describe('formatArs (único formateador de precios)', () => {
  it('formatea el precio de la suscripción como en el sitio', () => {
    expect(formatArs(10000)).toBe('$10.000')
    expect(formatArs(12500.5)).toBe('$12.500,50')
  })
})
