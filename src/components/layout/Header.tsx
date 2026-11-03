import Link from 'next/link'

import { NOMBRE_PAGINA } from '@/lib/constantes'

/**
 * Cabecera.
 *
 * Dos decisiones:
 * 1. El nombre de la página es el elemento más grande y en negrita. Es el
 *    único branding que hace falta: el sitio se identifica por lo que ofrece,
 *    no por un logo.
 * 2. Solo se muestran enlaces que sirven desde el celu. Un menú con ocho
 *    secciones en un navbar de 360px no se puede usar.
 */
export function Header(): React.ReactElement {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="text-xl font-black uppercase leading-none tracking-tight sm:text-2xl"
        >
          {NOMBRE_PAGINA}
        </Link>

        <nav aria-label="Principal" className="flex items-center gap-2">
          <Link
            href="/buscar"
            className="hidden min-h-[44px] items-center px-3 font-bold uppercase text-sm hover:underline sm:flex"
          >
            Buscar
          </Link>

          <Link href="/publica-tu-servicio" className="btn-oscuro hidden sm:inline-flex">
            Publicá tu servicio
          </Link>

          <Link
            href="/login"
            className="btn-linea px-4 py-2 text-sm"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  )
}