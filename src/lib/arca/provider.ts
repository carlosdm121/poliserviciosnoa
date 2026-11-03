import type { CondicionIva } from '@prisma/client'

/**
 * Contrato del proveedor de facturación electrónica.
 *
 * Todo lo que el resto del sistema sabe de ARCA pasa por acá. El día que se
 * cambie Afip SDK por TusFacturas u otro, se escribe otra implementación y
 * nada más cambia. Es el mismo patrón que `src/lib/mp` (D27).
 */

/** Letra del comprobante. Coincide con el enum `TipoComprobante` de Prisma. */
export type TipoComprobanteLetra = 'A' | 'B' | 'C'

/**
 * Error de facturación.
 *
 * `reintentable` decide si la cola vuelve a intentar o si la factura queda para
 * revisión manual. Un timeout o un 500 se reintentan; una credencial inválida o
 * un CUIT mal configurado no: reintentar mil veces un error de configuración
 * solo llena la base de intentos.
 */
export class ErrorFacturacion extends Error {
  readonly codigo?: string
  readonly reintentable: boolean

  constructor(message: string, opciones?: { codigo?: string; reintentable?: boolean }) {
    super(message)
    this.name = 'ErrorFacturacion'
    this.codigo = opciones?.codigo
    this.reintentable = opciones?.reintentable ?? true
  }
}

/** Datos del receptor que van al comprobante. */
export type ReceptorComprobante = {
  nombre: string
  /** CUIT/CUIL/DNI sin guiones. `null` = consumidor final sin identificar. */
  documento: string | null
  condicionIva: CondicionIva | null
}

/** Todo lo que necesita un comprobante para emitirse. */
export type DatosComprobante = {
  /** Referencia interna (id del pago). El mock la usa para idempotencia. */
  referencia: string
  fecha: Date
  tipoComprobante: TipoComprobanteLetra
  puntoVenta: number
  /**
   * Número reservado por el servicio ANTES de llamar al proveedor.
   * Si el proceso muere después de que ARCA autorizó, el reintento reusa este
   * número en vez de pedir uno nuevo y duplicar el comprobante.
   */
  numero: number
  neto: number
  iva: number
  total: number
  descripcion: string
  receptor: ReceptorComprobante
}

/** Comprobante autorizado por ARCA. */
export type ComprobanteEmitido = {
  numero: number
  puntoVenta: number
  cae: string
  caeVence: Date
}

/** Datos para anular una factura con una nota de crédito. */
export type DatosAnulacion = DatosComprobante & {
  factura: {
    numero: number
    puntoVenta: number
    tipoComprobante: TipoComprobanteLetra
    cae: string
  }
  motivo: string
}

export interface InvoiceProvider {
  /** Nombre corto para logs y para la UI de administración. */
  readonly nombre: string

  /** último número autorizado para un tipo y punto de venta. `0` si no hay. */
  ultimoNumero(
    tipoComprobante: TipoComprobanteLetra,
    puntoVenta: number,
    notaCredito?: boolean,
  ): Promise<number>

  emitirFactura(datos: DatosComprobante): Promise<ComprobanteEmitido>

  /** En ARCA anular es emitir una nota de crédito, no borrar. */
  anularFactura(datos: DatosAnulacion): Promise<ComprobanteEmitido>

  /** URL del PDF del proveedor, si lo ofrece. `null` cuando lo generamos nosotros. */
  obtenerPdf(referencia: { numero: number; puntoVenta: number; tipoComprobante: TipoComprobanteLetra }): Promise<string | null>
}
