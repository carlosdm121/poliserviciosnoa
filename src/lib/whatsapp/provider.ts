/**
 * Contrato de envío de mensajes de WhatsApp.
 *
 * Existe una interfaz, y no llamadas directo a la API de Meta en el código,
 * por tres razones concretas:
 *
 * 1. El desarrollo local no tiene número de la plataforma. Con `MockProvider`
 *    el flujo de verificación se prueba entero sinMeta y sin costo.
 * 2. Los tests no pueden pegarle a la red real ni depender de que el token
 *    esté vigente.
 * 3. Si hay que migrar de la API nueva a la heredada, o cambiar de proveedor,
 *    el cambio queda en un archivo.
 *
 * Regla de `stack.md`: ningún servicio importa el SDK externo directamente.
 */

/** Texto plano con los estilos que WhatsApp soporta. */
export type MensajeWhatsApp = {
  /** Texto que ve la persona. Máximo 4096 caracteres. */
  cuerpo: string
  /** Previsualización opcional de un enlace. */
  enlace?: string
}

export type ResultadoEnvio = {
  ok: boolean
  /** Identificador del mensaje en Meta. Es la clave de idempotencia. */
  messageId: string | null
  /** Mensaje del proveedor cuando falló, ya sin datos sensibles. */
  detalle?: string
}

export interface WhatsAppProvider {
  /** Nombre corto, para logs y para el simulador. */
  readonly nombre: string

  /**
   * Devuelve `true` si el proveedor está listo para enviar.
   *
   * La UI muestra un aviso antes de generar el código si no lo está: es mejor
   * que el profesional haga todo el flujo y descubra al final que nadie le va
   * a contestar.
   */
  estaConfigurado(): boolean

  /**
   * Envía un mensaje de texto.
   *
   * Nunca tira excepción: el llamador decide qué hacer con un envío fallido,
   * y en el caso de la verificación el envío es posterior a confirmar, así que
   * un fallo acá no puede dar vuelta un estado ya persistido.
   */
  enviarTexto(para: string, mensaje: MensajeWhatsApp): Promise<ResultadoEnvio>
}