import { env } from '@/lib/env'

import { MercadoPagoMockProvider } from './mock'
import { MercadoPagoRealProvider } from './real'
import { ErrorMercadoPago, type MercadoPagoProvider } from './provider'

/**
 * Punto de entrada único del proveedor de pagos.
 *
 * La función es `getProveedor()` y no un singleton creado al importar, por una
 * razón concreta: los tests cambian `NODE_ENV` y `MP_REAL` entre corridas y un
 * proveedor elegido al importar queda congelado con el valor del primer import.
 * Con la decisión tomada en cada llamada, el mock y el real conviven en el mismo
 * proceso sin que ninguno tenga que reiniciarse.
 */

/**
 * Si se usa el mock.
 *
 * Misma regla que Cloudinary (D23) y que WhatsApp: **fuera de producción se usa
 * el mock, salvo que se pida explícitamente lo contrario con `MP_REAL=1`.** No
 * se infiere del formato del token de la misma manera, pero el motivo es el
 * mismo: un `.env` copiado de otra máquina con credenciales reales haría que
 * cada prueba de desarrollo abra un checkout de verdad en la pasarela y que el
 * script de verificación cree suscripciones en la cuenta de producción.
 */
function usarMock(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.MP_REAL !== '1'
}

export function getProveedor(): MercadoPagoProvider {
  if (usarMock()) return new MercadoPagoMockProvider()

  if (!env.MP_ACCESS_TOKEN) {
    throw new ErrorMercadoPago('Falta la credencial de Mercado Pago en el servidor.')
  }

  return new MercadoPagoRealProvider(env.MP_ACCESS_TOKEN)
}

export { ErrorMercadoPago }
export { MercadoPagoMockProvider } from './mock'
export { MercadoPagoRealProvider } from './real'
export {
  autorizarPreapprovalMock,
  crearPagoAutorizadoMock,
  crearPagoMock,
  estadoPagoMock,
  estadoPreapprovalMock,
  limpiarMockMercadoPago,
  preapprovalsVivosMock,
  setearEstadoMock,
  setearEstadoPagoMock,
} from './mock'
export type {
  DatosPreapproval,
  EstadoPreapproval,
  MercadoPagoProvider,
  PagoAutorizadoConsultado,
  PagoConsultado,
  PreapprovalCreado,
  PreapprovalConsultado,
} from './provider'