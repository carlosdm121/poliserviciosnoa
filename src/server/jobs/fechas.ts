/**
 * Ventanas de aviso.
 *
 * El cron corre una vez por día, pero `currentPeriodEnd` no cae a la misma hora
 * que el cron. Si se enviara solo cuando el cálculo da exactamente 5 o
 * exactamente 2, un vencimiento a las 18:00 se saltearía el día que el cron
 * corre a las 09:00. Por eso cada aviso tiene una ventana y el `EmailLog` evita
 * el segundo envío dentro de la misma ventana.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Días que faltan, redondeando hacia arriba. Negativo si ya venció. */
export function diasHasta(ahora: Date, vence: Date): number {
  return Math.ceil((vence.getTime() - ahora.getTime()) / MS_POR_DIA)
}

export type Aviso = '5d' | '2d'

/**
 * Qué aviso corresponde según los días restantes.
 *
 * `5d` cubre de 5 a 3 días y `2d` de 2 a 1. Los rangos no se solapan y no hay
 * hueco: cualquier corrida diaria cae en uno de los dos. El día del vencimiento
 * (0) no avisa: ya lo hace el job de vencidas.
 */
export function avisoPara(dias: number): Aviso | null {
  if (dias >= 3 && dias <= 5) return '5d'
  if (dias >= 1 && dias <= 2) return '2d'

  return null
}

/** Fecha `YYYY-MM-DD` en UTC, para la clave de deduplicación. */
export function claveDePeriodo(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}
