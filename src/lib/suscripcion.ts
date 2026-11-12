import { SubscriptionStatus } from '@prisma/client'

import { aNumero, ErrorMontoInvalido, formatArs, type Monto } from '@/lib/dinero'

/**
 * Lógica pura de la suscripción.
 *
 * Gemelo de `lib/imagen.ts` para la galería: acá vive todo lo que se puede
 * decidir sin base de datos, y `services/suscripcion.ts` solo lo que necesita
 * consultar o escribir. La separación no es cosmética: `evaluarRequisitosPago`
 * decide si a alguien se le deja cobrar, y eso tiene que poder testearse con
 * casos imposibles de armar contra una base real.
 */

/**
 * Versión vigente de los términos y condiciones.
 *
 * Va como constante y no en la base porque no es contenido editable: cambia
 * cuando el abogado escribe una versión nueva, y eso es un cambio de código
 * revisado. Lo que se guarda por suscripción es **qué** versión aceptó cada
 * comprador y cuándo, que es lo que prueba la aceptación.
 *
 * Formato: `AAAA-MM-DD` de la fecha en que entró en vigor.
 */
export const VERSION_TERMINOS = '2026-10-16'

// ---------------------------------------------------------------------------
// Requisitos para poder pagar
// ---------------------------------------------------------------------------

/**
 * Motivos por los que no se puede cobrar todavía.
 *
 * Deliberadamente **no** es `MotivoBloqueo` de `services/publicacion.ts`. Son
 * listas distintas con un criterio distinto y mezclarlas haría que la pantalla
 * de pago exigiera fotos —porque `evaluarPublicacion` las exige para publicar—
 * cuando un profesional tiene que poder pagar y cargar las fotos después. Lo
 * que se exige antes de cobrar es lo que hace falta para emitir una factura:
 * quién paga y dónde se lo encuentra.
 *
 * Los cuatro primeros motivos sí se comparten con la regla de publicación: son
 * las mismas condiciones, y el texto y la ruta salen de ahí para que el
 * profesional no lea dos redacciones distintas del mismo problema.
 */
export type RequisitoPago =
  | 'EMAIL_SIN_VERIFICAR'
  | 'WHATSAPP_SIN_VERIFICAR'
  | 'PERFIL_INCOMPLETO'
  | 'SIN_RUBRO_PRINCIPAL'
  | 'DATOS_FISCALES_INCOMPLETOS'

/** Lo que hay que mirar de un perfil para decidir si puede pagar. */
export type EntradaRequisitos = {
  emailVerificado: boolean
  whatsappVerificado: boolean
  tieneRubroPrincipal: boolean
  /** Nombre no vacío, ciudad cargada y descripción de 20 caracteres o más. */
  perfilCompleto: boolean
  /** Datos fiscales cargados y válidos. */
  tieneDatosFiscales: boolean
}

/**
 * Texto de cada requisito faltante.
 *
 * Los cuatro primeros salen de `MOTIVOS_BLOQUEGO`: son literalmente las mismas
 * condiciones y el profesional ya las leyó en el panel. Escribirlas otra vez acá
 * haría que un cambio en el texto de la verificación de WhatsApp se viera en el
 * panel y no en el checkout, que es donde le duele.
 */
export const MOTIVOS_REQUISITO: Record<RequisitoPago, string> = {
  EMAIL_SIN_VERIFICAR:
    'Falta verificar tu email. Te mandamos un enlace: revisá la carpeta de spam si no lo ves.',
  WHATSAPP_SIN_VERIFICAR:
    'Falta confirmar tu número de WhatsApp. Te mandamos un código para que lo confirmes vos mismo.',
  PERFIL_INCOMPLETO: 'Completá tu perfil: nombre, ciudad y una descripción de al menos 20 caracteres.',
  SIN_RUBRO_PRINCIPAL: 'Elegí tu rubro principal. Es lo primero por lo que te buscan.',
  DATOS_FISCALES_INCOMPLETOS:
    'Cargá tus datos fiscales. Los necesita la factura de cada pago que hagas.',
}

/** Sección donde se resuelve cada requisito. */
export const RUTA_POR_REQUISITO: Record<RequisitoPago, string> = {
  EMAIL_SIN_VERIFICAR: '/reenviar-verificacion',
  WHATSAPP_SIN_VERIFICAR: '/panel/whatsapp',
  PERFIL_INCOMPLETO: '/panel/perfil',
  SIN_RUBRO_PRINCIPAL: '/panel/perfil',
  DATOS_FISCALES_INCOMPLETOS: '/panel/datos-fiscales',
}

/**
 * Qué le falta a un profesional para poder pagar.
 *
 * El orden es el que el panel de publicación ya usa: primero los bloqueos
 * duros, después los de contenido. Así el checklist de pago muestra primero lo
 * que no se resuelve en un clic.
 *
 * Devuelve una lista vacía cuando puede pagar. **La lista vacía no autoriza el
 * cobro por sí sola**: `services/suscripcion.ts` vuelve a evaluarla contra la
 * base dentro de la transacción. Esta función es la que se testea; la segunda
 * evaluación es la que evita que un cliente manipulado pase con datos viejos.
 */
export function evaluarRequisitosPago(entrada: EntradaRequisitos): RequisitoPago[] {
  const faltantes: RequisitoPago[] = []

  if (!entrada.emailVerificado) faltantes.push('EMAIL_SIN_VERIFICAR')
  if (!entrada.whatsappVerificado) faltantes.push('WHATSAPP_SIN_VERIFICAR')
  if (!entrada.tieneRubroPrincipal) faltantes.push('SIN_RUBRO_PRINCIPAL')
  if (!entrada.perfilCompleto) faltantes.push('PERFIL_INCOMPLETO')
  if (!entrada.tieneDatosFiscales) faltantes.push('DATOS_FISCALES_INCOMPLETOS')

  return faltantes
}

/** Un requisito más un mensaje con qué hacer. Es lo que pinta la pantalla. */
export type RequisitoConTexto = {
  motivo: RequisitoPago
  texto: string
  href: string
}

/** Agrega el texto y la ruta a los motivos faltantes. */
export function requisitosParaMostrar(faltantes: RequisitoPago[]): RequisitoConTexto[] {
  return faltantes.map((motivo) => ({
    motivo,
    texto: MOTIVOS_REQUISITO[motivo],
    href: RUTA_POR_REQUISITO[motivo],
  }))
}

// ---------------------------------------------------------------------------
// Estado y precio
// ---------------------------------------------------------------------------

/**
 * ¿Se puede abrir un checkout ahora?
 *
 * `ACTIVE` bloquea: cobrar dos veces al mismo perfil en paralelo es el peor
 * error posible acá, porque el profesional paga de verdad una sola vez y el
 * portal le muestra dos perfiles o le descuenta doble sin que nada avise.
 *
 * `PENDING` **no** bloquea, y la decisión es deliberada. Un PENDING es un
 * intento anterior que quedó a mitad de camino —cerró la pestaña en el checkout,
 * la tarjeta no pasó, se le cayó el internet en el campo del CVU—. Si el botón
 * dijera "ya tenés una suscripción en curso" sin más, el profesional queda
 * trabado en una pantalla que no lo deja seguir ni cancelar. Lo que se hace es
 * **reabrir el mismo intento**: se cancela el preapproval viejo en Mercado Pago
 * y se crea uno nuevo sobre la misma fila de `Subscription`. No es una segunda
 * suscripción —el índice único de `profileId` lo impide— sino la misma, otra vez.
 *
 * `EXPIRED` y `CANCELLED` pasan: son suscripciones terminadas, y volver a
 * suscribirse tiene que ser posible.
 */
export function puedeSuscribirse(estado: SubscriptionStatus | null): boolean {
  return estado !== SubscriptionStatus.ACTIVE
}

/**
 * El monto que se congela en la próxima alta.
 *
 * Un socio fundador conserva su precio para siempre (`priceFrozen`), y eso se
 * decide acá y no en el servicio, porque es una regla de negocio con dos
 * entradas y un `if` que alguien va a cambiar el día que haya promociones.
 *
 * `planAmount` es el monto del plan vigente y `montoPrevio` el que ya tenía la
 * suscripción anterior (o `null` si es la primera).
 */
export function precioDeAlta(montoPrevio: number | null, congelado: boolean, montoDelPlan: number): number {
  return congelado && montoPrevio !== null ? montoPrevio : montoDelPlan
}

// ---------------------------------------------------------------------------
// Monto que va a la pasarela
// ---------------------------------------------------------------------------

/**
 * El monto como string de dos decimales, listo para mandar a Mercado Pago.
 *
 * Existe y no se manda el número directo por una razón concreta: `Decimal` de
 * Prisma pasa por `number` en el camino a la API, y un `10000.0000000001` en el
 * cuerpo del POST llega al banco del pagador. Según cómo se trunque, se cobra de
 * más, de menos, o la pasarela rechaza el preapproval. Con `toFixed(2)` la
 * representación en la base y la que viaja son la misma.
 *
 * Tira `ErrorMontoInvalido` si el monto no es un número o es negativo, por el
 * mismo motivo que `aNumero`: un precio roto tiene que verse en el log, no
 * convertirse en un checkout de `$NaN`.
 */
export function importeParaPasarela(monto: Monto): string {
  const numero = aNumero(monto)

  if (numero === 0) {
    throw new ErrorMontoInvalido('El monto de la suscripción no puede ser cero.')
  }

  return numero.toFixed(2)
}

// ---------------------------------------------------------------------------
// Período de la suscripción
// ---------------------------------------------------------------------------

/**
 * Fin del período que se abre con un pago.
 *
 * Es "el mismo día del mes siguiente", no "pago + 30 días". Con 30 días, un
 * pago el 31 de enero termina el 2 de marzo y cada renovación se corre un día
 * más, hasta que en junio el perfil se despublica dos días antes de que el
 * cliente haya pagado su mes.
 *
 * El caso que casi no está en ningún lado: el 31 de enero no tiene 31 de
 * febrero. Se recorta al último día del mes destino (28 o 29 en febrero, 30 en
 * abril) para que la suscripción no termine nunca en un día que no existe, que
 * en JavaScript se convertiría en el 2 o 3 del mes siguiente y dejaría al
 * profesional un día de más o de menos.
 *
 * @param fechaPago Momento del pago aprobado.
 * @returns Instante en que termina el período pagado. El webhook (2.4) lo
 *   guarda en `currentPeriodEnd`.
 */
export function finDePeriodo(fechaPago: Date): Date {
  const anio = fechaPago.getUTCFullYear()
  const mes = fechaPago.getUTCMonth()
  const dia = fechaPago.getUTCDate()

  /**
   * Último día del mes siguiente.
   *
   * El día 0 del mes **dos meses** adelante: el día 0 es "el día anterior al
   * primero", o sea el último del mes anterior. Con `mes + 1` se estaba
   * calculando el último día del mes actual, que para un pago el 31 de enero
   * daba 31 y el período terminaba el 3 de marzo.
   */
  const ultimoDia = new Date(Date.UTC(anio, mes + 2, 0)).getUTCDate()

  return new Date(Date.UTC(anio, mes + 1, Math.min(dia, ultimoDia)))
}

/**
 * Hasta cuándo sigue publicado el perfil después de un pago rechazado.
 *
 * Es una ventana de días corridos, no un mes: la gracia existe para que un
 * rechazo de tarjeta no despublicque el perfil en el mismo instante en que el
 * banco dice "no". El cron del 2.7 la usa como fecha de corte.
 *
 * `Math.max(0, dias)` protege contra una variable de entorno negativa: con
 * `-1` la gracia terminaría antes de empezar y el perfil se despublicaría
 * antes del rechazo, que es peor que no tener gracia.
 *
 * @param desde Momento del rechazo o del contracargo.
 * @param dias Días de gracia configurados (`PAYMENT_GRACE_DAYS`).
 */
export function finDeGracia(desde: Date, dias: number): Date {
  const milisegundosPorDia = 24 * 60 * 60 * 1000

  return new Date(desde.getTime() + Math.max(0, dias) * milisegundosPorDia)
}

// ---------------------------------------------------------------------------
// Texto de la pantalla de pago
// ---------------------------------------------------------------------------

/**
 * Las condiciones que hay que mostrar antes de cobrar.
 *
 * El prompt es explícito: precio final, periodicidad, renovación automática y
 * cómo cancelar. Las cuatro van antes del botón, no en una letra chica debajo.
 * En Argentina la renovación automática sin aviso previo es motivo de queja y
 * el que tiene que explicar el cobro es el profesional.
 *
 * El precio entra ya formateado desde `formatArs` (D24): este módulo no puede
 * inventar un número, y por eso recibe un `string` en vez de un monto.
 */
export function resumenCondiciones(precio: string, moneda: string): string[] {
  return [
    `Vas a pagar ${precio} (${moneda}) una vez por mes.`,
    'La renovación es automática: cada mes se descuenta de la tarjeta con la que pagaste.',
    'Te avisamos por email 5 días antes de cada cobro.',
    'Podés cancelar cuando quieras desde esta misma pantalla, sin escribirle a nadie. Si cancelás, tu perfil sigue visible hasta que termine el mes que ya pagaste.',
  ]
}

/**
 * Texto de la línea de "tu precio" en la pantalla de suscripción.
 *
 * Se arma acá y no en el componente porque aparece en dos lugares (la pantalla
 * y el email de confirmación) y si difieren un poco el profesional va a leer que
 * se le cobró otra cosa.
 */
export function lineaPrecioSuscripto(monto: Monto): string {
  return `${formatArs(monto)} por mes`
}