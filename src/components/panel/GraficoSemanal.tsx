'use client'

import { formatArs } from '@/lib/dinero'
import { cn } from '@/lib/cn'

type DiaEvolucion = {
  fecha: string
  visitas: number
  clics: number
}

/**
 * Gráfico de barras de la evolución semanal.
 *
 * Siete barras, una por cada uno de los últimos 7 días. La altura es
 * proporcional al día con más actividad de esa semana. Sin librerías: es
 * puro Tailwind y un cálculo de porcentaje.
 *
 * Los días se muestran abreviados (lun, mar, ...) para que quepan en móvil.
 */
export function GraficoSemanal({
  evolucion,
  maximo,
}: {
  evolucion: DiaEvolucion[]
  maximo: number
}): React.ReactElement {
  const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

  const fechaDesdeISO = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

  const diaSemana = (iso: string): string => {
    const indice = fechaDesdeISO(iso).getUTCDay()
    const nombre = DIAS_SEMANA[indice]
    return nombre ?? 'dom'
  }

  const alturaBarra = (valor: number): string => {
    if (maximo === 0) return '0%'
    return `${Math.max((valor / maximo) * 100, 4)}%`
  }

  return (
    <section className="tarjeta p-6">
      <h2 className="text-lg font-black uppercase mb-4">Evolución semanal</h2>
      <p className="text-sm text-muted mb-6">
        Visitas y clics a WhatsApp de los últimos 7 días.
      </p>

      <div
        role="img"
        aria-label="Evolución semanal de visitas y clics"
        className="flex items-end gap-2 h-40"
      >
        {evolucion.map((dia) => {
          const total = dia.visitas + dia.clics
          const altura = alturaBarra(total)

          return (
            <div
              key={dia.fecha}
              className={cn(
                'flex flex-col items-center gap-1 w-full',
                total === 0 ? 'opacity-40' : '',
              )}
            >
              <div
                className={cn(
                  'w-full border-t-[3px] border-ink bg-ink transition-all duration-300',
                  total > 0 ? 'hover:bg-ink hover:opacity-80' : '',
                )}
                style={{ height: altura }}
                title={`${dia.visitas} visitas · ${dia.clics} clics`}
              />
              <span className="text-[10px] font-bold uppercase leading-none">
                {diaSemana(dia.fecha)}
              </span>
              <span className="text-[10px] text-muted leading-none">
                {total}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-between text-xs text-muted">
        <span>Más viejo</span>
        <span>Más nuevo</span>
      </div>

      {maximo === 0 && (
        <p className="mt-4 text-sm text-muted text-center">
          Sin actividad registrada todavía.
        </p>
      )}
    </section>
  )
}
