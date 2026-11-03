/**
 * Formato de fechas para textos que ve el profesional.
 *
 * Vive aparte de `lib/dinero.ts` porque son dos formateos distintos y mezclarlos
 * haría que el día que cambie el de fechas haya que abrir el archivo que también
 * decide cómo se ve un precio.
 *
 * La zona es UTC a propósito. Las fechas de período (`currentPeriodEnd`,
 * `graceUntil`) se guardan como instantes y se muestran como el día en que
 * vencen. Si se formatearan en la zona local del servidor, un pago de las 22:00
 * en Tucumán podría mostrarse como el día siguiente en un servidor en UTC, y el
 * profesional leería que su suscripción vence un día después del que figura en
 * la base.
 */

/** Fecha larga en español rioplatense: `15 de diciembre de 2026`. */
export function formatearFechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(fecha)
}

/**
 * Suma o resta días a una fecha, redondeando al día en UTC.
 *
 * Se usa para fechas de negocio (plazos de retención, vencimientos) donde la
 * hora del día no importa: `addDays(ahora, -30)` da hace exactamente 30 días
 * a las 00:00 UTC, sin sorpresas de zona horaria del servidor.
 *
 * @param fecha Fecha de referencia.
 * @param dias Días a sumar (positivos) o restar (negativos).
 */
export function addDays(fecha: Date, dias: number): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + dias))
}
