import type { CondicionIva } from '@prisma/client'

import type { TipoComprobanteLetra } from './provider'

/**
 * Reglas de traducción entre nuestro modelo y ARCA.
 *
 * Son funciones puras y viven fuera de los proveedores porque las usan los
 * tres: el mock, Afip SDK y los tests. Tenerlas en un solo lugar evita que el
 * mock "facture" distinto que el proveedor real y que los tests verdes no
 * prueben nada.
 */

/** Redondeo monetario a dos decimales, sin sorpresas de punto flotante. */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Desglosa el total en neto e IVA.
 *
 * Factura C (monotributo) no discrimina IVA: el neto es el total. Para A y B el
 * precio que paga el profesional es el total con IVA incluido, así que el neto
 * se calcula hacia atrás. La suma de neto e IVA siempre da el total exacto; el
 * redondeo se aplica al neto y el IVA absorbe la diferencia.
 */
export function desglosarImporte(
  total: number,
  tipoComprobante: TipoComprobanteLetra,
  alicuotaIva: number,
): { neto: number; iva: number } {
  if (tipoComprobante === 'C' || alicuotaIva <= 0) {
    return { neto: redondear2(total), iva: 0 }
  }

  const neto = redondear2(total / (1 + alicuotaIva / 100))

  return { neto, iva: redondear2(total - neto) }
}

/** Id de alícuota de IVA que espera ARCA en el detalle del comprobante. */
export function idAlicuotaIva(alicuota: number): number {
  if (alicuota === 10.5) return 4
  if (alicuota === 27) return 6
  return 5
}

/** Código numérico de comprobante de ARCA. */
export function codigoComprobante(tipo: TipoComprobanteLetra, notaCredito = false): number {
  const codigos = notaCredito
    ? ({ A: 3, B: 8, C: 13 } as const)
    : ({ A: 1, B: 6, C: 11 } as const)

  return codigos[tipo]
}

/**
 * `CondicionIVAReceptorId` de ARCA.
 *
 * Cuando no hay dato fiscal se asume Consumidor Final (5), que es lo que
 * corresponde a una venta a alguien que no se identificó. No se inventa un
 * responsable inscripto.
 */
export function condicionIvaReceptorId(condicion: CondicionIva | null): number {
  const ids: Record<CondicionIva, number> = {
    RESPONSABLE_INSCRIPTO: 1,
    RESPONSABLE_MONOTRIBUTO: 6,
    EXENTO: 4,
    LIBERADO: 10,
    CONSUMIDOR_FINAL: 5,
  }

  return condicion ? ids[condicion] : 5
}

/** Etiqueta legible de una condición frente al IVA, para el PDF. */
export function etiquetaCondicionIva(condicion: string): string {
  const etiquetas: Record<string, string> = {
    RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
    RESPONSABLE_MONOTRIBUTO: 'Responsable Monotributo',
    EXENTO: 'IVA Sujeto Exento',
    LIBERADO: 'IVA Liberado - Ley 19.640',
    CONSUMIDOR_FINAL: 'Consumidor Final',
  }

  return etiquetas[condicion] ?? condicion
}

/**
 * Tipo y número de documento del receptor.
 *
 * 80 = CUIT, 96 = DNI, 99 = sin identificar. Un documento de 11 dígitos se
 * manda como CUIT aunque sea un CUIL: ARCA acepta los dos con el mismo tipo.
 */
export function documentoReceptor(documento: string | null): {
  docTipo: number
  docNro: number
} {
  const digitos = (documento ?? '').replace(/\D/g, '')

  if (digitos.length === 11) return { docTipo: 80, docNro: Number(digitos) }
  if (digitos.length === 7 || digitos.length === 8) return { docTipo: 96, docNro: Number(digitos) }

  return { docTipo: 99, docNro: 0 }
}

/**
 * Espera antes del siguiente intento, en milisegundos.
 *
 * Backoff exponencial con techo: 1 min, 5 min, 15 min, 1 h, 6 h y después
 * cada 24 h. La primera espera es corta porque la mayoría de los fallos son un
 * timeout puntual; las siguientes se estiran para no golpear un servicio caído.
 */
export function esperaBackoff(intentos: number): number {
  const minutos = [1, 5, 15, 60, 360, 1440] as const
  const indice = Math.min(Math.max(intentos - 1, 0), minutos.length - 1)

  return minutos[indice]! * 60_000
}

/** Fecha de ARCA: `YYYYMMDD` en hora de Argentina, no en UTC. */
export function fechaComprobante(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)

  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? ''

  return `${valor('year')}${valor('month')}${valor('day')}`
}

/** Convierte `YYYYMMDD` de ARCA a `Date` (mediodía UTC, sin corrimiento). */
export function fechaDesdeArca(valor: string): Date {
  const anio = Number(valor.slice(0, 4))
  const mes = Number(valor.slice(4, 6))
  const dia = Number(valor.slice(6, 8))

  return new Date(Date.UTC(anio, mes - 1, dia, 12))
}

/**
 * Serializa filas a CSV con separador `;`.
 *
 * Se usa `;` porque el Excel en español usa la coma como separador decimal: un
 * CSV con comas abre con todas las columnas pegadas. Se escapan las comillas y
 * los saltos de línea según RFC 4180.
 */
export function formatearCsv(filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return filas
    .map((fila) => fila.map((celda) => escaparCelda(celda)).join(';'))
    .join('\r\n')
    .concat('\r\n')
}

function escaparCelda(celda: string | number | null | undefined): string {
  if (celda === null || celda === undefined) return ''

  const texto = String(celda)

  if (/[";\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }

  return texto
}

/** Importe para el CSV: `1234,56`, sin separador de miles. */
export function importeCsv(valor: number): string {
  return redondear2(valor).toFixed(2).replace('.', ',')
}

/**
 * Rango UTC que cubre un mes calendario en Argentina (UTC-3).
 *
 * Se usa el huso argentino y no UTC para que un pago de las 22:30 del último
 * día del mes caiga en el mes que el contador espera. En UTC ya sería el mes
 * siguiente y el reporte no cerraría.
 */
export function rangoDelMes(anio: number, mes: number): { inicio: Date; fin: Date } {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1, 3))
  const fin = new Date(Date.UTC(mes === 12 ? anio + 1 : anio, mes % 12, 1, 3))

  return { inicio, fin }
}
