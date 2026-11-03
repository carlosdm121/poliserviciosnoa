'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

/**
 * Secciones del panel.
 *
 * El tipo explícito es necesario: sin él, TypeScript infiere objetos
 * distintos para cada elemento y `seccion.exacto` no existe en los que no
 * lo declaran.
 */
type Seccion = {
  href: string
  label: string
  exacto?: boolean
}

const SECCIONES: readonly Seccion[] = [
  { href: '/panel', label: 'Resumen', exacto: true },
  { href: '/panel/perfil', label: 'Mi perfil' },
  { href: '/panel/galeria', label: 'Fotos' },
  { href: '/panel/whatsapp', label: 'Verificar WhatsApp' },
  { href: '/panel/datos-fiscales', label: 'Datos fiscales' },
  { href: '/panel/suscripcion', label: 'Suscripción' },
  { href: '/panel/cuenta', label: 'Mi cuenta' },
  { href: '/panel/cuenta/datos', label: 'Tus datos' },
]

/**
 * Navegación del panel.
 *
 * En móvil no se usa una barra lateral: no hay ancho para ella. Pasa a ser una
 * tira horizontal con scroll, que es el patrón que el pulgar maneja bien.
 */
export function PanelNavbar(): React.ReactElement {
  const pathname = usePathname()

  return (
    <nav aria-label="Secciones del panel" className="lg:border-r-[3px] lg:border-ink lg:pr-6">
      <ul className="sin-barra flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {SECCIONES.map((seccion) => {
          const activa = seccion.exacto ? pathname === seccion.href : pathname.startsWith(seccion.href)

          return (
            <li key={seccion.href} className="shrink-0 lg:shrink">
              <Link
                href={seccion.href}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'flex min-h-[44px] items-center whitespace-nowrap border-[3px] border-ink px-4 py-2 font-bold uppercase transition-colors',
                  activa ? 'bg-ink text-paper' : 'bg-paper hover:bg-ink hover:text-paper',
                )}
              >
                {seccion.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}