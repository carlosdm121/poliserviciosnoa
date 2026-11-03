'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { urlMiniatura } from '@/lib/imagen'

type Imagen = { id: string; url: string; width: number; height: number }

type Props = {
  imagenes: Imagen[]
  nombre: string
}

/**
 * Galería del perfil con lightbox.
 *
 * El lightbox es un componente cliente porque el perfil se renderiza en el
 * servidor y no tiene sentido mandar toda la página al navegador para abrir una
 * foto. Las miniaturas se piden transformadas a 600 px: la grilla del celular
 * no necesita la imagen de 1600 y en el interior los datos no sobran.
 *
 * Accesibilidad del diálogo: `aria-modal`, foco al botón de cerrar, Escape para
 * salir, flechas para navegar y devolución del foco al disparador. Sin eso, un
 * usuario de teclado que cierra el lightbox queda al principio del documento.
 */
export function GaleriaPerfil({ imagenes, nombre }: Props): React.ReactElement {
  const [indice, setIndice] = useState<number | null>(null)
  const cerrar = useRef<HTMLButtonElement | null>(null)
  const disparador = useRef<HTMLElement | null>(null)

  const abierta = indice !== null
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?'

  useEffect(() => {
    if (!abierta) return

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrar.current?.focus()

    return () => {
      document.body.style.overflow = overflowPrevio
      disparador.current?.focus()
    }
  }, [abierta])

  useEffect(() => {
    if (!abierta) return

    function alTeclear(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        setIndice(null)
        return
      }

      if (evento.key === 'ArrowRight') {
        evento.preventDefault()
        setIndice((actual) =>
          actual === null ? actual : (actual + 1) % imagenes.length,
        )
        return
      }

      if (evento.key === 'ArrowLeft') {
        evento.preventDefault()
        setIndice((actual) =>
          actual === null ? actual : (actual - 1 + imagenes.length) % imagenes.length,
        )
      }
    }

    window.addEventListener('keydown', alTeclear)

    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierta, imagenes.length])

  function abrir(posicion: number): void {
    disparador.current = document.activeElement as HTMLElement | null
    setIndice(posicion)
  }

  if (imagenes.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="flex aspect-[16/10] w-full items-center justify-center border-[3px] border-ink bg-ink text-paper"
      >
        <span className="font-display text-7xl uppercase">{inicial}</span>
      </div>
    )
  }

  const posicionActual = indice ?? 0
  const actual = indice === null ? null : imagenes[indice]

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {imagenes.map((imagen, posicion) => (
          <li key={imagen.id} className={posicion === 0 ? 'col-span-2 sm:col-span-3' : ''}>
            <button
              type="button"
              onClick={() => abrir(posicion)}
              aria-label={`Ampliar foto ${posicion + 1} de ${imagenes.length}`}
              className="relative block aspect-[4/3] w-full border-[3px] border-ink bg-ink/5"
            >
              <Image
                src={urlMiniatura(imagen.url, 600)}
                alt={`Trabajo ${posicion + 1} de ${nombre}`}
                fill
                sizes={
                  posicion === 0
                    ? '(max-width: 640px) 100vw, 60vw'
                    : '(max-width: 640px) 50vw, 33vw'
                }
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {actual && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${nombre}`}
          className="fixed inset-0 z-50 flex flex-col bg-ink text-paper"
        >
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-paper px-3 py-2">
            <p className="font-mono text-sm" aria-live="polite">
              {posicionActual + 1} / {imagenes.length}
            </p>

            <button
              ref={cerrar}
              type="button"
              onClick={() => setIndice(null)}
              aria-label="Cerrar galería"
              className="inline-flex h-11 w-11 items-center justify-center border-[3px] border-paper"
            >
              <X aria-hidden className="h-6 w-6" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <Image
              src={urlMiniatura(actual.url, 1600)}
              alt={`Trabajo ${posicionActual + 1} de ${nombre}`}
              fill
              sizes="100vw"
              className="object-contain p-2"
              priority
            />

            {imagenes.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setIndice((posicion) =>
                      posicion === null
                        ? posicion
                        : (posicion - 1 + imagenes.length) % imagenes.length,
                    )
                  }
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center border-[3px] border-paper bg-ink"
                >
                  <ChevronLeft aria-hidden className="h-7 w-7" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setIndice((posicion) =>
                      posicion === null ? posicion : (posicion + 1) % imagenes.length,
                    )
                  }
                  aria-label="Foto siguiente"
                  className="absolute right-2 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center border-[3px] border-paper bg-ink"
                >
                  <ChevronRight aria-hidden className="h-7 w-7" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
