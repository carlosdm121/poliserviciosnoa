/**
 * Reglas puras de métricas del panel del profesional.
 *
 * Todo lo que se puede decidir sin base vive acá: agrupar los últimos 7 días,
 * sumar los últimos 30 y convertir un conjunto de `ProfileDailyStat` en datos
 * para pintar. La parte que toca la base está en `services/panel.ts`.
 */

/**
 * Fila de estadística diaria reducida a los campos que las métricas usan.
 *
 * No usa `ProfileDailyStat` completo porque el servicio solo selecciona
 * `date`, `views` y `whatsappClicks`, y no tiene sentido exigir `profileId`
 * en funciones puras que solo leen esos tres campos.
 */
export type StatDia = {
  date: Date
  views: number
  whatsappClicks: number
}

/** Días de la ventana de visibilidad reciente. */
export const VENTANA_RECIENTE_DIAS = 30

/** Días de la evolución semanal que se muestra en el gráfico. */
export const SEMANA_DIAS = 7

/**
 * Día de negocio de una estadística, como `YYYY-MM-DD` en UTC.
 *
 * `ProfileDailyStat.date` es `@db.Date`: guarda un día, no un instante. Al
 * leerlo de la base llega como `Date` a medianoche UTC, así que `toISOString`
 * y cortar a los 10 primeros caracteres da la fecha de negocio sin zona.
 */
export function fechaDeEstadistica(stat: StatDia): string {
  return stat.date.toISOString().slice(0, 10)
}

/**
 * Fecha de inicio de una ventana, redondeada al día en UTC.
 *
 * Para "últimos 30 días" se cuenta el día de hoy y los 29 anteriores.
 */
export function inicioVentana(ahora: Date, dias: number): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - (dias - 1)))
}

/**
 * Estadísticas de los últimos N días, ordenadas de más vieja a más nueva.
 *
 * Faltan días que no tienen fila: se devuelven solo los que existen, y quien
 * pinta decide si rellena con ceros o deja huecos.
 */
export function ultimosNDias(
  stats: StatDia[],
  ahora: Date,
  dias: number,
): StatDia[] {
  const desde = inicioVentana(ahora, dias)
  const hasta = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()))

  return stats
    .filter((stat) => {
      const fecha = new Date(stat.date)
      return fecha >= desde && fecha <= hasta
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Suma de un campo sobre los últimos N días.
 *
 * Se usa para clics a WhatsApp y visitas de la ventana reciente.
 */
export function sumaCampoReciente(
  stats: StatDia[],
  ahora: Date,
  dias: number,
  campo: 'views' | 'whatsappClicks',
): number {
  return ultimosNDias(stats, ahora, dias).reduce((acumulado, stat) => acumulado + stat[campo], 0)
}

/**
 * Total histórico de un campo.
 *
 * Se usa para el total de visitas y el total de corazones (este último viene
 * del perfil, no de las estadísticas diarias).
 */
export function sumaCampoTotal(
  stats: StatDia[],
  campo: 'views' | 'whatsappClicks',
): number {
  return stats.reduce((acumulado, stat) => acumulado + stat[campo], 0)
}

/**
 * Datos de la evolución semanal para el gráfico de barras.
 *
 * Devuelve 7 entradas, una por cada uno de los últimos 7 días, con la fecha
 * y la suma de visitas + clics de ese día. Días sin fila valen 0. Se ordena
 * de más vieja a más nueva para que el gráfico lea de izquierda a derecha.
 */
export function evolucionSemanal(stats: StatDia[], ahora: Date): {
  fecha: string
  visitas: number
  clics: number
}[] {
  const desde = inicioVentana(ahora, SEMANA_DIAS)
  const porFecha = new Map<string, { visitas: number; clics: number }>()

  for (const stat of stats) {
    const fecha = fechaDeEstadistica(stat)
    const previo = porFecha.get(fecha) ?? { visitas: 0, clics: 0 }
    porFecha.set(fecha, {
      visitas: previo.visitas + stat.views,
      clics: previo.clics + stat.whatsappClicks,
    })
  }

  const resultado: { fecha: string; visitas: number; clics: number }[] = []

  for (let i = 0; i < SEMANA_DIAS; i++) {
    const fecha = new Date(
      Date.UTC(
        ahora.getUTCFullYear(),
        ahora.getUTCMonth(),
        ahora.getUTCDate() - (SEMANA_DIAS - 1 - i),
      ),
    )
    const clave = fecha.toISOString().slice(0, 10)
    const valor = porFecha.get(clave) ?? { visitas: 0, clics: 0 }

    resultado.push({ fecha: clave, ...valor })
  }

  return resultado
}

/**
 * Valor máximo de la semana, para calcular la altura proporcional de las
 * barras del gráfico.
 *
 * Devuelve 0 si no hay actividad: el gráfico pinta barras vacías y no se rompe.
 */
export function maximoSemanal(
  evolucion: { fecha: string; visitas: number; clics: number }[],
): number {
  return Math.max(...evolucion.map((dia) => dia.visitas + dia.clics), 0)
}
