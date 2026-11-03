import { describe, expect, it } from 'vitest'

import {
  corteVentanaReportes,
  claveRateLimitReporte,
  esMotivoReporteValido,
  REPORTES_PARA_SENAL,
  VENTANA_RATE_LIMIT_REPORTE_SEGUNDOS,
} from '@/lib/reporte'

const ahora = new Date('2026-10-28T12:00:00Z')

describe('esMotivoReporteValido', () => {
  it('acepta todos los motivos del enum', () => {
    const validos = [
      'DUDOSO',
      'DATO_FALSO',
      'CONTENIDO_INADECUADO',
      'ESTAFO',
      'OTRO',
    ]

    for (const motivo of validos) {
      expect(esMotivoReporteValido(motivo)).toBe(true)
    }
  })

  it('rechaza motivos inválidos', () => {
    expect(esMotivoReporteValido('ROBO')).toBe(false)
    expect(esMotivoReporteValido('')).toBe(false)
  })
})

describe('claveRateLimitReporte', () => {
  it('combina IP hasheada y slug', () => {
    expect(claveRateLimitReporte('ip-abc', 'juan-perez')).toBe(
      'reporte:ip:ip-abc:juan-perez',
    )
  })
})

describe('VENTANA_RATE_LIMIT_REPORTE_SEGUNDOS', () => {
  it('es un día entero', () => {
    expect(VENTANA_RATE_LIMIT_REPORTE_SEGUNDOS).toBe(24 * 60 * 60)
  })
})

describe('corteVentanaReportes', () => {
  it('retrocede 24 horas en UTC', () => {
    const esperado = new Date('2026-10-27T12:00:00Z')
    expect(corteVentanaReportes(ahora)).toEqual(esperado)
  })
})

describe('REPORTES_PARA_SENAL', () => {
  it('el umbral es de 3 reportes', () => {
    expect(REPORTES_PARA_SENAL).toBe(3)
  })
})
