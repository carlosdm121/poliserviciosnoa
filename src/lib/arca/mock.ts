import {
  ErrorFacturacion,
  type ComprobanteEmitido,
  type DatosAnulacion,
  type DatosComprobante,
  type InvoiceProvider,
  type TipoComprobanteLetra,
} from './provider'

/**
 * Proveedor de facturación simulado.
 *
 * Igual que el mock de Mercado Pago (D27): fuera de producción el valor por
 * defecto es este y no toca la red. Emite CAE inventados, pero respeta la
 * secuencia de numeración y la idempotencia por referencia, que es lo que los
 * tests necesitan verificar.
 *
 * El estado vive en `globalThis` porque en serverless cada request puede caer
 * en una instancia distinta; un Map de módulo se perdería entre llamadas y la
 * numeración arrancaría de cero todo el tiempo.
 */

type EstadoMock = {
  numeros: Map<string, number>
  numerosNotaCredito: Map<string, number>
  emitidos: Map<string, ComprobanteEmitido>
  notas: Map<string, ComprobanteEmitido>
  fallar: boolean
  llamadas: number
}

const CLAVE = '__poliserviciosArcaMock'

const global = globalThis as typeof globalThis & { [CLAVE]?: EstadoMock }

function estado(): EstadoMock {
  global[CLAVE] ??= {
    numeros: new Map(),
    numerosNotaCredito: new Map(),
    emitidos: new Map(),
    notas: new Map(),
    fallar: false,
    llamadas: 0,
  }

  return global[CLAVE]
}

function claveSecuencia(tipo: TipoComprobanteLetra, puntoVenta: number): string {
  return `${tipo}:${puntoVenta}`
}

/** Deja el mock como recién arrancado. Solo para tests y scripts. */
export function resetMockArca(): void {
  const actual = estado()
  actual.numeros.clear()
  actual.numerosNotaCredito.clear()
  actual.emitidos.clear()
  actual.notas.clear()
  actual.fallar = false
  actual.llamadas = 0
}

/** Hace que la próxima emisión falle, para probar reintentos. */
export function fallarEmisionMock(falla: boolean): void {
  estado().fallar = falla
}

/** Cantidad de emisiones efectivas (facturas + notas de crédito). */
export function llamadasMock(): number {
  return estado().llamadas
}

function caeDe(prefijo: number, numero: number): string {
  return String(prefijo + numero)
}

function vencimiento(fecha: Date): Date {
  return new Date(fecha.getTime() + 10 * 24 * 60 * 60 * 1000)
}

export const facturacionMock: InvoiceProvider = {
  nombre: 'mock',

  async ultimoNumero(
    tipoComprobante: TipoComprobanteLetra,
    puntoVenta: number,
    notaCredito = false,
  ): Promise<number> {
    const numeros = notaCredito ? estado().numerosNotaCredito : estado().numeros
    return numeros.get(claveSecuencia(tipoComprobante, puntoVenta)) ?? 0
  },

  async emitirFactura(datos: DatosComprobante): Promise<ComprobanteEmitido> {
    const actual = estado()

    if (actual.fallar) {
      throw new ErrorFacturacion('Fallo simulado del proveedor de facturación', {
        codigo: 'MOCK',
        reintentable: true,
      })
    }

    const yaEmitida = actual.emitidos.get(datos.referencia)

    // Mismo criterio que ARCA: repetir el mismo número con el mismo comprobante
    // devuelve el que ya existe, no emite otro.
    if (yaEmitida && yaEmitida.numero === datos.numero) {
      return yaEmitida
    }

    const clave = claveSecuencia(datos.tipoComprobante, datos.puntoVenta)
    const ultimo = actual.numeros.get(clave) ?? 0

    if (datos.numero !== ultimo + 1) {
      throw new ErrorFacturacion(
        `Número fuera de secuencia: se intentó emitir ${datos.numero} y el último es ${ultimo}`,
        { codigo: 'SECUENCIA', reintentable: false },
      )
    }

    const emitida: ComprobanteEmitido = {
      numero: datos.numero,
      puntoVenta: datos.puntoVenta,
      cae: caeDe(70000000000000, datos.numero),
      caeVence: vencimiento(datos.fecha),
    }

    actual.numeros.set(clave, datos.numero)
    actual.emitidos.set(datos.referencia, emitida)
    actual.llamadas += 1

    return emitida
  },

  async anularFactura(datos: DatosAnulacion): Promise<ComprobanteEmitido> {
    const actual = estado()

    if (actual.fallar) {
      throw new ErrorFacturacion('Fallo simulado del proveedor de facturación', {
        codigo: 'MOCK',
        reintentable: true,
      })
    }

    const yaEmitida = actual.notas.get(datos.referencia)

    if (yaEmitida && yaEmitida.numero === datos.numero) {
      return yaEmitida
    }

    const clave = claveSecuencia(datos.tipoComprobante, datos.puntoVenta)
    const ultimo = actual.numerosNotaCredito.get(clave) ?? 0

    if (datos.numero !== ultimo + 1) {
      throw new ErrorFacturacion(
        `Nota de crédito fuera de secuencia: se intentó emitir ${datos.numero} y el último es ${ultimo}`,
        { codigo: 'SECUENCIA', reintentable: false },
      )
    }

    const emitida: ComprobanteEmitido = {
      numero: datos.numero,
      puntoVenta: datos.puntoVenta,
      cae: caeDe(80000000000000, datos.numero),
      caeVence: vencimiento(datos.fecha),
    }

    actual.numerosNotaCredito.set(clave, datos.numero)
    actual.notas.set(datos.referencia, emitida)
    actual.llamadas += 1

    return emitida
  },

  async obtenerPdf(): Promise<string | null> {
    return null
  },
}
