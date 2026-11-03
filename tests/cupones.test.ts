import { describe, expect, it } from 'vitest'

import { TipoCupon } from '@prisma/client'

import {
  calcularMontoConDescuento,
  tipoCuponALabel,
  validarCupon,
  type CuponParaValidar,
  type EntradaValidacionCupon,
} from '@/lib/cupones'

/**
 * Tests de lógica pura de cupones.
 *
 * Estos tests no tocan la base: prueban las reglas de negocio que deciden si
 * un cupón se puede usar y cuánto se cobra con el descuento. Son los que más
 * conviene cubrir porque un error acá cobra mal o deja pasar un cupón que
 * ya venció.
 */

function cupo(override: Partial<CuponParaValidar> = {}): CuponParaValidar {
  return {
    id: 'cupon_1',
    codigo: 'DESCUENTO20',
    tipo: TipoCupon.PORCENTAJE,
    valor: 20,
    cupoMaximoUsos: 10,
    usosActuales: 0,
    vigenteDesde: new Date('2026-01-01'),
    vigenteHasta: new Date('2026-12-31'),
    rubrosHabilitados: null,
    provinciasHabilitados: null,
    activo: true,
    ...override,
  }
}

function entrada(override: Partial<EntradaValidacionCupon> = {}): EntradaValidacionCupon {
  return {
    rubroSlug: 'plomeria',
    provincia: 'Tucumán',
    whatsappHash: null,
    cuitHash: null,
    yaUsadoPorEstePerfil: false,
    yaUsadoPorEsteWhatsapp: false,
    yaUsadoPorEsteCuit: false,
    ...override,
  }
}

describe('validarCupon', () => {
  it('aprueba un cupón activo, dentro de vigencia, con cupo y sin restricciones', () => {
    const resultado = validarCupon(cupo(), entrada(), 10000)

    expect(resultado.valido).toBe(true)
    expect(resultado.motivo).toBeUndefined()
    expect(resultado.montoFinal).toBe(8000) // 10000 con 20% de descuento
  })

  it('rechaza un cupón inactivo', () => {
    const resultado = validarCupon(cupo({ activo: false }), entrada())

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('ya no está activo')
    expect(resultado.montoFinal).toBeNull()
  })

  it('rechaza un cupón antes de su vigencia', () => {
    const resultado = validarCupon(
      cupo({ vigenteDesde: new Date('2030-01-01') }),
      entrada(),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('aún no está vigente')
  })

  it('rechaza un cupón vencido', () => {
    const resultado = validarCupon(
      cupo({ vigenteHasta: new Date('2020-01-01') }),
      entrada(),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('ya venció')
  })

  it('rechaza un cupón sin cupo disponible', () => {
    const resultado = validarCupon(
      cupo({ cupoMaximoUsos: 1, usosActuales: 1 }),
      entrada(),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('no tiene cupos disponibles')
  })

  it('rechaza un cupón que el perfil ya usó', () => {
    const resultado = validarCupon(
      cupo(),
      entrada({ yaUsadoPorEstePerfil: true }),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('Ya usaste este cupón')
  })

  it('rechaza un cupón que el WhatsApp ya usó', () => {
    const resultado = validarCupon(
      cupo(),
      entrada({ whatsappHash: 'hash123', yaUsadoPorEsteWhatsapp: true }),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('ese número de WhatsApp')
  })

  it('rechaza un cupón que el CUIT ya usó', () => {
    const resultado = validarCupon(
      cupo(),
      entrada({ cuitHash: 'hash456', yaUsadoPorEsteCuit: true }),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('ese CUIT')
  })

  it('rechaza un cupón cuyo rubro no está habilitado', () => {
    const resultado = validarCupon(
      cupo({ rubrosHabilitados: ['electricidad'] }),
      entrada({ rubroSlug: 'plomeria' }),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('no aplica a tu rubro')
  })

  it('aprueba un cupón sin restricción de rubro', () => {
    const resultado = validarCupon(
      cupo({ rubrosHabilitados: ['electricidad', 'plomeria'] }),
      entrada({ rubroSlug: 'plomeria' }),
    )

    expect(resultado.valido).toBe(true)
  })

  it('rechaza un cupón cuya provincia no está habilitada', () => {
    const resultado = validarCupon(
      cupo({ provinciasHabilitados: ['Salta'] }),
      entrada({ provincia: 'Tucumán' }),
    )

    expect(resultado.valido).toBe(false)
    expect(resultado.motivo).toContain('no aplica a tu provincia')
  })
})

describe('calcularMontoConDescuento', () => {
  it('MES_GRATIS devuelve 0 sin importar el plan', () => {
    expect(calcularMontoConDescuento(TipoCupon.MES_GRATIS, null, 10000)).toBe(0)
    expect(calcularMontoConDescuento(TipoCupon.MES_GRATIS, null, 0)).toBe(0)
  })

  it('PORCENTAJE descuenta el valor por ciento', () => {
    expect(calcularMontoConDescuento(TipoCupon.PORCENTAJE, 20, 10000)).toBe(8000)
    expect(calcularMontoConDescuento(TipoCupon.PORCENTAJE, 50, 200)).toBe(100)
    expect(calcularMontoConDescuento(TipoCupon.PORCENTAJE, 100, 10000)).toBe(0)
  })

  it('PORCENTAJE no devuelve negativo', () => {
    expect(calcularMontoConDescuento(TipoCupon.PORCENTAJE, 150, 10000)).toBe(0)
  })

  it('MONTO_FIJO devuelve el valor fijo', () => {
    expect(calcularMontoConDescuento(TipoCupon.MONTO_FIJO, 5000, 10000)).toBe(5000)
  })

  it('devuelve null para tipos o valores inválidos', () => {
    expect(calcularMontoConDescuento(TipoCupon.PORCENTAJE, null, 10000)).toBeNull()
    expect(calcularMontoConDescuento(TipoCupon.MONTO_FIJO, null, 10000)).toBeNull()
  })
})

describe('tipoCuponALabel', () => {
  it('traduce cada tipo a su etiqueta de usuario', () => {
    expect(tipoCuponALabel(TipoCupon.MES_GRATIS)).toBe('Primer mes gratis')
    expect(tipoCuponALabel(TipoCupon.PORCENTAJE)).toBe('Descuento porcentual')
    expect(tipoCuponALabel(TipoCupon.MONTO_FIJO)).toBe('Monto fijo')
  })
})
