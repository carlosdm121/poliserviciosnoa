import { CancellationStatus, CancellationType } from '@prisma/client'

/**
 * Reglas puras de baja y arrepentimiento.
 *
 * Viven acá y no en el servicio porque el plazo de arrepentimiento es una
 * decisión legal, no una consulta: tiene que poder testearse con fechas
 * arbitrarias sin base de datos, y el día que un abogado diga "son diez días
 * hábiles" se cambia una constante y no una consulta enterrada en Prisma.
 */

/**
 * Días corridos para revocar la contratación.
 *
 * La Resolución 424/2020 habla de diez días corridos desde la contratación. Se
 * cuentan como 240 horas y no como diez cambios de fecha: un pago a las 23:00
 * no debería perder un día de plazo porque el cron corrió a las 09:00.
 */
export const DIAS_ARREPENTIMIENTO = 10

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * ¿El arrepentimiento todavía está dentro del plazo?
 *
 * @param contratadoEn Fecha del pago que se quiere revocar.
 * @param ahora Momento de la solicitud. Inyectable para tests.
 */
export function dentroDelPlazoDeArrepentimiento(contratadoEn: Date, ahora: Date): boolean {
  const transcurrido = ahora.getTime() - contratadoEn.getTime()

  // Un pago con fecha futura (reloj desfasado, dato corrupto) no habilita un
  // reembolso: el plazo todavía no empezó.
  if (transcurrido < 0) return false

  return transcurrido <= DIAS_ARREPENTIMIENTO * MS_POR_DIA
}

/** Días corridos que faltan para que cierre el plazo. `0` si ya cerró. */
export function diasRestantesDeArrepentimiento(contratadoEn: Date, ahora: Date): number {
  const vence = contratadoEn.getTime() + DIAS_ARREPENTIMIENTO * MS_POR_DIA
  const restante = vence - ahora.getTime()

  if (restante <= 0) return 0

  return Math.ceil(restante / MS_POR_DIA)
}

/**
 * Número de trámite visible para el profesional.
 *
 * Formato: `BA-20261027-AB12CD` o `AR-20261027-AB12CD`. Lleva la fecha y un
 * sufijo aleatorio corto. No es un identificador secreto: se dicta por teléfono
 * y se escribe en un email, así que tiene que ser corto y legible.
 */
export function generarNumeroTramite(
  tipo: CancellationType,
  ahora: Date,
  sufijo: string,
): string {
  const prefijo = tipo === CancellationType.ARREPENTIMIENTO ? 'AR' : 'BA'
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const limpio = sufijo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  return `${prefijo}-${anio}${mes}${dia}-${limpio || '000000'}`
}

/** Texto para la pantalla y los emails. */
export const ETIQUETA_TIPO_CANCELACION: Record<CancellationType, string> = {
  [CancellationType.BAJA]: 'Baja del servicio',
  [CancellationType.ARREPENTIMIENTO]: 'Arrepentimiento',
}

/** Texto del estado. */
export const ETIQUETA_ESTADO_CANCELACION: Record<CancellationStatus, string> = {
  [CancellationStatus.PENDIENTE]: 'En proceso',
  [CancellationStatus.COMPLETADA]: 'Completado',
  [CancellationStatus.FALLIDA]: 'Falló, lo estamos revisando',
}
