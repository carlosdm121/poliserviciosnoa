'use client'

import { useCallback, useEffect, useState } from 'react'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

import { ArrowRight, Mail, Menu, Phone, Search, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { enlaceWhatsApp, NOMBRE_PAGINA } from '@/lib/constantes'

/**
 * Cabecera de la marca.
 *
 * Dirección visual: un solo logo combinado (escudo + POLISERVICIOS NOA,
 * guarda la imagen en public/logo-noa.webp) sobre barra blanca, con azul noa
 * como único color de acento. Barra de utilidad con teléfono/mail y alerta
 * animada de alta de profesionales; navegación principal con CTA "Publicá tu
 * servicio" y menú móvil accesible.
 *
 * Requisito: guardar la imagen combinada (Image 3) como
 *   public/logo-noa.webp
 * antes de usar en producción; de lo contrario next/image fallará silencioso.
 */
export function Header(): JSX.Element {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  // Cierra el menú al cambiar de ruta (navegación sin recarga de página).
  useEffect(() => {
    setAbierto(false)
  }, [pathname])

  const toggleMenu = useCallback(() => setAbierto((a) => !a), [])
  const cerrarMenu = useCallback(() => setAbierto(false), [])

  // Esc cierra el menú y devuelve el foco al botón.
  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        cerrarMenu()
        document.getElementById('boton-menu-movil')?.focus()
      }
    }
    if (abierto) {
      window.addEventListener('keydown', tecla)
    }
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, cerrarMenu])

  const activo = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="relative z-40">
      {/* ------------------------------------------------------------------
       * Barra de utilidad: contacto + alerta de alta de profesionales.
       * ---------------------------------------------------------------- */}
      <div className="bg-[#03070E] text-white text-xs sm:text-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div
              className={cn(
                'flex items-center gap-3 sm:gap-5',
                'bg-gradient-to-r from-noa-blue via-[#0B6EE6] to-[#085FBF]',
                'px-4 sm:px-5 py-2 sm:py-2.5 pr-10 sm:pr-14',
                // Angulo superior derecho de la pieza de contacto.
                '[clip-path:polygon(0_0,100%_0,calc(100%-16px)_100%,0_100%)]',
              )}
            >
              <a
                href={enlaceWhatsApp('5493813845345')}
                className="flex items-center gap-1.5 font-bold text-white hover:underline underline-offset-2 decoration-noa-blue/40"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                +5493813845345
              </a>
              <a
                href="mailto:poliserviciosnoa@gmail.com"
                className="hidden sm:flex items-center gap-1.5 font-bold text-noa-silver/90 hover:text-white underline-offset-2 decoration-noa-blue/40 hover:underline"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                poliserviciosnoa@gmail.com
              </a>
            </div>

            <Link
              href="/publica-tu-servicio"
              className={cn(
                'alerta-brillo relative z-10',
                'inline-flex items-center gap-2 overflow-hidden whitespace-nowrap',
                'border border-noa-blue/35 bg-noa-blue/10 px-3 sm:px-3.5 py-1.5 sm:py-2',
                'font-bold text-noa-mist hover:text-white transition-colors',
              )}
              aria-label="Tu espacio web en nuestra página — publicá tu servicio"
            >
              <span className="relative z-10 h-2.5 w-2.5 rounded-full bg-noa-cyan shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
              <span className="hidden sm:inline">Tu espacio web en nuestra página</span>
              <span className="sm:hidden">Tu espacio web</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------
       * Navegación principal: barra blanca con acento azul noa.
       * ---------------------------------------------------------------- */}
      <nav className="sticky top-0 z-50 border-b-[2px] border-noa-blue/60 bg-white text-ink">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 min-h-[44px]"
            aria-label={`Ir al inicio de ${NOMBRE_PAGINA}`}
          >
            {/* Logo único: escudo + POLISERVICIOS NOA (guarda la imagen en
                 public/logo.webp; aquí se usa una copia de img/logo3.webp
                 mientras tanto). */}
            <Image
              src="/logo.webp"
              width={2172}
              height={724}
              alt=""
              priority
              className="h-10 sm:h-12 w-auto"
            />
          </Link>

          {/* Enlaces principales: solo en pantallas grandes. */}
          <div className="hidden lg:flex flex-1 items-end gap-1 sm:gap-2 text-end">
            <Link
              href="/buscar"
              className={cn(
                'font-bold uppercase tracking-wide border-b-2 border-transparent px-1',
                activo('/buscar')
                  ? 'border-noa-blue text-noa-blue'
                  : 'text-muted hover:text-noa-blue',
              )}
            >
              Explorar servicios
            </Link>
            <Link
              href="/publica-tu-servicio"
              className={cn(
                'font-bold uppercase tracking-wide border-b-2 border-transparent px-1',
                activo('/publica-tu-servicio')
                  ? 'border-noa-blue text-noa-blue'
                  : 'text-muted hover:text-noa-blue',
              )}
            >
              Para profesionales
            </Link>
            <Link
              href="/ayuda"
              className={cn(
                'font-bold uppercase tracking-wide border-b-2 border-transparent px-1',
                activo('/ayuda')
                  ? 'border-noa-blue text-noa-blue'
                  : 'text-muted hover:text-noa-blue',
              )}
            >
              Ayuda
            </Link>
            <Link
              href="/soporte"
              className={cn(
                'font-bold uppercase tracking-wide border-b-2 border-transparent px-1',
                activo('/soporte')
                  ? 'border-noa-blue text-noa-blue'
                  : 'text-muted hover:text-noa-blue',
              )}
            >
              Contacto
            </Link>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/buscar"
              className="flex h-9 w-9 items-center justify-center rounded-none border border-ink/20 bg-ink/5 text-ink hover:bg-noa-blue hover:text-paper hover:border-noa-blue transition-colors"
              aria-label="Buscar profesionales"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </Link>

            {/* CTA principal: misma jerarquía que el "JOIN NOW" de referencia. */}
            <Link
              href="/registro"
              className={cn(
                'hidden md:flex min-h-[44px] items-center justify-center gap-2',
                'border-b-[3px] border-noa-blue bg-noa-blue text-[#040A14]',
                'px-4 py-2 font-black uppercase tracking-wide text-sm sm:text-base whitespace-nowrap',
              )}
            >
              Publicá tu servicio
            </Link>

            <Link
              href="/login"
              className={cn(
                'hidden md:flex min-h-[44px] items-center justify-center gap-2',
                'border-b-[3px] border-transparent px-4 py-2',
                'font-bold uppercase tracking-wide text-sm sm:text-base',
                'text-ink hover:text-noa-blue hover:border-noa-blue transition-colors',
              )}
            >
              Entrar
            </Link>

            <button
              id="boton-menu-movil"
              type="button"
              aria-expanded={abierto}
              aria-controls="menu-movil"
              onClick={toggleMenu}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-none',
                'border border-ink/20 bg-ink/5 text-ink',
                'hover:bg-noa-blue hover:text-paper hover:border-noa-blue transition-colors',
                'md:hidden',
              )}
            >
              {abierto ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------------
       * Menú móvil: panel accesible bajo la barra de navegación.
       * ---------------------------------------------------------------- */}
      {abierto && (
        <div
          id="menu-movil"
          role="menu"
          aria-label="Menú principal"
          className="border-t-[2px] border-noa-blue/60 bg-white text-ink"
        >
          <div className="mx-auto max-w-7xl px-3 sm:px-4 py-4 space-y-3">
            <ul role="none" className="space-y-1">
              {[
                { href: '/buscar', etiqueta: 'Explorar servicios' },
                { href: '/publica-tu-servicio', etiqueta: 'Para profesionales' },
                { href: '/ayuda', etiqueta: 'Ayuda' },
                { href: '/soporte', etiqueta: 'Contacto' },
                { href: '/login', etiqueta: 'Entrar' },
              ].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={cerrarMenu}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-ink/10 px-3 py-2.5',
                      'text-base font-bold uppercase tracking-wide',
                      activo(item.href)
                        ? 'text-noa-blue border-noa-blue bg-ink/5'
                        : 'text-ink hover:text-noa-blue',
                    )}
                  >
                    {item.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/registro"
              onClick={cerrarMenu}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-center gap-2',
                'border-b-[3px] border-noa-blue bg-noa-blue text-[#040A14]',
                'px-4 py-2.5 font-black uppercase tracking-wide text-sm whitespace-nowrap',
              )}
            >
              Publicá tu servicio
            </Link>

            <div className="border-t border-ink/10 pt-4 space-y-2">
              <a
                href={enlaceWhatsApp('5493813845345')}
                className="flex items-center gap-2 font-bold text-ink hover:underline underline-offset-2 decoration-noa-blue/40"
              >
                <Phone className="h-4 w-4" aria-hidden="true" /> +5493813845345
              </a>
              <a
                href="mailto:poliserviciosnoa@gmail.com"
                className="flex items-center gap-2 font-bold text-muted hover:text-ink underline-offset-2 decoration-noa-blue/40"
              >
                <Mail className="h-4 w-4" aria-hidden="true" /> poliserviciosnoa@gmail.com
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
