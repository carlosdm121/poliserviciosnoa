import { env } from '@/lib/env'

import { facturacionMock } from './mock'
import { facturacionAfipSdk } from './real'
import { ErrorFacturacion, type InvoiceProvider } from './provider'

/**
 * Punto de entrada único del proveedor de facturación.
 *
 * Igual que en `src/lib/mp` (D27), la función se llama en cada uso y no se
 * resuelve al importar: los tests cambian `NODE_ENV` y `ARCA_REAL` entre
 * corridas, y un singleton quedaría congelado con el primer valor.
 */
function usarMock(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ARCA_REAL !== '1'
}

export function getProveedorFacturacion(): InvoiceProvider {
  if (usarMock()) return facturacionMock

  if (!env.arca.accessToken) {
    throw new ErrorFacturacion(
      'Falta ARCA_ACCESS_TOKEN en el servidor. Sin credencial no se puede emitir un comprobante fiscal.',
      { codigo: 'SIN_CREDENCIAL', reintentable: false },
    )
  }

  if (!env.arca.cuit.trim()) {
    throw new ErrorFacturacion('Falta ARCA_CUIT en el servidor.', {
      codigo: 'SIN_CUIT',
      reintentable: false,
    })
  }

  return facturacionAfipSdk
}

/** Nombre del proveedor activo, para logs y para la UI de administración. */
export function nombreProveedorFacturacion(): string {
  return getProveedorFacturacion().nombre
}

export { ErrorFacturacion }
export { fallarEmisionMock, llamadasMock, resetMockArca } from './mock'
export type {
  ComprobanteEmitido,
  DatosAnulacion,
  DatosComprobante,
  InvoiceProvider,
  ReceptorComprobante,
  TipoComprobanteLetra,
} from './provider'
