import { logger } from '@/lib/logger'
import { enmascararTelefono } from '@/lib/phone'

import type { MensajeWhatsApp, ResultadoEnvio, WhatsAppProvider } from './provider'

/**
 * Proveedor de desarrollo y tests: no envía nada, solo registra.
 *
 * Guarda los envíos en memoria para poder verlos desde `/api/dev`. Es lo que
 * permite probar el flujo completo de verificación sin contratar el número de
 * Meta ni gastar un mensaje de la plantilla.
 *
 * Los identificadores que devuelve son sintéticos (`mock-1`, `mock-2`), pero
 * tienen la misma forma que los reales para que el código que los consume no
 * tenga un caso especial.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly nombre = 'mock'

  private contador = 0

  /** Últimos envíos, para inspección en desarrollo. */
  readonly enviados: { para: string; cuerpo: string; messageId: string }[] = []

  estaConfigurado(): boolean {
    return true
  }

  async enviarTexto(para: string, mensaje: MensajeWhatsApp): Promise<ResultadoEnvio> {
    this.contador += 1
    const messageId = `mock-${this.contador}`

    this.enviados.push({ para, cuerpo: mensaje.cuerpo, messageId })

    logger.info('whatsapp (mock): envío simulado', {
      para: enmascararTelefono(para),
      messageId,
      cuerpo: mensaje.cuerpo,
    })

    return { ok: true, messageId }
  }

  /** Vacía el registro. Lo usa el simulador entre corridas. */
  limpiar(): void {
    this.enviados.length = 0
    this.contador = 0
  }
}

/**
 * Instancia única del mock.
 *
 * Es global a propósito: el registro tiene que sobrevivir entre el request que
 * "envía" y el request que lo consulta, que son dos invocaciones distintas de
 * la función serverless.
 */
const globalMock = globalThis as unknown as { __mockWhatsapp?: MockWhatsAppProvider }

export const mockProvider: MockWhatsAppProvider =
  globalMock.__mockWhatsapp ?? (globalMock.__mockWhatsapp = new MockWhatsAppProvider())