import type { CondicionIva } from '@prisma/client'

import { formatArs } from '@/lib/dinero'

import type { TipoComprobanteLetra } from './provider'

/**
 * Generador de PDF sin dependencias.
 *
 * No se usa una librería de PDF por dos razones: son varios megabytes en el
 * bundle del servidor y la mayoría requiere binarios nativos. Un comprobante es
 * texto sobre A4; con PDF 1.4 y las fuentes estándar (Helvetica) alcanza y
 * corre igual en Vercel.
 *
 * Las fuentes estándar usan WinAnsiEncoding, que cubre acentos y `ñ`. Todo lo
 * que quede fuera de Latin-1 se reemplaza por `ñ` en vez de romper el archivo.
 */

export type DatosPdfComprobante = {
  tipoComprobante: TipoComprobanteLetra
  esNotaCredito?: boolean
  puntoVenta: number
  numero: number
  fecha: Date
  cae: string
  caeVence: Date
  neto: number
  iva: number
  total: number
  descripcion: string
  emisor: {
    nombre: string
    cuit: string
    condicionIva: string
  }
  receptor: {
    nombre: string
    documento: string | null
    condicionIva: CondicionIva | null
  }
  facturaAsociada?: {
    tipoComprobante: TipoComprobanteLetra
    puntoVenta: number
    numero: number
  }
}

const CONDICIONES: Record<CondicionIva, string> = {
  RESPONSABLE_INSCRIPTO: 'IVA Responsable Inscripto',
  RESPONSABLE_MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Sujeto Exento',
  LIBERADO: 'IVA Liberado - Ley 19.640',
  CONSUMIDOR_FINAL: 'Consumidor Final',
}

type Linea = { texto: string; tamano: number; negrita: boolean }

function aLatin1(texto: string): string {
  let salida = ''

  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0
    salida += codigo <= 255 ? caracter : '?'
  }

  return salida
}

function escaparPdf(texto: string): string {
  return aLatin1(texto).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function fechaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha)
}

function numeroComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
}

function lineasDelComprobante(datos: DatosPdfComprobante): Linea[] {
  const titulo = `${datos.esNotaCredito ? 'NOTA DE CRÉDITO' : 'FACTURA'} ${datos.tipoComprobante}`
  const documento = datos.receptor.documento
    ? `Documento: ${datos.receptor.documento}`
    : 'Documento: sin identificar'
  const condicion = datos.receptor.condicionIva
    ? CONDICIONES[datos.receptor.condicionIva]
    : CONDICIONES.CONSUMIDOR_FINAL

  const lineas: Linea[] = [
    { texto: titulo, tamano: 22, negrita: true },
    { texto: datos.emisor.nombre, tamano: 12, negrita: true },
    { texto: `CUIT: ${datos.emisor.cuit}`, tamano: 10, negrita: false },
    { texto: datos.emisor.condicionIva, tamano: 10, negrita: false },
    { texto: '', tamano: 8, negrita: false },
    { texto: `Comprobante N° ${numeroComprobante(datos.puntoVenta, datos.numero)}`, tamano: 11, negrita: true },
    { texto: `Fecha: ${fechaCorta(datos.fecha)}`, tamano: 10, negrita: false },
    { texto: '', tamano: 8, negrita: false },
    { texto: 'RECEPTOR', tamano: 9, negrita: true },
    { texto: datos.receptor.nombre, tamano: 11, negrita: false },
    { texto: documento, tamano: 10, negrita: false },
    { texto: `Condición: ${condicion}`, tamano: 10, negrita: false },
    { texto: '', tamano: 8, negrita: false },
    { texto: 'DETALLE', tamano: 9, negrita: true },
    { texto: datos.descripcion, tamano: 10, negrita: false },
    { texto: '', tamano: 8, negrita: false },
    { texto: `Neto: ${formatArs(datos.neto, { conDecimales: true })}`, tamano: 10, negrita: false },
    { texto: `IVA: ${formatArs(datos.iva, { conDecimales: true })}`, tamano: 10, negrita: false },
    { texto: `TOTAL: ${formatArs(datos.total, { conDecimales: true })}`, tamano: 13, negrita: true },
    { texto: '', tamano: 8, negrita: false },
    { texto: `CAE: ${datos.cae}`, tamano: 10, negrita: true },
    { texto: `Vencimiento del CAE: ${fechaCorta(datos.caeVence)}`, tamano: 10, negrita: false },
  ]

  if (datos.facturaAsociada) {
    lineas.push({
      texto:
        'Comprobante que se anula: ' +
        `${datos.facturaAsociada.tipoComprobante} ` +
        numeroComprobante(datos.facturaAsociada.puntoVenta, datos.facturaAsociada.numero),
      tamano: 9,
      negrita: false,
    })
  }

  lineas.push(
    { texto: '', tamano: 8, negrita: false },
    {
      texto: 'Comprobante generado electrónicamente. Válido sin firma ni sello.',
      tamano: 8,
      negrita: false,
    },
  )

  return lineas
}

function construirContenido(lineas: readonly Linea[]): string {
  const comandos: string[] = ['BT']
  let y = 800

  for (const linea of lineas) {
    comandos.push(`/${linea.negrita ? 'F2' : 'F1'} ${linea.tamano} Tf`)
    comandos.push(`1 0 0 1 50 ${y} Tm`)
    comandos.push(`(${escaparPdf(linea.texto)}) Tj`)
    y -= linea.tamano + 8
  }

  comandos.push('ET')

  return comandos.join('\n')
}

/** Genera el PDF de un comprobante autorizado. */
export function generarPdfComprobante(datos: DatosPdfComprobante): Uint8Array {
  const contenido = construirContenido(lineasDelComprobante(datos))

  const objetos: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3:
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    4: `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    6: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  }

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []

  for (let numero = 1; numero <= 6; numero += 1) {
    offsets[numero] = pdf.length
    pdf += `${numero} 0 obj\n${objetos[numero]}\nendobj\n`
  }

  const inicioXref = pdf.length

  pdf += 'xref\n0 7\n0000000000 65535 f \n'

  for (let numero = 1; numero <= 6; numero += 1) {
    pdf += `${String(offsets[numero]).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}
