/**
 * Contrato del proveedor de Mercado Pago.
 *
 * Vive en un archivo propio y sin dependencias por la misma razón que
 * `lib/whatsapp/provider.ts`: el desarrollo local y los tests no pueden depender
 * de que haya credenciales reales ni de que la red esté disponible. La regla de
 * `stack.md` se cumple acá: ningún `services/` habla con la API de Mercado Pago
 * directamente, habla con las funciones de `lib/mp/`.
 *
 * **El módulo no incluye el webhook.** Eso es el 2.4 y tiene su propia pieza de
 * seguridad (validación de `x-signature`). Que el preapproval devuelva la URL
 * del checkout no significa que algo pueda activarlo: la suscripción pasa a
 * ACTIVE únicamente cuando llega un pago aprobado por el webhook.
 */

/** Error de Mercado Pago. Distinto de los de negocio, y a propósito. */
export class ErrorMercadoPago extends Error {
  constructor(
    message: string,
    /** Código de la respuesta, para diagnosticar. Nunca se muestra al usuario. */
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ErrorMercadoPago'
  }
}

/** Lo que hay que mandarle a Mercado Pago para abrir un checkout de suscripción. */
export type DatosPreapproval = {
  /** Aparece en el resumen del cargo en el banco del pagador. */
  motivo: string
  /**
   * Referencia externa: el `profileId`.
   *
   * Es lo que permite volver del checkout sin que el servidor tenga que
   * inventar una sesión de estado: el propio Mercado Pago devuelve el
   * `external_reference` y con eso se sabe de qué perfil es el pago. Único por
   * intento, no un identificador secreto.
   */
  externalReference: string
  /** A dónde vuelve el pagador cuando termina. */
  backUrl: string
  /** A dónde avisa Mercado Pago. Tiene que ser una URL absoluta y pública. */
  notificationUrl: string
  /** Monto de cada cobro, en la moneda del plan. */
  monto: string
  moneda: string
  /** Datos del pagador. Mercado Pago los usa para mostrar el resumen. */
  emailPagador: string
  nombrePagador: string
}

/** Un preapproval recién creado. */
export type PreapprovalCreado = {
  id: string
  /** URL a la que hay que redirigir al profesional. Nunca se muestra cruda en un log. */
  urlCheckout: string
}

/**
 * Estado que devuelve Mercado Pago.
 *
 * Se tipa como `string` y no como un enum cerrado a propósito: Mercado Pago
 * agrega estados y un `switch` exhaustivo sobre un enum propio se rompe el día
 * que aparezcan. El mapeo a `SubscriptionStatus` es del módulo 2.4 y lo hace
 * explícito.
 */
export type EstadoPreapproval = string

/** Un preapproval consultado. */
export type PreapprovalConsultado = {
  id: string
  estado: EstadoPreapproval
  externalReference: string | null
  monto: number | null
  moneda: string | null
  /** Cuándo corresponde el próximo cobro, si el preapproval sigue vivo. */
  proximaCobranza: Date | null
  /** Último pago recibido, según Mercado Pago. */
  ultimoPago: Date | null
}

/**
 * Un pago consultado en la API.
 *
 * `estado` es el estado real, no el que dijo el webhook. Esa distinción es el
 * corazón del módulo 2.4: el body de una notificación se puede falsificar, la
 * respuesta de la API con el access token del servidor no.
 */
export type PagoConsultado = {
  id: string
  estado: string
  /** Detalle del estado (`accredited`, `cc_rejected_insufficient_amount`...). */
  estadoDetalle: string | null
  monto: number | null
  moneda: string | null
  /** Cuándo se acreditó. `null` si todavía no. */
  pagadoEn: Date | null
  /** Cuándo se reembolsó o desconoció. `null` si no pasó. */
  reembolsadoEn: Date | null
  /** Comisión de Mercado Pago, sumando los `fee_details` del cobrador. */
  fee: number | null
  /** Lo que queda después de la comisión. */
  neto: number | null
  /** Preapproval al que pertenece el cobro. */
  preapprovalId: string | null
  /** Referencia externa: en este proyecto, el `profileId`. */
  externalReference: string | null
}

/**
 * Un cobro autorizado de una suscripción.
 *
 * `subscription_authorized_payment` no trae el pago directo: trae un recurso
 * que apunta al pago. Hay que consultarlo para saber si se acreditó, y por eso
 * el proveedor expone los dos métodos.
 */
export type PagoAutorizadoConsultado = {
  id: string
  estado: string
  preapprovalId: string | null
  externalReference: string | null
  /** Id del pago real. `null` si el cobro todavía no generó uno. */
  pagoId: string | null
  monto: number | null
  moneda: string | null
  pagadoEn: Date | null
}

export interface MercadoPagoProvider {
  /** Nombre del proveedor, para logs. */
  readonly nombre: string

  /** Abre un checkout de suscripción recurrente. */
  crearPreapproval(datos: DatosPreapproval): Promise<PreapprovalCreado>

  /** Consulta el estado real. `null` si no existe. */
  consultarPreapproval(id: string): Promise<PreapprovalConsultado | null>

  /**
   * Consulta un pago por id. `null` si no existe.
   *
   * Es lo que usa el webhook para no confiar en el body: el evento dice
   * "aprobado", pero el estado que se guarda sale de acá.
   */
  consultarPago(id: string): Promise<PagoConsultado | null>

  /**
   * Consulta un cobro autorizado de suscripción. `null` si no existe.
   *
   * El webhook de `subscription_authorized_payment` llega con el id de este
   * recurso; el pago real está adentro y se consulta después.
   */
  consultarPagoAutorizado(id: string): Promise<PagoAutorizadoConsultado | null>

  /**
   * Cancela el cobro recurrente.
   *
   * Cancelar en Mercado Pago **no** devuelve lo ya cobrado: corta los cobros
   * futuros. Por eso el perfil sigue publicado hasta el fin del período pagado
   * (ver `cancelarRenovacion` en `services/suscripcion.ts`). El reembolso es
   * otra operación y es del módulo 2.6.
   *
   * No tira excepción si el preapproval no existe o ya estaba cancelado: repetir
   * la cancelación es una operación inocua y un error acá dejaría al
   * profesional con la pantalla trabada sin saber qué pasó.
   */
  cancelarPreapproval(id: string): Promise<void>

  /**
   * Devuelve un pago aprobado.
   *
   * Sin `monto` devuelve el total; el arrepentimiento (2.6) siempre devuelve el
   * total, así que el parámetro existe para operaciones parciales futuras.
   *
   * Es idempotente de cara a quien la llama: si Mercado Pago responde que el
   * pago ya estaba reembolsado, se resuelve con la fecha del reembolso en vez
   * de tirar. Un doble clic no puede terminar en dos devoluciones ni en un
   * error que deje la pantalla en un estado que no es el real.
   *
   * @returns Fecha en que Mercado Pago registró el reembolso.
   */
  reembolsarPago(id: string, monto?: number): Promise<{ reembolsadoEn: Date | null }>

  /**
   * Actualiza el monto de un preapproval recurrente.
   *
   * Mercado Pago permite cambiar el `transaction_amount` de un preapproval
   * activo para que la próxima renovación cobre el nuevo monto. Se usa cuando
   * el administrador programa un aumento de precio (módulo 4.3).
   *
   * No tira si el preapproval no existe ni ya no se puede modificar: el
   * `planAmount` local sigue siendo la verdad de la plataforma y la falla se
   * registra para que el admin la vea.
   */
  actualizarPreapproval(id: string, monto: string): Promise<void>
}