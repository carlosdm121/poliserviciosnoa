import { describe, expect, it } from 'vitest'

import {
  diasHabiles,
  esCategoriaValida,
  esEstadoValido,
  ETIQUETA_CATEGORIA,
  ETIQUETA_ESTADO_TICKET,
  ETIQUETA_PRIORIDAD,
  generarNumeroTramiteTicket,
} from '@/lib/soporte'
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client'

describe('generarNumeroTramiteTicket', () => {
  it('devuelve formato ST-YYYYMMDD-sufijo', () => {
    const ahora = new Date(Date.UTC(2026, 9, 28)) // 28/10/2026

    const numero = generarNumeroTramiteTicket(ahora, 'juan-perez-ticket')

    expect(numero).toMatch(/^ST-20261028-[A-Z0-9]{1,6}$/)
  })

  it('reemplaza caracteres raros y pone mayúsculas', () => {
    const ahora = new Date(Date.UTC(2026, 0, 1))

    const numero = generarNumeroTramiteTicket(ahora, 'a b!c')

    expect(numero).toBe('ST-20260101-ABC')
  })

  it('usa ceros cuando el sufijo queda vacío', () => {
    const ahora = new Date(Date.UTC(2026, 5, 15))

    const numero = generarNumeroTramiteTicket(ahora, '!!!')

    expect(numero).toBe('ST-20260615-000000')
  })
})

describe('diasHabiles', () => {
  it('no cuenta sábados ni domingos', () => {
    // Miércoles 21/10/2026 a martes 27/10/2026 (hasta excluyente): fin de
    // semana 24-25 en el medio. Cuenta 21, 22, 23 y 26 = 4 días hábiles.
    const desde = new Date(Date.UTC(2026, 9, 21))
    const hasta = new Date(Date.UTC(2026, 9, 27))

    expect(diasHabiles(desde, hasta)).toBe(4)
  })

  it('devuelve 0 si desde y hasta son el mismo día', () => {
    const dia = new Date(Date.UTC(2026, 9, 21))

    expect(diasHabiles(dia, dia)).toBe(0)
  })

  it('cuenta solo días hábiles entre lunes y viernes', () => {
    // Lunes 19 a viernes 23/10/2026: 5 días hábiles
    const desde = new Date(Date.UTC(2026, 9, 19))
    const hasta = new Date(Date.UTC(2026, 9, 23))

    expect(diasHabiles(desde, hasta)).toBe(4)
  })
})

describe('esCategoriaValida', () => {
  it('acepta cada categoría del enum', () => {
    for (const valor of Object.values(TicketCategory)) {
      expect(esCategoriaValida(valor)).toBe(true)
    }
  })

  it('rechaza valores que no son categoría', () => {
    expect(esCategoriaValida('NO_EXISTE')).toBe(false)
    expect(esCategoriaValida('')).toBe(false)
  })
})

describe('esEstadoValido', () => {
  it('acepta cada estado del enum', () => {
    for (const valor of Object.values(TicketStatus)) {
      expect(esEstadoValido(valor)).toBe(true)
    }
  })

  it('rechaza valores que no son estado', () => {
    expect(esEstadoValido('VALIDADO')).toBe(false)
    expect(esEstadoValido('')).toBe(false)
  })
})

describe('etiquetas', () => {
  it('cada categoría tiene etiqueta', () => {
    for (const valor of Object.values(TicketCategory)) {
      expect(ETIQUETA_CATEGORIA[valor]).toBeDefined()
      expect(ETIQUETA_CATEGORIA[valor].length).toBeGreaterThan(0)
    }
  })

  it('cada prioridad tiene etiqueta', () => {
    for (const valor of Object.values(TicketPriority)) {
      expect(ETIQUETA_PRIORIDAD[valor]).toBeDefined()
    }
  })

  it('cada estado tiene etiqueta', () => {
    for (const valor of Object.values(TicketStatus)) {
      expect(ETIQUETA_ESTADO_TICKET[valor]).toBeDefined()
    }
  })
})
