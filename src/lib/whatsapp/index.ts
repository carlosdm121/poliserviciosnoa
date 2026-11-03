import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

import { WhatsAppCloudProvider } from './cloud'
import { MockWhatsAppProvider, mockProvider } from './mock'
import type { WhatsAppProvider } from './provider'

export type { MensajeWhatsApp, ResultadoEnvio, WhatsAppProvider } from './provider'
export { mockProvider, MockWhatsAppProvider } from './mock'

/**
 * Proveedor de envío activo.
 *
 * Se elige uno solo, acá, y no en cada llamador. Si el desarrollo usara el
 * cloud porque el `.env` quedó con credenciales reales de otra máquina,
 * cada test mandaría un mensaje de verdad a un número real de verdad.
 *
 * La regla: sin credenciales reales se usa el mock, aunque estén presentes.
 * Nunca al revés.
 */
let proveedorActivo: WhatsAppProvider | null = null

export function getWhatsAppProvider(): WhatsAppProvider {
  if (proveedorActivo) return proveedorActivo

  const credencialesReales =
    process.env.NODE_ENV !== 'production' &&
    env.whatsapp.accessToken.startsWith('EAA')

  proveedorActivo = credencialesReales ? new WhatsAppCloudProvider() : mockProvider

  logger.info('whatsapp: proveedor activo', { proveedor: proveedorActivo.nombre })

  return proveedorActivo
}

/**
 * Fuerza un proveedor. Solo para tests.
 *
 * Sin esto, un test que corre después de otro que ya inicializó el proveedor
 * real hereda ese singleton y le manda mensajes a Meta.
 */
export function setWhatsAppProvider(proveedor: WhatsAppProvider | null): void {
  proveedorActivo = proveedor
}

/**
 * Hay un número de la plataforma al que el profesional puede escribir.
 *
 * Sin esto, el botón de "Enviar por WhatsApp" de la UI apuntaría a un número
 * vacío y el profesional abriría un chat contra la nada.
 */
export function numeroPlataforma(): string {
  return env.whatsapp.platformNumber
}