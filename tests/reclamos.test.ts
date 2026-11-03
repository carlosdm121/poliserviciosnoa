import { describe, expect, it } from 'vitest'

import {
  DIAS_LIMITE_RECLAMO,
  generarNumeroTramiteReclamo,
  limiteTreintaDias,
  esMotivoValido,
  validarDescripcion,
} from '@/lib/reclamo'

const DIA = 24 * 60 * 60 * 1000
const ahora = new Date('2026-10-28T12:00:00Z')

describe('validarDescripcion', () => {
  it('rechaza una descripción vacía', () => {
    expect(validarDescripcion('')).toBe('La descripción es obligatoria.')
    expect(validarDescripcion('   ')).toBe('La descripción es obligatoria.')
  })

  it('rechaza una descripción demasiado larga', () => {
    const larga = 'a'.repeat(1001)
    expect(validarDescripcion(larga)).toBe(
      'La descripción no puede superar los 1000 caracteres.',
    )
  })

  it('acepta una descripción válida', () => {
    expect(validarDescripcion('El profesional no se presentó.')).toBe(null)
    expect(validarDescripcion('a'.repeat(1000))).toBe(null)
  })
})

describe('generarNumeroTramiteReclamo', () => {
  it('arma el formato RC-AAAAMMDD-SUFRIJO', () => {
    expect(generarNumeroTramiteReclamo(ahora, 'ab12cd34')).toBe(
      'RC-20261028-AB12CD',
    )
  })

  it('usa ceros cuando el sufijo no tiene alfanuméricos', () => {
    expect(generarNumeroTramiteReclamo(ahora, '----')).toBe(
      'RC-20261028-000000',
    )
  })
})

describe('limiteTreintaDias', () => {
  it('retrocede 30 días en UTC', () => {
    const esperado = new Date('2026-09-28T12:00:00Z')
    expect(limiteTreintaDias(ahora)).toEqual(esperado)
  })
})

describe('esMotivoValido', () => {
  it('acepta todos los motivos del enum', () => {
    const validos = [
      'NO_SE_PRESENTO',
      'MALA_CALIDAD',
      'COBRO_EXCESIVO',
      'TRATO_INADECUADO',
      'FRAUDE',
      'OTRO',
    ]

    for (const motivo of validos) {
      expect(esMotivoValido(motivo)).toBe(true)
    }
  })

  it('rechaza motivos inválidos', () => {
    expect(esMotivoValido('ROBO')).toBe(false)
    expect(esMotivoValido('')).toBe(false)
    expect(esMotivoValido('no_se_presento')).toBe(false)
  })
})

describe('constantes', () => {
  it('el límite es de 30 días', () => {
    expect(DIAS_LIMITE_RECLAMO).toBe(30)
  })
})
