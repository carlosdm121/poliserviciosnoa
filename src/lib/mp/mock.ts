import {
  ErrorMercadoPago,
  type DatosPreapproval,
  type MercadoPagoProvider,
  type PagoAutorizadoConsultado,
  type PagoConsultado,
  type PreapprovalCreado,
  type PreapprovalConsultado,
} from './provider'

/**
 * Proveedor de mentira.
 *
 * Existe por el mismo motivo que el de WhatsApp y el de Cloudinary: sin él, ni
 * el desarrollo local ni el script de verificación pueden probar el flujo de
 * alta sin una cuenta de Mercado Pago, y el módulo quedaría sin verificar
 * hasta que alguien con credenciales reales lo pruebe a mano.
 *
 * **Simula lo que importa y nada más.** Un preapproval arranca `pending` y solo
 * pasa a `authorized` cuando alguien llama a `autorizarPreapprovalMock` o a
 * `setearEstadoMock`. No hay atajos tipo "suscribirse y listo": si el mock
 * activara la suscripción por su cuenta, el desarrollo probaría un camino que
 * en producción no existe y el bug se descubriría el día del primer cobro real.
 * El camino real es el webhook, que es el módulo 2.4.
 */

/** Lo que guarda el mock por preapproval. */
type PreapprovalGuardado = {
  id: string
  motivo: string
  externalReference: string
  estado: string
  monto: number
  moneda: string
  proximaCobranza: Date | null
  ultimoPago: Date | null
}

/**
 * Estado del mock.
 *
 * Sobre `globalThis` por el mismo motivo que los otros dos mocks: la creación
 * del preapproval y la consulta posterior son requests distintos, y en un
 * entorno serverless cada uno corre en una instancia distinta. Sin el global, el
 * webhook no encontraría nunca lo que se creó antes.
 */
/** Lo que guarda el mock por pago. */
type PagoGuardado = {
  id: string
  preapprovalId: string | null
  externalReference: string | null
  estado: string
  monto: number
  moneda: string
  fee: number
  neto: number | null
  pagadoEn: Date | null
  reembolsadoEn: Date | null
}

/** Lo que guarda el mock por cobro autorizado. */
type PagoAutorizadoGuardado = {
  id: string
  pagoId: string
  preapprovalId: string | null
  externalReference: string | null
}

const globalMock = globalThis as unknown as {
  __mockMp?: Map<string, PreapprovalGuardado>
  __mockMpPagos?: Map<string, PagoGuardado>
  __mockMpAutorizados?: Map<string, PagoAutorizadoGuardado>
  __mockMpSecuencia?: number
}

const mockPreapprovals: Map<string, PreapprovalGuardado> =
  globalMock.__mockMp ?? (globalMock.__mockMp = new Map())

const mockPagos: Map<string, PagoGuardado> =
  globalMock.__mockMpPagos ?? (globalMock.__mockMpPagos = new Map())

const mockAutorizados: Map<string, PagoAutorizadoGuardado> =
  globalMock.__mockMpAutorizados ?? (globalMock.__mockMpAutorizados = new Map())

/** Secuencia aparte para que el id sea único aunque se reinicie el Map. */
function siguienteSecuencia(): number {
  globalMock.__mockMpSecuencia = (globalMock.__mockMpSecuencia ?? 0) + 1
  return globalMock.__mockMpSecuencia
}

export class MercadoPagoMockProvider implements MercadoPagoProvider {
  readonly nombre = 'mock'

  async crearPreapproval(datos: DatosPreapproval): Promise<PreapprovalCreado> {
    const id = `mock-preapproval-${siguienteSecuencia()}`

    const monto = Number(datos.monto)

    if (!Number.isFinite(monto) || monto <= 0) {
      throw new ErrorMercadoPago('El monto del plan no es válido.')
    }

    mockPreapprovals.set(id, {
      id,
      motivo: datos.motivo,
      externalReference: datos.externalReference,
      estado: 'pending',
      monto,
      moneda: datos.moneda,
      proximaCobranza: null,
      ultimoPago: null,
    })

    return {
      id,
      urlCheckout: `https://www.mercadopago.com.ar/subscriptions/checkout?preapprovalId=${id}`,
    }
  }

  async consultarPreapproval(id: string): Promise<PreapprovalConsultado | null> {
    const guardado = mockPreapprovals.get(id)

    if (!guardado) return null

    return {
      id: guardado.id,
      estado: guardado.estado,
      externalReference: guardado.externalReference,
      monto: guardado.monto,
      moneda: guardado.moneda,
      proximaCobranza: guardado.proximaCobranza,
      ultimoPago: guardado.ultimoPago,
    }
  }

  async consultarPago(id: string): Promise<PagoConsultado | null> {
    const guardado = mockPagos.get(id)

    if (!guardado) return null

    return {
      id: guardado.id,
      estado: guardado.estado,
      estadoDetalle: null,
      monto: guardado.monto,
      moneda: guardado.moneda,
      pagadoEn: guardado.pagadoEn,
      reembolsadoEn: guardado.reembolsadoEn,
      fee: guardado.fee,
      neto: guardado.neto,
      preapprovalId: guardado.preapprovalId,
      externalReference: guardado.externalReference,
    }
  }

  async consultarPagoAutorizado(id: string): Promise<PagoAutorizadoConsultado | null> {
    const guardado = mockAutorizados.get(id)

    if (!guardado) return null

    const pago = mockPagos.get(guardado.pagoId)

    return {
      id: guardado.id,
      estado: pago?.estado ?? 'scheduled',
      preapprovalId: guardado.preapprovalId,
      externalReference: guardado.externalReference,
      pagoId: guardado.pagoId,
      monto: pago?.monto ?? null,
      moneda: pago?.moneda ?? null,
      pagadoEn: pago?.pagadoEn ?? null,
    }
  }

  /**
   * Cancelar en el mock es idempotente, igual que en el real.
   *
   * Cancelar un preapproval que ya estaba cancelado es un no-op silencioso: en
   * el flujo real la pantalla de baja se puede apretar dos veces y no puede
   * quedar una suscripción en un estado intermedio raro.
   */
  async cancelarPreapproval(id: string): Promise<void> {
    const guardado = mockPreapprovals.get(id)

    if (!guardado) return

    guardado.estado = 'cancelled'
    guardado.proximaCobranza = null
  }

  async actualizarPreapproval(id: string, monto: string): Promise<void> {
    const guardado = mockPreapprovals.get(id)

    if (!guardado) return

    const nuevo = Number(monto)

    if (!Number.isFinite(nuevo) || nuevo <= 0) return

    guardado.monto = nuevo
  }

  /**
   * Reembolso simulado.
   *
   * Repetirlo devuelve la misma fecha en vez de crear otro reembolso. El mock
   * tiene que comportarse como la API real en lo que importa: la segunda llamada
   * no puede terminar en un estado distinto.
   */
  async reembolsarPago(id: string, monto?: number): Promise<{ reembolsadoEn: Date | null }> {
    const guardado = mockPagos.get(id)

    if (!guardado) {
      throw new ErrorMercadoPago('Mercado Pago no encontró el pago a reembolsar.')
    }

    if (monto !== undefined && (monto <= 0 || monto > guardado.monto)) {
      throw new ErrorMercadoPago('El monto del reembolso no es válido.')
    }

    if (guardado.estado === 'refunded') {
      return { reembolsadoEn: guardado.reembolsadoEn }
    }

    guardado.estado = 'refunded'
    guardado.reembolsadoEn = new Date()

    return { reembolsadoEn: guardado.reembolsadoEn }
  }
}

/**
 * Pasa un preapproval a `authorized`, como si el pagador hubiera terminado el
 * checkout en el navegador.
 *
 * Lo usan el desarrollo local y el script de verificación para probar la pantalla
 * de resultado y la de baja sin una pasarela real. **No** activa la
 * suscripción: eso lo hace el webhook del 2.4 consultando el estado real.
 */
export function autorizarPreapprovalMock(id: string): boolean {
  const guardado = mockPreapprovals.get(id)

  if (!guardado || guardado.estado === 'cancelled') return false

  guardado.estado = 'authorized'
  return true
}

/** Fuerza un estado cualquiera. Para probar el mapeo de estados del webhook. */
export function setearEstadoMock(id: string, estado: string): boolean {
  const guardado = mockPreapprovals.get(id)

  if (!guardado) return false

  guardado.estado = estado
  return true
}

/** Estado actual de un preapproval del mock, o `null` si no existe. */
export function estadoPreapprovalMock(id: string): string | null {
  return mockPreapprovals.get(id)?.estado ?? null
}

/**
 * Cuántos preapprovals del mock siguen vivos, o sea no cancelados.
 *
 * Lo usan la verificación de la carrera de altas y nada más. La pregunta que
 * responde es la que importa de verdad: no "cuántos.checkouts se abrieron" sino
 * "cuántos cobros recurrentes quedaron abiertos". Siete preapprovals de los que
 * seis están cancelados no son siete suscripciones.
 */
export function preapprovalsVivosMock(): number {
  let vivos = 0

  for (const guardado of mockPreapprovals.values()) {
    if (guardado.estado !== 'cancelled') vivos += 1
  }

  return vivos
}

/**
 * Crea un pago en el mock.
 *
 * El webhook no inventa pagos: consulta el estado real del recurso que le
 * avisaron. Para poder verificar ese camino sin la pasarela, el mock guarda el
 * pago con el estado que el test elija. `fee` y `neto` existen para comprobar
 * que la comisión se guarda tal como la informa Mercado Pago y no se recalcula
 * a ojo.
 */
export function crearPagoMock(datos: {
  preapprovalId?: string | null
  externalReference?: string | null
  monto: number
  estado?: string
  moneda?: string
  fee?: number
  neto?: number | null
  pagadoEn?: Date | null
}): string {
  const monto = Number(datos.monto)

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new ErrorMercadoPago('El monto del pago no es válido.')
  }

  const id = `mock-pago-${siguienteSecuencia()}`
  const estado = datos.estado ?? 'approved'
  const fee = datos.fee ?? 0

  mockPagos.set(id, {
    id,
    preapprovalId: datos.preapprovalId ?? null,
    externalReference: datos.externalReference ?? null,
    estado,
    monto,
    moneda: datos.moneda ?? 'ARS',
    fee,
    neto: datos.neto === undefined ? monto - fee : datos.neto,
    pagadoEn: datos.pagadoEn ?? (estado === 'approved' ? new Date() : null),
    reembolsadoEn:
      estado === 'refunded' || estado === 'charged_back' ? new Date() : null,
  })

  return id
}

/** Cambia el estado de un pago del mock, como lo haría un cobro posterior. */
export function setearEstadoPagoMock(id: string, estado: string): boolean {
  const guardado = mockPagos.get(id)

  if (!guardado) return false

  guardado.estado = estado

  if (estado === 'approved' && guardado.pagadoEn === null) {
    guardado.pagadoEn = new Date()
  }

  if (estado === 'refunded' || estado === 'charged_back') {
    guardado.reembolsadoEn = new Date()
  }

  return true
}

/** Estado actual de un pago del mock, o `null` si no existe. */
export function estadoPagoMock(id: string): string | null {
  return mockPagos.get(id)?.estado ?? null
}

/**
 * Crea un cobro autorizado que apunta a un pago.
 *
 * Es el recurso que Mercado Pago manda en `subscription_authorized_payment`. El
 * id que llega en el webhook es el del cobro, no el del pago: sin esta capa el
 * mock no podría verificar el camino de las renovaciones.
 */
export function crearPagoAutorizadoMock(datos: {
  pagoId: string
  preapprovalId?: string | null
  externalReference?: string | null
}): string {
  const id = `mock-autorizado-${siguienteSecuencia()}`

  mockAutorizados.set(id, {
    id,
    pagoId: datos.pagoId,
    preapprovalId: datos.preapprovalId ?? null,
    externalReference: datos.externalReference ?? null,
  })

  return id
}

/** Vacía el mock. Lo usan los tests entre corridas. */
export function limpiarMockMercadoPago(): void {
  mockPreapprovals.clear()
  mockPagos.clear()
  mockAutorizados.clear()
  globalMock.__mockMpSecuencia = 0
}