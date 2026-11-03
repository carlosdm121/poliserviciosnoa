import { describe, expect, it } from 'vitest'

import {
  debeConservarHashEnBloqueo,
  fechaDeCorte,
  PoliticaRetencion,
  politicasRetencion,
  seConservaPorPlazoFiscal,
} from '@/lib/retention'
import { addDays } from '@/lib/fechas'

describe('fechaDeCorte', () => {
  const ahora = new Date(Date.UTC(2026, 9, 30))

  it('documentosEmpresa se borra al resolver (0 días)', () => {
    expect(fechaDeCorte('documentosEmpresa', ahora)).toEqual(ahora)
  })

  it('senalesIp se borran a los 30 días', () => {
    const esperado = addDays(ahora, -30)
    expect(fechaDeCorte('senalesIp', ahora)).toEqual(esperado)
  })

  it('verificacionesWhatsappVencidas se borran a los 30 días', () => {
    const esperado = addDays(ahora, -30)
    expect(fechaDeCorte('verificacionesWhatsappVencidas', ahora)).toEqual(
      esperado,
    )
  })

  it('datosPersonalesBaja se anonimiza al darse de baja (0 días)', () => {
    expect(fechaDeCorte('datosPersonalesBaja', ahora)).toEqual(ahora)
  })
})

describe('debeConservarHashEnBloqueo', () => {
  it('conserva el hash si el perfil está suspendido por fraude', () => {
    expect(
      debeConservarHashEnBloqueo('SUSPENDED', 'Suspendido por FRAUDE comprobado.'),
    ).toBe(true)
    expect(
      debeConservarHashEnBloqueo('SUSPENDED', 'Suplantación de número.'),
    ).toBe(true)
    expect(
      debeConservarHashEnBloqueo('SUSPENDED', 'Sustitución de identidad.'),
    ).toBe(true)
  })

  it('no conserva el hash si está suspendido por otro motivo', () => {
    expect(
      debeConservarHashEnBloqueo('SUSPENDED', 'Reclamos de calidad de servicio.'),
    ).toBe(false)
  })

  it('no conserva el hash si no está suspendido', () => {
    expect(debeConservarHashEnBloqueo('APPROVED', 'fraude')).toBe(false)
    expect(debeConservarHashEnBloqueo('PENDING_REVIEW', 'fraude')).toBe(false)
    expect(debeConservarHashEnBloqueo(null, 'fraude')).toBe(false)
    expect(debeConservarHashEnBloqueo('SUSPENDED', null)).toBe(false)
  })
})

describe('seConservaPorPlazoFiscal', () => {
  it('conserva facturas y pagos', () => {
    expect(seConservaPorPlazoFiscal('factura')).toBe(true)
    expect(seConservaPorPlazoFiscal('comprobante')).toBe(true)
    expect(seConservaPorPlazoFiscal('pago')).toBe(true)
    expect(seConservaPorPlazoFiscal('registro de pago')).toBe(true)
    expect(seConservaPorPlazoFiscal('nota de credito')).toBe(true)
    expect(seConservaPorPlazoFiscal('nota de crédito')).toBe(true)
  })

  it('no conserva datos personales', () => {
    expect(seConservaPorPlazoFiscal('whatsapp')).toBe(false)
    expect(seConservaPorPlazoFiscal('email')).toBe(false)
    expect(seConservaPorPlazoFiscal('nombre')).toBe(false)
  })
})

describe('politicasRetencion', () => {
  it('devuelve todas las políticas con dato, seConserva y motivo', () => {
    const politicas = politicasRetencion()

    expect(politicas.length).toBeGreaterThan(0)

    for (const politica of politicas) {
      expect(typeof politica.dato).toBe('string')
      expect(typeof politica.seConserva).toBe('boolean')
      expect(typeof politica.motivo).toBe('string')
      // plazoDias es number o null
      expect(
        politica.plazoDias === null || typeof politica.plazoDias === 'number',
      ).toBe(true)
    }
  })

  it('marca facturas y pagos como conservados', () => {
    const facturas = politicasRetencion().find(
      (p: PoliticaRetencion) => p.dato === 'Datos fiscales y facturas',
    )
    expect(facturas?.seConserva).toBe(true)

    const pagos = politicasRetencion().find(
      (p: PoliticaRetencion) => p.dato === 'Registros de pago',
    )
    expect(pagos?.seConserva).toBe(true)
  })

  it('marca documentos de empresa como no conservados', () => {
    const documentos = politicasRetencion().find(
      (p: PoliticaRetencion) =>
        p.dato === 'Documentos de empresa (constancia de inscripción)',
    )
    expect(documentos?.seConserva).toBe(false)
    expect(documentos?.plazoDias).toBe(0)
  })
})
