import { describe, expect, it } from 'vitest'

import {
  DIAS_ARREPENTIMIENTO,
  dentroDelPlazoDeArrepentimiento,
  diasRestantesDeArrepentimiento,
  generarNumeroTramite,
} from '@/lib/cancelaciones'
import { avisoPara, claveDePeriodo, diasHasta } from '@/server/jobs/fechas'

/**
 * Tests de las reglas de baja, arrepentimiento y ventanas de aviso.
 *
 * Son funciones puras: acá se prueba el borde del día 10, el salto de día por
 * hora del cron y el formato del trámite. El flujo contra base y pasarela lo
 * cubren `scripts/verificar-cancelaciones.ts` y `scripts/verificar-cron.ts`.
 *
 * El caso que más importa es el del plazo: un día de más es un reembolso que no
 * correspondía; un día de menos es un derecho que se le negó al profesional.
 */

const DIA = 24 * 60 * 60 * 1000

describe('plazo de arrepentimiento', () => {
  const contratado = new Date('2026-10-01T15:00:00Z')

  it('acepta justo en el día 10, inclusive', () => {
    const enElLimite = new Date(contratado.getTime() + DIAS_ARREPENTIMIENTO * DIA)

    expect(dentroDelPlazoDeArrepentimiento(contratado, enElLimite)).toBe(true)
  })

  it('rechaza un milisegundo después del límite', () => {
    const pasado = new Date(contratado.getTime() + DIAS_ARREPENTIMIENTO * DIA + 1)

    expect(dentroDelPlazoDeArrepentimiento(contratado, pasado)).toBe(false)
  })

  it('rechaza un pago con fecha futura', () => {
    const antes = new Date(contratado.getTime() - DIA)

    expect(dentroDelPlazoDeArrepentimiento(contratado, antes)).toBe(false)
  })

  it('cuenta los días restantes hacia arriba', () => {
    // 9 días y 1 hora transcurridos: queda menos de un día, pero queda.
    const ahora = new Date(contratado.getTime() + 9 * DIA + 60 * 60 * 1000)

    expect(diasRestantesDeArrepentimiento(contratado, ahora)).toBe(1)
  })

  it('devuelve 0 cuando ya venció', () => {
    const ahora = new Date(contratado.getTime() + 11 * DIA)

    expect(diasRestantesDeArrepentimiento(contratado, ahora)).toBe(0)
  })
})

describe('número de trámite', () => {
  const ahora = new Date('2026-10-27T12:00:00Z')

  it('usa el prefijo de arrepentimiento', () => {
    expect(generarNumeroTramite('ARREPENTIMIENTO', ahora, 'ab12cd34')).toBe('AR-20261027-AB12CD')
  })

  it('usa el prefijo de baja', () => {
    expect(generarNumeroTramite('BAJA', ahora, 'zz99')).toBe('BA-20261027-ZZ99')
  })

  it('no deja el número vacío si el sufijo no trae letras', () => {
    expect(generarNumeroTramite('BAJA', ahora, '----')).toBe('BA-20261027-000000')
  })
})

describe('ventanas de aviso', () => {
  const ahora = new Date('2026-10-01T12:00:00Z')

  it('calcula días hacia arriba para no saltear el aviso por la hora', () => {
    const vence = new Date('2026-10-06T18:00:00Z')

    expect(diasHasta(ahora, vence)).toBe(6)
  })

  it('avisa a 5, 4 y 3 días con la plantilla de 5 días', () => {
    expect(avisoPara(5)).toBe('5d')
    expect(avisoPara(4)).toBe('5d')
    expect(avisoPara(3)).toBe('5d')
  })

  it('avisa a 2 y 1 días con la plantilla de 2 días', () => {
    expect(avisoPara(2)).toBe('2d')
    expect(avisoPara(1)).toBe('2d')
  })

  it('no avisa el día del vencimiento ni después', () => {
    expect(avisoPara(0)).toBeNull()
    expect(avisoPara(-3)).toBeNull()
  })

  it('no avisa con demasiada anticipación', () => {
    expect(avisoPara(6)).toBeNull()
    expect(avisoPara(30)).toBeNull()
  })

  it('arma la clave de período en UTC', () => {
    expect(claveDePeriodo(new Date('2026-11-01T02:00:00Z'))).toBe('2026-11-01')
  })
})
