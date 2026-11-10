import { ErrorMercadoPago, type MercadoPagoProvider, type PreapprovalCreado, type PreapprovalConsultado, type PagoConsultado, type PagoAutorizadoConsultado, type DatosPreapproval } from './provider'

/**
 * Mercado Pago fallback implementation - used when real provider fails or is unavailable.
 * 
 * This module exists solely for development and testing purposes. In production, 
 * the real provider (real.ts) should be used. The fallback simulates the essential 
 * behavior needed for local development without requiring actual Mercado Pago credentials.
 * 
 * Key characteristics:
 * - Simulates preapproval creation and status changes (pending -> authorized)
 * - No actual API calls - operates entirely in-memory
 * - Maintains the same interface as the real provider for compatibility
 * - Used only when development environment lacks real credentials
 */
export class FallbackMercadoPagoProvider implements MercadoPagoProvider {
  readonly nombre = 'fallback'

  private preapprovals = new Map<string, {
    id: string
    estado: string
    externalReference: string | null
    monto: number | null
    moneda: string | null
    proximaCobranza: Date | null
    ultimoPago: Date | null
    urlCheckout: string
  }>()

  private pagos = new Map<string, {
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
  }>()

  private pagosAutorizados = new Map<string, {
    id: string
    estado: string
    preapprovalId: string | null
    externalReference: string | null
    pagoId: string | null
    monto: number | null
    moneda: string | null
    pagadoEn: Date | null
  }>()

  /**
   * Creates a preapproval with the given data
   * @param datos Preapproval creation data
   * @returns Preapproval object with checkout URL
   */
  async crearPreapproval(datos: DatosPreapproval): Promise<PreapprovalCreado> {
    const id = 'fallback_preapproval_' + Math.random().toString(36).substr(2, 9)
    const urlCheckout = `http://localhost:3000/mp-fallback-checkout/${id}`
    
    this.preapprovals.set(id, {
      id,
      estado: 'pending',
      externalReference: datos.externalReference,
      monto: Number(datos.monto),
      moneda: datos.moneda,
      proximaCobranza: new Date(Date.now() + 86400000), // 24 hours
      ultimoPago: null,
      urlCheckout,
    })

    return { id, urlCheckout }
  }

  /**
   * Consults the status of a preapproval
   * @param id Preapproval ID to consult
   * @returns Preapproval status and details, or null if not found
   */
  async consultarPreapproval(id: string): Promise<PreapprovalConsultado | null> {
    const preapproval = this.preapprovals.get(id)
    if (!preapproval) return null

    // Simulate transition from pending to authorized after some time
    if (preapproval.estado === 'pending') {
      // In a real scenario, this would be triggered by a webhook
      // For fallback, we keep it pending but allow manual authorization
      return {
        id: preapproval.id,
        estado: preapproval.estado,
        externalReference: preapproval.externalReference,
        monto: preapproval.monto,
        moneda: preapproval.moneda,
        proximaCobranza: preapproval.proximaCobranza,
        ultimoPago: preapproval.ultimoPago,
      }
    }

    return {
      id: preapproval.id,
      estado: preapproval.estado,
      externalReference: preapproval.externalReference,
      monto: preapproval.monto,
      moneda: preapproval.moneda,
      proximaCobranza: preapproval.proximaCobranza,
      ultimoPago: preapproval.ultimoPago,
    }
  }

  /**
   * Consults a payment by ID
   * @param id Payment ID to consult
   * @returns Payment details or null if not found
   */
  async consultarPago(id: string): Promise<PagoConsultado | null> {
    const pago = this.pagos.get(id)
    if (!pago) return null

    return {
      id: pago.id,
      estado: pago.estado,
      estadoDetalle: pago.estadoDetalle,
      monto: pago.monto,
      moneda: pago.moneda,
      pagadoEn: pago.pagadoEn,
      reembolsadoEn: pago.reembolsadoEn,
      fee: pago.fee,
      neto: pago.neto,
      preapprovalId: pago.preapprovalId,
      externalReference: pago.externalReference,
    }
  }

  /**
   * Consults an authorized payment of a subscription
   * @param id Authorized payment ID to consult
   * @returns Authorized payment details or null if not found
   */
  async consultarPagoAutorizado(id: string): Promise<PagoAutorizadoConsultado | null> {
    const pagoAutorizado = this.pagosAutorizados.get(id)
    if (!pagoAutorizado) return null

    return {
      id: pagoAutorizado.id,
      estado: pagoAutorizado.estado,
      preapprovalId: pagoAutorizado.preapprovalId,
      externalReference: pagoAutorizado.externalReference,
      pagoId: pagoAutorizado.pagoId,
      monto: pagoAutorizado.monto,
      moneda: pagoAutorizado.moneda,
      pagadoEn: pagoAutorizado.pagadoEn,
    }
  }

  /**
   * Cancels a recurring payment preapproval
   * @param id Preapproval ID to cancel
   */
  async cancelarPreapproval(id: string): Promise<void> {
    const preapproval = this.preapprovals.get(id)
    if (preapproval) {
      preapproval.estado = 'cancelled'
      this.preapprovals.set(id, preapproval)
    }
  }

  /**
   * Refunds a payment
   * @param id Payment ID to refund
   * @param monto Optional amount to refund (partial refund)
   * @returns Date when refund was processed
   */
  async reembolsarPago(id: string, monto?: number): Promise<{ reembolsadoEn: Date | null }> {
    const pago = this.pagos.get(id)
    if (pago) {
      pago.reembolsadoEn = new Date()
      pago.estado = 'refunded'
      this.pagos.set(id, pago)
      return { reembolsadoEn: pago.reembolsadoEn }
    }
    return { reembolsadoEn: null }
  }

  /**
   * Updates the amount of a recurring preapproval
   * @param id Preapproval ID to update
   * @param monto New amount as string
   */
  async actualizarPreapproval(id: string, monto: string): Promise<void> {
    const preapproval = this.preapprovals.get(id)
    if (preapproval) {
      preapproval.monto = Number(monto)
      this.preapprovals.set(id, preapproval)
    }
  }

  /**
   * Manually authorizes a preapproval for testing purposes
   * @param id Preapproval ID to authorize
   */
  async autorizarPreapproval(id: string): Promise<void> {
    const preapproval = this.preapprovals.get(id)
    if (preapproval) {
      preapproval.estado = 'authorized'
      preapproval.ultimoPago = new Date()
      this.preapprovals.set(id, preapproval)
    }
  }

  /**
   * Checks if the provider is available
   * @returns true if provider is available, false otherwise
   */
  async estaDisponible(): Promise<boolean> {
    return true
  }
}

// Export a singleton instance for easy import
export const fallbackProvider = new FallbackMercadoPagoProvider()