import { describe, expect, it } from 'vitest'

import {
  evolucionSemanal,
  fechaDeEstadistica,
  inicioVentana,
  maximoSemanal,
  sumaCampoReciente,
  sumaCampoTotal,
  ultimosNDias,
} from '@/lib/panel-metricas'

const DIA = 24 * 60 * 60 * 1000

function stat(fechaISO: string, views: number, whatsappClicks: number) {
  return {
    date: new Date(fechaISO),
    views,
    whatsappClicks,
  }
}

const ahora = new Date('2026-10-28T12:00:00Z')

describe('fechaDeEstadistica', () => {
  it('devuelve YYYY-MM-DD en UTC', () => {
    expect(fechaDeEstadistica(stat('2026-10-28T00:00:00Z', 1, 2))).toBe('2026-10-28')
    expect(fechaDeEstadistica(stat('2026-10-01T23:59:59Z', 0, 0))).toBe('2026-10-01')
  })
})

describe('inicioVentana', () => {
  it('retrocede dias-1 días desde hoy en UTC', () => {
    // Hoy 28, 30 días → 29 de septiembre.
    expect(inicioVentana(ahora, 30)).toEqual(new Date('2026-09-29T00:00:00Z'))
    // 1 día → hoy mismo.
    expect(inicioVentana(ahora, 1)).toEqual(new Date('2026-10-28T00:00:00Z'))
  })
})

describe('ultimosNDias', () => {
  const stats = [
    stat('2026-09-28T00:00:00Z', 1, 0), // fuera de ventana (antes del 29 sep)
    stat('2026-09-29T00:00:00Z', 5, 1), // dentro
    stat('2026-10-28T00:00:00Z', 3, 2), // hoy, dentro
    stat('2026-10-29T00:00:00Z', 9, 0), // fuera (futuro)
  ]

  it('filtra solo los días dentro de la ventana y ordena de viejo a nuevo', () => {
    const resultado = ultimosNDias(stats, ahora, 30)

    expect(resultado).toHaveLength(2)
    expect(resultado[0]!.date.toISOString()).toBe('2026-09-29T00:00:00.000Z')
    expect(resultado[1]!.date.toISOString()).toBe('2026-10-28T00:00:00.000Z')
  })

  it('con ventana de 1 día devuelve solo hoy', () => {
    const resultado = ultimosNDias(stats, ahora, 1)

    expect(resultado).toHaveLength(1)
    expect(resultado[0]!.date.toISOString()).toBe('2026-10-28T00:00:00.000Z')
  })
})

describe('sumaCampoReciente', () => {
  const stats = [
    stat('2026-09-29T00:00:00Z', 5, 1),
    stat('2026-10-28T00:00:00Z', 3, 2),
  ]

  it('suma whatsappClicks de los últimos 30 días', () => {
    expect(sumaCampoReciente(stats, ahora, 30, 'whatsappClicks')).toBe(3)
  })

  it('suma views de los últimos 30 días', () => {
    expect(sumaCampoReciente(stats, ahora, 30, 'views')).toBe(8)
  })

  it('con ventana de 1 día solo cuenta hoy', () => {
    expect(sumaCampoReciente(stats, ahora, 1, 'views')).toBe(3)
  })
})

describe('sumaCampoTotal', () => {
  const stats = [
    stat('2026-10-01T00:00:00Z', 5, 1),
    stat('2026-10-02T00:00:00Z', 3, 2),
  ]

  it('suma todos los views', () => {
    expect(sumaCampoTotal(stats, 'views')).toBe(8)
  })

  it('suma todos los whatsappClicks', () => {
    expect(sumaCampoTotal(stats, 'whatsappClicks')).toBe(3)
  })
})

describe('evolucionSemanal', () => {
  it('devuelve 7 días con ceros donde no hay datos', () => {
    const stats = [stat('2026-10-28T00:00:00Z', 10, 4)]

    const resultado = evolucionSemanal(stats, ahora)

    expect(resultado).toHaveLength(7)
    // El último elemento es hoy (28 de octubre).
    expect(resultado[6]!.fecha).toBe('2026-10-28')
    expect(resultado[6]!.visitas).toBe(10)
    expect(resultado[6]!.clics).toBe(4)
    // Los días anteriores sin datos valen 0.
    expect(resultado[0]!.fecha).toBe('2026-10-22')
    expect(resultado[0]!.visitas).toBe(0)
    expect(resultado[0]!.clics).toBe(0)
  })

  it('suma varios registros del mismo día', () => {
    const stats = [
      stat('2026-10-28T00:00:00Z', 5, 2),
      stat('2026-10-28T12:00:00Z', 5, 2),
    ]

    const resultado = evolucionSemanal(stats, ahora)

    expect(resultado[6]!.visitas).toBe(10)
    expect(resultado[6]!.clics).toBe(4)
  })
})

describe('maximoSemanal', () => {
  it('devuelve el total máximo de un día', () => {
    const evolucion = [
      { fecha: '2026-10-22', visitas: 2, clics: 1 },
      { fecha: '2026-10-23', visitas: 5, clics: 3 },
      { fecha: '2026-10-24', visitas: 1, clics: 0 },
    ]

    expect(maximoSemanal(evolucion)).toBe(8)
  })

  it('devuelve 0 si no hay actividad', () => {
    expect(maximoSemanal([])).toBe(0)
    expect(
      maximoSemanal([
        { fecha: '2026-10-22', visitas: 0, clics: 0 },
      ]),
    ).toBe(0)
  })
})
