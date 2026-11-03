import { ErrorMercadoPago, type MercadoPagoProvider } from './provider'

/**
 * Proveedor real: API de Suscripciones de Mercado Pago.
 *
 * Se llama directo a `fetch` en vez de usar el SDK oficial, igual que con Meta
 * WhatsApp (`lib/whatsapp/cloud.ts`): el SDK son unos 400 kB para envolver tres
 * endpoints que son un POST, un GET y un PUT con JSON, y el presupuesto de
 * bundle del módulo 12 es de 150 kB (ver D8).
 *
 * **Detalle que hace perder pagos y no se ve en el código:** Mercado Pago
 * responde HTTP 200 con un cuerpo que trae `error` cuando la petición fue
 * rechazada. Si se chequea solo el status, un preapproval que nunca se creó
 * devuelve un id vacío, el `external_reference` no llega nunca y la suscripción
 * queda en PENDING para siempre sin que nadie entienda por qué.
 */

/** Base de la API. Sin barra final, se concatena. */
const BASE = 'https://api.mercadopago.com'

/**
 * Datos crudos de una respuesta de error.
 *
 * El `cause` es lo que tiene el motivo real: el `message` de arriba es siempre
 * genérico ("invalid_request") y sin el `cause` el error que se muestra al
 * profesional es inaccionable.
 */
type ErrorApi = {
  message?: unknown
  error?: unknown
  cause?: { code?: unknown; description?: unknown }[]
}

/** Extrae el mensaje que se puede mostrar de una respuesta de error. */
function mensajeDeError(cuerpo: unknown, status: number): string {
  if (cuerpo !== null && typeof cuerpo === 'object') {
    const api = cuerpo as ErrorApi
    const causa = api.cause?.find((item) => typeof item.description === 'string')
    const descripcion = causa?.description ?? api.message

    if (typeof descripcion === 'string' && descripcion.length > 0) {
      return descripcion
    }
  }

  return `Mercado Pago respondió ${status}.`
}

/** Convierte la respuesta en el `Date` que espera el modelo. */
function aFecha(valor: unknown): Date | null {
  if (typeof valor !== 'string' || valor.length === 0) return null

  const fecha = new Date(valor)

  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** Formatea una fecha como la quiere Mercado Pago en un query string. */
export function formatearFechaParaMercadoPago(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/, `.${String(fecha.getUTCMilliseconds()).padStart(3, '0')}Z`)
}

export class MercadoPagoRealProvider implements MercadoPagoProvider {
  readonly nombre = 'mercadopago'

  constructor(private readonly accessToken: string) {}

  async crearPreapproval(
    datos: Parameters<MercadoPagoProvider['crearPreapproval']>[0],
  ): Promise<{ id: string; urlCheckout: string }> {
    const respuesta = await this.enviar('POST', '/preapproval', {
      reason: datos.motivo,
      external_reference: datos.externalReference,
      back_url: datos.backUrl,
      notification_url: datos.notificationUrl,
      payer: { email: datos.emailPagador, name: datos.nombrePagador },
      /**
       * `auto_recurring` con `frequency: 1` y `frequency_type: 'months'` es un
       * cobro mensual. El monto va como string con dos decimales: la API lo
       * acepta y evita que un `10000.0000000001` de coma flotante llegue al
       * banco del pagador (ver `importeParaPasarela`).
       */
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: datos.monto,
        currency_id: datos.moneda,
      },
    })

    const cuerpo = respuesta as {
      id?: unknown
      init_point?: unknown
      sandbox_init_point?: unknown
    }

    if (typeof cuerpo.id !== 'string' || cuerpo.id.length === 0) {
      throw new ErrorMercadoPago('Mercado Pago no devolvió el identificador de la suscripción.')
    }

    /**
     * `sandbox_init_point` tiene prioridad.
     *
     * Con credenciales de prueba, Mercado Pago devuelve dos URLs y `init_point`
     * apunta al checkout de producción. Mandar al profesional de desarrollo a la
     * pasarela real para probar es la forma más rápida de cobrar a alguien de
     * verdad por error. La URL que llega al navegador no se loguea: es una
     * sesión de checkout.
     */
    const checkout = cuerpo.sandbox_init_point ?? cuerpo.init_point

    if (typeof checkout !== 'string' || checkout.length === 0) {
      throw new ErrorMercadoPago('Mercado Pago no devolvió la dirección de pago.')
    }

    return { id: cuerpo.id, urlCheckout: checkout }
  }

  async consultarPreapproval(id: string): Promise<{
    id: string
    estado: string
    externalReference: string | null
    monto: number | null
    moneda: string | null
    proximaCobranza: Date | null
    ultimoPago: Date | null
  } | null> {
    const respuesta = await this.enviar('GET', `/preapproval/${encodeURIComponent(id)}`)

    if (respuesta === null) return null

    const cuerpo = respuesta as {
      id?: unknown
      status?: unknown
      external_reference?: unknown
      last_modified?: unknown
      auto_recurring?: { transaction_amount?: unknown; currency_id?: unknown; next_payment_date?: unknown }
    }

    return {
      id: typeof cuerpo.id === 'string' ? cuerpo.id : id,
      estado: typeof cuerpo.status === 'string' ? cuerpo.status : 'unknown',
      externalReference:
        typeof cuerpo.external_reference === 'string' ? cuerpo.external_reference : null,
      monto: aNumeroOpcional(cuerpo.auto_recurring?.transaction_amount),
      moneda:
        typeof cuerpo.auto_recurring?.currency_id === 'string' ? cuerpo.auto_recurring.currency_id : null,
      proximaCobranza: aFecha(cuerpo.auto_recurring?.next_payment_date),
      ultimoPago: aFecha(cuerpo.last_modified),
    }
  }

  /**
   * Consulta un pago.
   *
   * La comisión se suma de `fee_details` filtrando por `fee_payer: 'collector'`:
   * Mercado Pago puede listar comisiones que paga el comprador y sumarlas todas
   * daría un neto menor al real. Si la respuesta trae `net_received_amount`, se
   * usa ese valor y no se recalcula.
   */
  async consultarPago(id: string): Promise<{
    id: string
    estado: string
    estadoDetalle: string | null
    monto: number | null
    moneda: string | null
    pagadoEn: Date | null
    reembolsadoEn: Date | null
    fee: number | null
    neto: number | null
    preapprovalId: string | null
    externalReference: string | null
  } | null> {
    const respuesta = await this.enviar('GET', `/v1/payments/${encodeURIComponent(id)}`)

    if (respuesta === null) return null

    const cuerpo = respuesta as {
      id?: unknown
      status?: unknown
      status_detail?: unknown
      transaction_amount?: unknown
      currency_id?: unknown
      date_approved?: unknown
      date_last_updated?: unknown
      external_reference?: unknown
      preapproval_id?: unknown
      metadata?: { preapproval_id?: unknown }
      fee_details?: unknown
      transaction_details?: { net_received_amount?: unknown }
    }

    const estado = aTexto(cuerpo.status) ?? 'unknown'
    const monto = aNumeroOpcional(cuerpo.transaction_amount)
    const fee = sumarComisiones(cuerpo.fee_details)
    const neto =
      aNumeroOpcional(cuerpo.transaction_details?.net_received_amount) ??
      (monto !== null && fee !== null ? monto - fee : null)

    return {
      id: aTexto(cuerpo.id) ?? id,
      estado,
      estadoDetalle: aTexto(cuerpo.status_detail),
      monto,
      moneda: aTexto(cuerpo.currency_id),
      pagadoEn: aFecha(cuerpo.date_approved),
      reembolsadoEn:
        estado === 'refunded' || estado === 'charged_back'
          ? aFecha(cuerpo.date_last_updated)
          : null,
      fee,
      neto,
      preapprovalId: aTexto(cuerpo.metadata?.preapproval_id) ?? aTexto(cuerpo.preapproval_id),
      externalReference: aTexto(cuerpo.external_reference),
    }
  }

  /**
   * Consulta un cobro autorizado.
   *
   * El estado que importa es el del pago (`payment.status`), no el del cobro:
   * un cobro `processed` puede tener un pago `rejected`. Se prefiere el pago y
   * se cae al estado del cobro solo si no vino.
   */
  async consultarPagoAutorizado(id: string): Promise<{
    id: string
    estado: string
    preapprovalId: string | null
    externalReference: string | null
    pagoId: string | null
    monto: number | null
    moneda: string | null
    pagadoEn: Date | null
  } | null> {
    const respuesta = await this.enviar('GET', `/authorized_payments/${encodeURIComponent(id)}`)

    if (respuesta === null) return null

    const cuerpo = respuesta as {
      id?: unknown
      status?: unknown
      preapproval_id?: unknown
      external_reference?: unknown
      payment_id?: unknown
      transaction_amount?: unknown
      currency_id?: unknown
      payment?: {
        id?: unknown
        status?: unknown
        amount?: unknown
        currency_id?: unknown
        date_approved?: unknown
      }
    }

    return {
      id: aTexto(cuerpo.id) ?? id,
      estado: aTexto(cuerpo.payment?.status) ?? aTexto(cuerpo.status) ?? 'unknown',
      preapprovalId: aTexto(cuerpo.preapproval_id),
      externalReference: aTexto(cuerpo.external_reference),
      pagoId: aTexto(cuerpo.payment?.id) ?? aTexto(cuerpo.payment_id),
      monto: aNumeroOpcional(cuerpo.payment?.amount) ?? aNumeroOpcional(cuerpo.transaction_amount),
      moneda: aTexto(cuerpo.payment?.currency_id) ?? aTexto(cuerpo.currency_id),
      pagadoEn: aFecha(cuerpo.payment?.date_approved),
    }
  }

  async cancelarPreapproval(id: string): Promise<void> {
    await this.enviar('PUT', `/preapproval/${encodeURIComponent(id)}`, { status: 'cancelled' })
  }

  async actualizarPreapproval(id: string, monto: string): Promise<void> {
    await this.enviar('PUT', `/preapproval/${encodeURIComponent(id)}`, {
      auto_recurring: { transaction_amount: monto },
    })
  }

  /**
   * Devuelve un pago.
   *
   * La API responde 201 con el recurso del reembolso. Si el POST falla, se
   * consulta el pago antes de propagar: un timeout después de que el reembolso
   * sí se aplicó es el caso más peligroso de esta operación, porque reintentar a
   * ciegas puede devolver dos veces. Cuando el pago ya figura `refunded`, se
   * trata como éxito.
   */
  async reembolsarPago(id: string, monto?: number): Promise<{ reembolsadoEn: Date | null }> {
    try {
      const respuesta = await this.enviar(
        'POST',
        `/v1/payments/${encodeURIComponent(id)}/refunds`,
        monto === undefined ? {} : { amount: monto },
      )

      if (respuesta === null) {
        throw new ErrorMercadoPago('Mercado Pago no encontró el pago a reembolsar.')
      }

      const cuerpo = respuesta as { date_created?: unknown }

      return { reembolsadoEn: aFecha(cuerpo.date_created) ?? new Date() }
    } catch (error: unknown) {
      const pago = await this.consultarPago(id).catch(() => null)

      if (pago && (pago.estado === 'refunded' || pago.estado === 'charged_back')) {
        return { reembolsadoEn: pago.reembolsadoEn ?? new Date() }
      }

      throw error
    }
  }

  /**
   * Una llamada a la API con el token y la traducción de errores.
   *
   * Devuelve `null` solo en el caso inequívoco de "no existe" (404). Cualquier
   * otro fallo tira `ErrorMercadoPago`, porque un 500 o un corte de red no se
   * pueden convertir en "ese preapproval no está": esa conversión haría que una
   * baja de suscripción se ejecute contra un preapproval que sí existe y que
   * seguiría cobrando.
   */
  private async enviar(metodo: 'GET' | 'POST' | 'PUT', ruta: string, cuerpo?: unknown): Promise<unknown> {
    let respuesta: Response

    try {
      respuesta = await fetch(`${BASE}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          // El reloj del servidor no siempre coincide con el de la pasarela y
          // una respuesta cacheada devolvería un estado viejo.
          'Cache-Control': 'no-store',
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        cache: 'no-store',
      })
    } catch {
      throw new ErrorMercadoPago(
        'No pudimos comunicarnos con Mercado Pago. Probá de nuevo en un momento.',
      )
    }

    if (respuesta.status === 404) return null

    /**
     * El cuerpo se lee una sola vez y se reutiliza: en una respuesta de error
     * hace falta para el mensaje, y en una de éxito para los datos.
     */
    const texto = await respuesta.text()
    let cuerpoRespuesta: unknown = null

    if (texto.length > 0) {
      try {
        cuerpoRespuesta = JSON.parse(texto) as unknown
      } catch {
        cuerpoRespuesta = null
      }
    }

    if (!respuesta.ok) {
      throw new ErrorMercadoPago(mensajeDeError(cuerpoRespuesta, respuesta.status), respuesta.status)
    }

    // 200 con `error` adentro: el caso que hace perder pagos en silencio.
    if (
      cuerpoRespuesta !== null &&
      typeof cuerpoRespuesta === 'object' &&
      'error' in cuerpoRespuesta &&
      !('id' in cuerpoRespuesta)
    ) {
      throw new ErrorMercadoPago(
        mensajeDeError(cuerpoRespuesta, respuesta.status),
        respuesta.status,
      )
    }

    return cuerpoRespuesta
  }
}

/** Número o `null`, sin inventar ceros. */
function aNumeroOpcional(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim().length > 0) {
    const parseado = Number(valor)
    return Number.isFinite(parseado) ? parseado : null
  }

  return null
}

/** Texto o `null`, sin convertir números ni objetos. */
function aTexto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.length > 0) return valor
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)

  return null
}

/**
 * Suma las comisiones que paga el vendedor.
 *
 * Si no hay comisiones, devuelve `0` (no `null`): un pago sin comisión existe y
 * el neto tiene que ser el monto completo. `null` se reserva para "la respuesta
 * no traía el dato", que es distinto.
 */
function sumarComisiones(detalle: unknown): number | null {
  if (!Array.isArray(detalle)) return null

  let total = 0
  let encontro = false

  for (const item of detalle) {
    if (item === null || typeof item !== 'object') continue

    const comision = item as { amount?: unknown; fee_payer?: unknown }
    const pagador = aTexto(comision.fee_payer)

    if (pagador !== null && pagador !== 'collector') continue

    const monto = aNumeroOpcional(comision.amount)

    if (monto === null) continue

    total += monto
    encontro = true
  }

  return encontro ? total : 0
}