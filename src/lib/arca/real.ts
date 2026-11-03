import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

import {
  codigoComprobante,
  condicionIvaReceptorId,
  documentoReceptor,
  fechaComprobante,
  fechaDesdeArca,
  idAlicuotaIva,
  redondear2,
} from './calculos'
import {
  ErrorFacturacion,
  type ComprobanteEmitido,
  type DatosAnulacion,
  type DatosComprobante,
  type InvoiceProvider,
  type TipoComprobanteLetra,
} from './provider'

/**
 * Proveedor real: Afip SDK (https://afipsdk.com).
 *
 * Afip SDK resuelve lo caro de ARCA: el WSAA y el Ticket de Acceso. Nosotros
 * pedimos el TA a `/afip/auth` en cada operación (el SDK lo cachea y lo renueva
 * solo) y después llamamos al método del web service por `/afip/requests`.
 *
 * No se usa el paquete npm de Afip SDK a propósito: son tres llamadas HTTP y así
 * el bundle del servidor no carga un SDK con dependencias de SOAP. El día que la
 * API cambie, se toca este archivo y nada más.
 */

const TIMEOUT_MS = 15_000

type TicketAcceso = { token: string; sign: string }

type Json = Record<string, unknown>

function esObjeto(valor: unknown): valor is Json {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Busca una clave en cualquier profundidad de la respuesta. */
function buscarClave(valor: unknown, clave: string, profundidad = 0): unknown {
  if (profundidad > 8 || !esObjeto(valor)) return undefined
  if (clave in valor) return valor[clave]

  for (const hijo of Object.values(valor)) {
    const encontrado = buscarClave(hijo, clave, profundidad + 1)
    if (encontrado !== undefined) return encontrado
  }

  return undefined
}

/** Desenvuelve `{ data: ... }` si la API lo agrega. */
function desenvolver(body: unknown): unknown {
  if (esObjeto(body) && 'data' in body) return body.data
  return body
}

async function leerJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function mensajeDe(body: unknown, respaldo: string): string {
  const err = buscarClave(body, 'Err')

  if (Array.isArray(err) && esObjeto(err[0]) && typeof err[0].Msg === 'string') {
    return err[0].Msg
  }

  if (esObjeto(err) && typeof err.Msg === 'string') return err.Msg

  const observacion = buscarClave(body, 'Obs')

  if (Array.isArray(observacion) && esObjeto(observacion[0]) && typeof observacion[0].Msg === 'string') {
    return observacion[0].Msg
  }

  return respaldo
}

async function pedirTicket(): Promise<TicketAcceso> {
  const response = await fetch(`${env.arca.apiUrl}/afip/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.arca.accessToken}`,
    },
    body: JSON.stringify({
      environment: env.arca.environment,
      tax_id: env.arca.cuit.replace(/\D/g, ''),
      wsid: 'wsfe',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const body = await leerJson(response)

  if (!response.ok) {
    throw new ErrorFacturacion(
      `Afip SDK rechazó la autenticación (${response.status}): ${mensajeDe(body, response.statusText)}`,
      {
        codigo: 'AUTH',
        // Un 401 es credencial o CUIT mal configurado: reintentar no arregla nada.
        reintentable: response.status >= 500 || response.status === 429,
      },
    )
  }

  if (esObjeto(body) && typeof body.token === 'string' && typeof body.sign === 'string') {
    return { token: body.token, sign: body.sign }
  }

  throw new ErrorFacturacion('Afip SDK devolvió una autenticación sin token ni firma', {
    codigo: 'AUTH',
  })
}

async function llamarWebService(method: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${env.arca.apiUrl}/afip/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.arca.accessToken}`,
    },
    body: JSON.stringify({
      environment: env.arca.environment,
      method,
      wsid: 'wsfe',
      params,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const body = await leerJson(response)

  if (!response.ok) {
    throw new ErrorFacturacion(
      `Afip SDK devolvió ${response.status} en ${method}: ${mensajeDe(body, response.statusText)}`,
      {
        codigo: String(response.status),
        reintentable: response.status >= 500 || response.status === 429,
      },
    )
  }

  return desenvolver(body)
}

function auth(ticket: TicketAcceso): Record<string, unknown> {
  return {
    Token: ticket.token,
    Sign: ticket.sign,
    Cuit: env.arca.cuit.replace(/\D/g, ''),
  }
}

/** Detalle del comprobante autorizado dentro de la respuesta de ARCA. */
function extraerDetalle(body: unknown): Json | null {
  const detalle = buscarClave(body, 'FECAEDetResponse') ?? buscarClave(body, 'FECAEDetResp')
  const primero = Array.isArray(detalle) ? detalle[0] : detalle

  return esObjeto(primero) ? primero : null
}

function comprobanteDesde(detalle: Json, numero: number, puntoVenta: number): ComprobanteEmitido {
  const resultado = typeof detalle.Resultado === 'string' ? detalle.Resultado : ''
  const cae = typeof detalle.CAE === 'string' ? detalle.CAE : ''
  const vencimiento = typeof detalle.CAEFchVto === 'string' ? detalle.CAEFchVto : ''

  if (resultado === 'R' || cae === '') {
    throw new ErrorFacturacion(
      mensajeDe(detalle, 'ARCA rechazó el comprobante sin decir por qué'),
      { codigo: 'RECHAZADO', reintentable: false },
    )
  }

  if (vencimiento.length !== 8) {
    throw new ErrorFacturacion('ARCA autorizó el comprobante sin vencimiento de CAE', {
      codigo: 'CAE',
    })
  }

  return {
    numero,
    puntoVenta,
    cae,
    caeVence: fechaDesdeArca(vencimiento),
  }
}

/** Detecta el caso "ya lo emitió y me quedó sin guardar la respuesta". */
function pareceDuplicado(mensaje: string): boolean {
  const normalizado = mensaje.toLowerCase()

  return normalizado.includes('ya existe') || normalizado.includes('ya fue autorizado')
}

async function consultarComprobante(
  ticket: TicketAcceso,
  tipoComprobante: TipoComprobanteLetra,
  puntoVenta: number,
  numero: number,
): Promise<ComprobanteEmitido | null> {
  const body = await llamarWebService('FECompConsultar', {
    Auth: auth(ticket),
    FeCompConsReq: {
      CbteTipo: codigoComprobante(tipoComprobante),
      CbteNro: numero,
      PtoVta: puntoVenta,
    },
  })

  const cae = buscarClave(body, 'CodAutorizacion') ?? buscarClave(body, 'CAE')
  const vencimiento = buscarClave(body, 'FchVto') ?? buscarClave(body, 'CAEFchVto')

  if (typeof cae !== 'string' || typeof vencimiento !== 'string' || vencimiento.length !== 8) {
    return null
  }

  return { numero, puntoVenta, cae, caeVence: fechaDesdeArca(vencimiento) }
}

function importe(valor: number): number {
  return redondear2(valor)
}

function detalleFactura(datos: DatosComprobante): Record<string, unknown> {
  const documento = documentoReceptor(datos.receptor.documento)

  const detalle: Record<string, unknown> = {
    Concepto: 2, // Servicios
    DocTipo: documento.docTipo,
    DocNro: documento.docNro,
    CbteDesde: datos.numero,
    CbteHasta: datos.numero,
    CbteFch: fechaComprobante(datos.fecha),
    ImpTotal: importe(datos.total),
    ImpNeto: importe(datos.neto),
    ImpIVA: importe(datos.iva),
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: condicionIvaReceptorId(datos.receptor.condicionIva),
  }

  // En factura C el IVA no se discrimina y ARCA rechaza el array si se manda.
  if (datos.tipoComprobante !== 'C' && datos.iva > 0) {
    detalle.Iva = {
      Alicuota: [
        {
          Id: idAlicuotaIva(env.arca.alicuotaIva),
          BaseImp: importe(datos.neto),
          Importe: importe(datos.iva),
        },
      ],
    }
  }

  return detalle
}

export const facturacionAfipSdk: InvoiceProvider = {
  nombre: 'afip-sdk',

  async ultimoNumero(
    tipoComprobante: TipoComprobanteLetra,
    puntoVenta: number,
    notaCredito = false,
  ): Promise<number> {
    const ticket = await pedirTicket()

    const body = await llamarWebService('FECompUltimoAutorizado', {
      Auth: auth(ticket),
      PtoVta: puntoVenta,
      CbteTipo: codigoComprobante(tipoComprobante, notaCredito),
    })

    const numero = buscarClave(body, 'CbteNro')

    return typeof numero === 'number' ? numero : Number(numero ?? 0) || 0
  },

  async emitirFactura(datos: DatosComprobante): Promise<ComprobanteEmitido> {
    const ticket = await pedirTicket()

    const body = await llamarWebService('FECAESolicitar', {
      Auth: auth(ticket),
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: datos.puntoVenta,
          CbteTipo: codigoComprobante(datos.tipoComprobante),
        },
        FeDetReq: {
          FECAEDetRequest: detalleFactura(datos),
        },
      },
    })

    const detalle = extraerDetalle(body)

    if (!detalle) {
      throw new ErrorFacturacion('ARCA no devolvió el detalle del comprobante', { codigo: 'SIN_DETALLE' })
    }

    const mensaje = mensajeDe(detalle, '')
    const resultado = typeof detalle.Resultado === 'string' ? detalle.Resultado : ''

    if (resultado === 'R' && pareceDuplicado(mensaje)) {
      logger.warn('arca: el comprobante ya existía, se recupera el CAE', {
        numero: datos.numero,
        puntoVenta: datos.puntoVenta,
      })

      const existente = await consultarComprobante(
        ticket,
        datos.tipoComprobante,
        datos.puntoVenta,
        datos.numero,
      )

      if (existente) return existente
    }

    return comprobanteDesde(detalle, datos.numero, datos.puntoVenta)
  },

  async anularFactura(datos: DatosAnulacion): Promise<ComprobanteEmitido> {
    const ticket = await pedirTicket()
    const tipoNota = datos.tipoComprobante

    const body = await llamarWebService('FECAESolicitar', {
      Auth: auth(ticket),
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: datos.puntoVenta,
          CbteTipo: codigoComprobante(tipoNota, true),
        },
        FeDetReq: {
          FECAEDetRequest: {
            ...detalleFactura(datos),
            CbtesAsoc: {
              CbteAsoc: [
                {
                  Tipo: codigoComprobante(datos.factura.tipoComprobante),
                  PtoVta: datos.factura.puntoVenta,
                  Nro: datos.factura.numero,
                  Cuit: env.arca.cuit.replace(/\D/g, ''),
                },
              ],
            },
          },
        },
      },
    })

    const detalle = extraerDetalle(body)

    if (!detalle) {
      throw new ErrorFacturacion('ARCA no devolvió el detalle de la nota de crédito', {
        codigo: 'SIN_DETALLE',
      })
    }

    return comprobanteDesde(detalle, datos.numero, datos.puntoVenta)
  },

  async obtenerPdf(): Promise<string | null> {
    // El PDF lo genera el sitio (src/lib/arca/pdf.ts). El servicio de PDF de
    // Afip SDK es un producto aparte, con costo propio.
    return null
  },
}
