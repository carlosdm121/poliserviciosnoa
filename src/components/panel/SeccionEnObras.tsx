import Link from 'next/link'

import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { PENDIENTES } from '@/components/panel/pendientes'

/**
 * Secciones del panel que todavía no están construidas.
 *
 * Estar presentes en la navegación desde el primer día evita que el
 * profesional entre y no encuentre lo que busca. La pantalla dice
 * explícitamente que falta, en vez de dar 404: un enlace roto dentro de la
 * navegación se siente como producto abandonado.
 */
export function SeccionEnObras({
  titulo,
  descripcion,
}: {
  titulo: string
  descripcion: string
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">{titulo}</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">{descripcion}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="tarjeta p-8">
          <p className="etiqueta">Próximamente</p>
          <h2 className="mt-4 text-xl font-black uppercase">Esta sección está en construcción</h2>
          <p className="mt-3 max-w-prose leading-relaxed text-muted">
            La funcionalidad se completa en las próximas entregas. Mientras tanto podés{' '}
            <Link href="/panel" className="font-bold underline">
              ver el estado de tu perfil
            </Link>{' '}
            y saber qué te falta para publicarlo.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-muted">
            {PENDIENTES.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}