import Link from 'next/link'

import { seccionesVisibles, textoRol } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'

export const metadata = {
  title: 'Administración',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Marco del panel.
 *
 * El menú se arma con la misma matriz de permisos que usan las páginas y las
 * acciones. Un moderador no ve Finanzas ni Configuración porque no puede
 * abrirlas; esconder el link es cortesía, la autorización real está en cada
 * página y en cada server action.
 */
export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  const actor = await exigirAccesoPagina('inicio')
  const secciones = seccionesVisibles(actor.role)

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b-[3px] border-ink bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-lg font-black uppercase tracking-wide">
              Panel
            </Link>
            <span className="etiqueta border-paper bg-ink text-paper">
              {textoRol(actor.role)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-paper/70 sm:inline">{actor.email}</span>
            <Link href="/" className="font-bold underline underline-offset-2">
              Ver sitio
            </Link>
          </div>
        </div>

        <nav aria-label="Secciones del panel" className="border-t border-paper/20">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sin-barra">
            {secciones.map((seccion) => (
              <Link
                key={seccion.key}
                href={seccion.href}
                className="whitespace-nowrap px-3 py-2 text-sm font-bold uppercase tracking-wide hover:bg-paper hover:text-ink"
              >
                {seccion.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  )
}
