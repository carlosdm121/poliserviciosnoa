import { describe, expect, it, beforeEach } from 'vitest'

import {
  codigoComprobante,
  condicionIvaReceptorId,
  desglosarImporte,
  documentoReceptor,
  esperaBackoff,
  etiquetaCondicionIva,
  fechaComprobante,
  fechaDesdeArca,
  formatearCsv,
  idAlicuotaIva,
  importeCsv,
  rangoDelMes,
  redondear2,
} from '@/lib/arca/calculos'
import { facturacionMock, fallarEmisionMock, llamadasMock, resetMockArca } from '@/lib/arca/mock'
import { generarPdfComprobante } from '@/lib/arca/pdf'
import { ErrorFacturacion, type DatosComprobante } from '@/lib/arca/provider'

/**
 * Tests de facturación.
 *
 * Lo que se prueba acá es la lógica que no necesita base ni red: el desglose de
 * IVA, la traducción de códigos de ARCA, el CSV del contador, la numeración del
 * mock y el PDF. El flujo completo contra la base lo cubre
 * `scripts/verificar-facturacion.ts`.
 *
 * El caso más importante es el desglose: neto + IVA tiene que dar el total
 * exacto, siempre. Un centavo de diferencia es una factura rechazada por ARCA.
 */

function datosDePrueba(extra: Partial<DatosComprobante> = {}): DatosComprobante {
  return {
    referencia: 'invoice-1',
    fecha: new Date('2026-03-15T12:00:00Z'),
    tipoComprobante: 'C',
    puntoVenta: 1,
    numero: 1,
    neto: 10000,
    iva: 0,
    total: 10000,
    descripcion: 'Suscripción mensual',
    receptor: {
      nombre: 'María Pérez',
      documento: '20304050607',
      condicionIva: 'RESPONSABLE_MONOTRIBUTO',
    },
    ...extra,
  }
}

describe('desglosarImporte', () => {
  it('factura C no discrimina IVA', () => {
    expect(desglosarImporte(10000, 'C', 21)).toEqual({ neto: 10000, iva: 0 })
  })

  it('factura A calcula el neto hacia atrás', () => {
    const { neto, iva } = desglosarImporte(12100, 'A', 21)

    expect(neto).toBe(10000)
    expect(iva).toBe(2100)
  })

  it('la suma de neto e IVA da el total exacto con centavos', () => {
    for (const total of [10000, 10000.01, 12345.67, 9999.99]) {
      for (const alicuota of [21, 10.5, 27]) {
        const { neto, iva } = desglosarImporte(total, 'B', alicuota)

        expect(redondear2(neto + iva)).toBe(total)
      }
    }
  })

  it('con alícuota cero se comporta como factura C', () => {
    expect(desglosarImporte(5000, 'A', 0)).toEqual({ neto: 5000, iva: 0 })
  })
})

describe('códigos de ARCA', () => {
  it('traduce las letras de factura', () => {
    expect(codigoComprobante('A')).toBe(1)
    expect(codigoComprobante('B')).toBe(6)
    expect(codigoComprobante('C')).toBe(11)
  })

  it('traduce las letras de nota de crédito', () => {
    expect(codigoComprobante('A', true)).toBe(3)
    expect(codigoComprobante('B', true)).toBe(8)
    expect(codigoComprobante('C', true)).toBe(13)
  })

  it('traduce las alícuotas de IVA', () => {
    expect(idAlicuotaIva(21)).toBe(5)
    expect(idAlicuotaIva(10.5)).toBe(4)
    expect(idAlicuotaIva(27)).toBe(6)
  })

  it('traduce la condición del receptor y asume consumidor final', () => {
    expect(condicionIvaReceptorId('RESPONSABLE_INSCRIPTO')).toBe(1)
    expect(condicionIvaReceptorId('RESPONSABLE_MONOTRIBUTO')).toBe(6)
    expect(condicionIvaReceptorId('EXENTO')).toBe(4)
    expect(condicionIvaReceptorId('LIBERADO')).toBe(10)
    expect(condicionIvaReceptorId('CONSUMIDOR_FINAL')).toBe(5)
    expect(condicionIvaReceptorId(null)).toBe(5)
  })
})

describe('documentoReceptor', () => {
  it('manda 11 dígitos como CUIT', () => {
    expect(documentoReceptor('20-30405060-7')).toEqual({ docTipo: 80, docNro: 20304050607 })
  })

  it('manda 7 u 8 dígitos como DNI', () => {
    expect(documentoReceptor('30123456')).toEqual({ docTipo: 96, docNro: 30123456 })
    expect(documentoReceptor('1234567')).toEqual({ docTipo: 96, docNro: 1234567 })
  })

  it('sin documento válido usa el genérico de ARCA', () => {
    expect(documentoReceptor(null)).toEqual({ docTipo: 99, docNro: 0 })
    expect(documentoReceptor('')).toEqual({ docTipo: 99, docNro: 0 })
    expect(documentoReceptor('123')).toEqual({ docTipo: 99, docNro: 0 })
  })
})

describe('fechas de ARCA', () => {
  it('usa la fecha argentina, no la UTC', () => {
    // 02:30 UTC del 1 de marzo son las 23:30 del 28 de febrero en Argentina.
    expect(fechaComprobante(new Date('2026-03-01T02:30:00Z'))).toBe('20260228')
  })

  it('vuelve de YYYYMMDD a Date', () => {
    expect(fechaDesdeArca('20260228').toISOString()).toBe('2026-02-28T12:00:00.000Z')
  })
})

describe('backoff de la cola', () => {
  it('arranca en un minuto y crece', () => {
    expect(esperaBackoff(1)).toBe(60_000)
    expect(esperaBackoff(2)).toBe(5 * 60_000)
    expect(esperaBackoff(3)).toBe(15 * 60_000)
    expect(esperaBackoff(4)).toBe(60 * 60_000)
    expect(esperaBackoff(5)).toBe(6 * 60 * 60_000)
  })

  it('se queda en 24 horas y no desborda', () => {
    expect(esperaBackoff(6)).toBe(24 * 60 * 60_000)
    expect(esperaBackoff(99)).toBe(24 * 60 * 60_000)
    expect(esperaBackoff(0)).toBe(60_000)
  })
})

describe('CSV del contador', () => {
  it('usa punto y coma y termina cada fila', () => {
    const csv = formatearCsv([
      ['Fecha', 'Total'],
      ['2026-03-15', '10000,00'],
    ])

    expect(csv).toBe('Fecha;Total\r\n2026-03-15;10000,00\r\n')
  })

  it('escapa comillas, punto y coma y saltos de línea', () => {
    expect(formatearCsv([['a;b', 'di "hola"', 'linea\ncorta']])).toBe(
      '"a;b";"di ""hola""";"linea\ncorta"\r\n',
    )
  })

  it('deja vacías las celdas nulas', () => {
    expect(formatearCsv([[null, undefined, '']])).toBe(';;\r\n')
  })

  it('formatea importes con coma decimal', () => {
    expect(importeCsv(1234.5)).toBe('1234,50')
    expect(importeCsv(0)).toBe('0,00')
  })
})

describe('etiquetaCondicionIva', () => {
  it('traduce las condiciones conocidas', () => {
    expect(etiquetaCondicionIva('RESPONSABLE_MONOTRIBUTO')).toBe('Responsable Monotributo')
    expect(etiquetaCondicionIva('CONSUMIDOR_FINAL')).toBe('Consumidor Final')
  })

  it('devuelve el valor crudo si no lo conoce', () => {
    expect(etiquetaCondicionIva('OTRA')).toBe('OTRA')
  })
})

describe('rangoDelMes', () => {
  it('abre el mes a las 00:00 de Argentina', () => {
    const { inicio } = rangoDelMes(2026, 3)

    expect(inicio.toISOString()).toBe('2026-03-01T03:00:00.000Z')
  })

  it('cierra en el primer día del mes siguiente', () => {
    const marzo = rangoDelMes(2026, 3)
    const abril = rangoDelMes(2026, 4)

    expect(marzo.fin.toISOString()).toBe(abril.inicio.toISOString())
  })

  it('cruza el año', () => {
    expect(rangoDelMes(2026, 12).fin.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('proveedor mock', () => {
  beforeEach(() => {
    resetMockArca()
  })

  it('numera desde 1 y respeta la secuencia', async () => {
    expect(await facturacionMock.ultimoNumero('C', 1)).toBe(0)

    const emitida = await facturacionMock.emitirFactura(datosDePrueba())

    expect(emitida.numero).toBe(1)
    expect(emitida.cae).toMatch(/^\d{14}$/)
    expect(await facturacionMock.ultimoNumero('C', 1)).toBe(1)
  })

  it('es idempotente por referencia', async () => {
    const primera = await facturacionMock.emitirFactura(datosDePrueba())
    const segunda = await facturacionMock.emitirFactura(datosDePrueba())

    expect(segunda).toEqual(primera)
    expect(llamadasMock()).toBe(1)
  })

  it('rechaza un número fuera de secuencia', async () => {
    await expect(
      facturacionMock.emitirFactura(datosDePrueba({ numero: 5 })),
    ).rejects.toBeInstanceOf(ErrorFacturacion)
  })

  it('las notas de crédito tienen secuencia propia', async () => {
    const factura = await facturacionMock.emitirFactura(datosDePrueba())

    const nota = await facturacionMock.anularFactura({
      ...datosDePrueba({ referencia: 'nota-1' }),
      motivo: 'Reembolso',
      factura: {
        numero: factura.numero,
        puntoVenta: factura.puntoVenta,
        tipoComprobante: 'C',
        cae: factura.cae,
      },
    })

    expect(nota.numero).toBe(1)
    expect(await facturacionMock.ultimoNumero('C', 1, true)).toBe(1)
  })

  it('la falla simulada es reintentable', async () => {
    fallarEmisionMock(true)

    await expect(facturacionMock.emitirFactura(datosDePrueba())).rejects.toMatchObject({
      reintentable: true,
    })
  })
})

describe('PDF del comprobante', () => {
  const pdfBase = {
    tipoComprobante: 'C' as const,
    puntoVenta: 1,
    numero: 42,
    fecha: new Date('2026-03-15T12:00:00Z'),
    cae: '71234567890123',
    caeVence: new Date('2026-03-25T12:00:00Z'),
    neto: 10000,
    iva: 0,
    total: 10000,
    descripcion: 'Suscripción mensual',
    emisor: {
      nombre: 'PoliserviciosNOA',
      cuit: '20409378472',
      condicionIva: 'Responsable Monotributo',
    },
    receptor: {
      nombre: 'María Pérez',
      documento: '20304050607',
      condicionIva: 'RESPONSABLE_MONOTRIBUTO' as const,
    },
  }

  it('genera un PDF válido con encabezado y fin de archivo', () => {
    const pdf = Buffer.from(generarPdfComprobante(pdfBase)).toString('latin1')

    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Type /Catalog')
    expect(pdf).toContain('startxref')
  })

  it('incluye los datos fiscales y los acentos', () => {
    const pdf = Buffer.from(generarPdfComprobante(pdfBase)).toString('latin1')

    expect(pdf).toContain('FACTURA C')
    expect(pdf).toContain('CAE: 71234567890123')
    expect(pdf).toContain('María Pérez')
    expect(pdf).toContain('Suscripción mensual')
  })

  it('genera una nota de crédito con el comprobante asociado', () => {
    const pdf = Buffer.from(
      generarPdfComprobante({
        ...pdfBase,
        esNotaCredito: true,
        facturaAsociada: { tipoComprobante: 'C', puntoVenta: 1, numero: 42 },
      }),
    ).toString('latin1')

    expect(pdf).toContain('NOTA DE CRÉDITO C')
    expect(pdf).toContain('Comprobante que se anula: C 0001-00000042')
  })
})
