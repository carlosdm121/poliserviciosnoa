import { describe, expect, it } from 'vitest'

import {
  aplicarLimiteSemanal,
  filtrarElegibles,
  firmarBaja,
  inicioVentanaSemanal,
  limiteContactoElegible,
  verificarFirmaBaja,
} from '@/lib/invitacion'

const DIA = 24 * 60 * 60 * 1000

describe('firma de baja de invitaciones', () => {
  const clienteId = 'cliente-abc123'

  it('verifica una firma generada por el servidor', () => {
    const sig = firmarBaja(clienteId)

    expect(verificarFirmaBaja(clienteId, sig)).toBe(true)
  })

  it('rechaza una firma alterada', () => {
    const sig = firmarBaja(clienteId)
    const alterada = sig.slice(0, -2) + '00'

    expect(verificarFirmaBaja(clienteId, alterada)).toBe(false)
  })

  it('rechaza una firma de otro cliente', () => {
    const sig = firmarBaja(clienteId)

    expect(verificarFirmaBaja('cliente-otro', sig)).toBe(false)
  })

  it('rechaza una firma con largo distinto', () => {
    const sig = firmarBaja(clienteId)

    expect(verificarFirmaBaja(clienteId, sig.slice(0, 10))).toBe(false)
    expect(verificarFirmaBaja(clienteId, sig + 'aa')).toBe(false)
  })

  it('rechaza una firma vacía', () => {
    expect(verificarFirmaBaja(clienteId, '')).toBe(false)
  })
})

describe('filtrarElegibles', () => {
  const candidatos = [
    { clientId: 'c1', profileId: 'p1' },
    { clientId: 'c1', profileId: 'p2' },
    { clientId: 'c2', profileId: 'p1' },
    { clientId: 'c2', profileId: 'p2' },
  ]

  it('devuelve todos cuando nadie votó ni recibió invitación', () => {
    const elegibles = filtrarElegibles(
      candidatos as any,
      new Set(),
      new Set(),
    )

    expect(elegibles).toHaveLength(4)
  })

  it('elimina quien ya votó', () => {
    const elegibles = filtrarElegibles(
      candidatos as any,
      new Set(['c1:p1']),
      new Set(),
    )

    expect(elegibles).toHaveLength(3)
    expect(elegibles.map((e) => `${e.clientId}:${e.profileId}`)).not.toContain(
      'c1:p1',
    )
  })

  it('elimina quien ya recibió invitación', () => {
    const elegibles = filtrarElegibles(
      candidatos as any,
      new Set(),
      new Set(['c2:p2']),
    )

    expect(elegibles).toHaveLength(3)
    expect(elegibles.map((e) => `${e.clientId}:${e.profileId}`)).not.toContain(
      'c2:p2',
    )
  })

  it('elimina quien ya votó y ya recibió invitación', () => {
    const elegibles = filtrarElegibles(
      candidatos as any,
      new Set(['c1:p1']),
      new Set(['c1:p2']),
    )

    expect(elegibles).toHaveLength(2)
    expect(elegibles.map((e) => `${e.clientId}:${e.profileId}`)).toEqual([
      'c2:p1',
      'c2:p2',
    ])
  })
})

describe('aplicarLimiteSemanal', () => {
  const elegibles = [
    { clientId: 'c1', profileId: 'p1' },
    { clientId: 'c1', profileId: 'p2' },
    { clientId: 'c1', profileId: 'p3' },
    { clientId: 'c1', profileId: 'p4' },
    { clientId: 'c2', profileId: 'p1' },
    { clientId: 'c2', profileId: 'p2' },
  ] as any

  it('deja pasar hasta 3 por cliente', () => {
    const contador = new Map<string, number>()
    const resultado = aplicarLimiteSemanal(elegibles, contador)

    // c1 tiene 4 elegibles (acepta 3), c2 tiene 2 (acepta 2).
    expect(resultado).toHaveLength(5)
    expect(contador.get('c1')).toBe(3)
    expect(contador.get('c2')).toBe(2)
  })

  it('respeta el límite acumulado de corridas previas', () => {
    const contador = new Map<string, number>([['c1', 2], ['c2', 0]])
    const resultado = aplicarLimiteSemanal(elegibles, contador)

    // c1 ya tiene 2, solo puede recibir 1 más. c2 recibe 2.
    expect(resultado.map((e) => e.clientId)).toEqual(['c1', 'c2', 'c2'])
    expect(contador.get('c1')).toBe(3)
    expect(contador.get('c2')).toBe(2)
  })

  it('no deja pasar al cliente que ya llegó al límite', () => {
    const contador = new Map<string, number>([['c1', 3]])
    const resultado = aplicarLimiteSemanal(elegibles, contador)

    expect(resultado.map((e) => e.clientId)).toEqual(['c2', 'c2'])
    expect(contador.get('c1')).toBe(3)
  })
})

describe('fechas', () => {
  const ahora = new Date('2026-10-28T12:00:00Z')

  it('limiteContactoElegible son 48 horas antes', () => {
    const esperado = new Date('2026-10-26T12:00:00Z')

    expect(limiteContactoElegible(ahora)).toEqual(esperado)
  })

  it('inicioVentanaSemanal son 7 días antes', () => {
    const esperado = new Date('2026-10-21T12:00:00Z')

    expect(inicioVentanaSemanal(ahora)).toEqual(esperado)
  })
})
