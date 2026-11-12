import Link from 'next/link'

import { AdminNav } from '@/components/admin/AdminNav'
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
      <header className="border-b-[3px] border-ink bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-lg font-black uppercase tracking-wide text-ink">
              Panel
            </Link>
            <span className="etiqueta border-noa-blue bg-noa-blue text-white">
              {textoRol(actor.role)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">{actor.email}</span>
            <Link href="/" className="font-bold text-noa-blue underline underline-offset-2">
              Ver sitio
            </Link>
          </div>
        </div>

        <AdminNav secciones={secciones} />
      </header>

      <main>{children}</main>
    </div>
  )
}
