'use client'

import { useCallback, useEffect, useState } from 'react'

import Image from 'next/image'

import { cn } from '@/lib/cn'

export type ItemHero = { src: string; conTexto: boolean }

export function HeroSlideshow({
  items,
  texto,
  buscador,
}: {
  items: readonly ItemHero[]
  /** Contenido del texto (etiqueta + título + párrafo). Se muestra solo en
   *  slides con conTexto: true. */
  texto?: React.ReactNode
  /** El buscador. Siempre visible, en todos los slides. */
  buscador?: React.ReactNode
}): JSX.Element {
  const [activo, setActivo] = useState(0)

  const siguiente = useCallback(() => {
    setActivo((a) => (a + 1) % items.length)
  }, [items.length])

  useEffect(() => {
    const temporizador = setInterval(siguiente, 6000)
    return () => clearInterval(temporizador)
  }, [siguiente])

  const imagen = items[activo]!

  return (
    <section
      className={cn(
        'relative w-full border-b-[3px] border-ink overflow-hidden',
        imagen.conTexto ? 'hero-foto' : 'hero-banner',
      )}
      data-con-texto={imagen.conTexto ? 'true' : 'false'}
    >
      {/* ======================= ESTADO BANNER (hero.webp) ======================= */}
      {!imagen.conTexto && (
        <div className="w-full flex flex-col">
          {/* Banner: ancho 100%, aspect-ratio real de la imagen (2048/768 ≈ 8/3).
              La imagen se ve COMPLETA con object-fit: contain. */}
          <div className="relative w-full banner-imagen" style={{ aspectRatio: '8 / 3' }}>
            <Image
              fill
              src={imagen.src}
              alt=""
              loading="eager"
              priority
              className="object-contain transition-opacity duration-1000 ease-in-out"
              style={{ opacity: 1 }}
            />
            {/* Overlay sutil degradé inferior para integrar con la franja navy */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
              style={{
                background:
                  'linear-gradient(180deg, transparent 60%, rgba(5,8,15,0.4) 100%)',
              }}
            />
          </div>

          {/* Franja navy sólida (funda con el lado izq. de la imagen) + buscador en flujo normal */}
          <div className="relative z-20 w-full px-4 sm:px-6 py-6 sm:py-8 banner-franja">
            <div className="hero-buscador">{buscador}</div>
          </div>
        </div>
      )}

      {/* ======================= ESTADO FOTOS (trabajo1-4) ======================= */}
      {imagen.conTexto && (
        <div className="relative w-full flex flex-col hero-altura">
          {items.map((fondo, i) => (
            <Image
              fill
              key={fondo.src}
              src={fondo.src}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              className={cn(
                i === activo ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none',
                'transition-opacity duration-1000 ease-in-out',
              )}
            />
          ))}

          {/* Overlay degradé navy solo en slides con texto (fotos trabajo1-4) */}
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            aria-hidden="true"
            style={{
              background:
                'linear-gradient(180deg, rgba(5,8,15,0.92) 0%, rgba(5,8,15,0.75) 35%, rgba(11,18,32,0.55) 100%)',
            }}
          />

          {/* Capa de texto: siempre en el DOM; en banner se oculta visualmente con CSS */}
          <div className="relative z-20 w-full px-4 sm:px-6">
            {texto}
          </div>

          {/* Buscador: siempre visible, en flujo normal, debajo del texto. */}
          {buscador && (
            <div className="relative z-20 w-full px-4 sm:px-6 mt-6 sm:mt-8">
              <div className="hero-buscador">{buscador}</div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}