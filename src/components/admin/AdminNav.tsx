'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import type { Seccion } from '@/lib/admin'

/**
 * Navegación del panel de administración.
 *
 * Es cliente porque marcar la sección activa necesita `usePathname`. El resto
 * del layout sigue en servidor: la matriz de permisos no cruza al navegador y
 * la autorización real se hace igual en cada página.
 */
export function AdminNav({
  secciones,
}: {
  secciones: readonly Seccion[]
}): React.ReactElement {
  const pathname = usePathname()

  return (
    <nav aria-label="Secciones del panel" className="border-t border-ink/10">
      <div className="sin-barra mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
        {secciones.map((seccion) => {
          const activa =
            seccion.href === '/admin'
              ? pathname === '/admin'
              : pathname === seccion.href || pathname.startsWith(`${seccion.href}/`)

          return (
            <Link
              key={seccion.key}
              href={seccion.href}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap px-3 py-2 text-sm font-bold uppercase tracking-wide transition-colors',
                activa
                  ? 'bg-noa-blue text-white'
                  : 'text-ink hover:bg-noa-blue/10 hover:text-noa-blue',
              )}
            >
              {seccion.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
