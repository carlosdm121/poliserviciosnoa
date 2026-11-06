import Link from 'next/link'
import type { Metadata } from 'next'

import { AccesosPorProvincia, BuscadorHome } from '@/components/home/BuscadorHome'
import { HeroSlideshow } from '@/components/home/HeroSlideshow'
import { InstalarApp } from '@/components/legales/InstalarApp'
import { prisma } from '@/lib/prisma'
import { NOMBRE_PAGINA, PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'

/**
 * Metadatos de la home. Los hereda del layout, pero se declaran acá para
 * controlar título, descripción, canónica y tarjetas sociales con una URL
 * absoluta (Open Graph sin metadataBase absoluto no se renderiza en WhatsApp).
 */
export async function generateMetadata(): Promise<Metadata> {
  const descripcion =
    'Plomeros, electricistas, beauty, fletes, clases y más en Tucumán, Salta, ' +
    'Santiago del Estero, Catamarca y Jujuy. Contactá directo por WhatsApp.'

  return {
    title: `${NOMBRE_PAGINA} — Encontrá un profesional en el NOA`,
    description: descripcion,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: NOMBRE_PAGINA,
      title: `${NOMBRE_PAGINA} — Encontrá un profesional en el NOA`,
      description: descripcion,
      url: '/',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${NOMBRE_PAGINA} — Encontrá un profesional en el NOA`,
      description: descripcion,
    },
  }
}

/** Home pública. Siempre en servidor: depende del catálogo de base de datos. */
export const dynamic = 'force-dynamic'

export default async function HomePage(): Promise<React.ReactElement> {
  // Solo los grupos con rubros activos. Traer el árbol completo y filtrar en
  // memoria funciona en desarrollo y se rompe cuando el catálogo crezca.
  const grupos = await prisma.categoryGroup.findMany({
    where: {
      categories: { some: { isActive: true } },
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      categories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          requiresLicense: true,
        },
      },
    },
  })

  // Conteo de perfiles visibles por rubro.
  //
  // Va aparte porque Prisma no permite filtrar dentro de `_count` cuando la
  // relación es de tipo muchos-a-muchos implícito (ProfileCategory). La
  // alternativa —traer todos los perfiles publicados y contarlos en memoria—
  // trae la tabla entera al servidor en cada visita a la home.
  const conteo = await prisma.profileCategory.groupBy({
    by: ['categoryId'],
    where: {
      // El filtro va en la relación, que sí es uno-a-muchos desde
      // ProfileCategory hacia Profile.
      profile: CONDICION_PERFIL_PUBLICO,
    },
    _count: { _all: true },
  })

  const perfilesPorRubro = new Map(conteo.map((fila) => [fila.categoryId, fila._count._all]))

  return (
    <>
      {/* ------------------------------------------------------------------
       * Hero: carrusel de fondo con desvanecimiento entre imágenes.
       * En las imágenes de trabajo se ven las letras del hero; en hero.webp
       * solo se muestra la imagen, sin texto encima.
       * El overlay (texto + buscador) se pasa como children desde el server
       * para no romper la frontera server -> client.
       * ---------------------------------------------------------------- */}
      <HeroSlideshow
        items={[
          { src: '/trabajo1.webp', conTexto: true },
          { src: '/trabajo2.webp', conTexto: true },
          { src: '/trabajo3.webp', conTexto: true },
          { src: '/trabajo4.webp', conTexto: true },
          { src: '/hero.webp', conTexto: false },
        ]}
        texto={
          /* Contenido del texto: se muestra solo en slides con conTexto=true.
             Texto en blanco con acento cian, sans-serif bold, fluido con clamp. */
          <div className="hero-texto">
            <p className="text-sm font-black uppercase tracking-widest text-noa-cyan">
              Tucumán · Salta · Santiago del Estero · Catamarca · Jujuy
            </p>

            <h1 className="mt-4 max-w-4xl text-[clamp(2rem,6vw,3.5rem)] font-black uppercase leading-[1.05] text-white">
              El profesional
              <br />
              que necesitás,
              <br />
              <span className="text-noa-cyan">en tu zona.</span>
            </h1>

            <p className="mt-6 max-w-prose text-base sm:text-lg text-white/90 leading-relaxed">
              Plomeros, electricistas, beauty, fletes, clases y más. Los encontrás por rubro y ciudad,
              y los contactás directo por WhatsApp. Sin comisiones ni intermediarios.
            </p>
          </div>
        }
        buscador={<BuscadorHome />}
      />

      {/* ------------------------------------------------------------------
       * Rubros
       * Cada grupo es una card. 57 rubros en una grilla única son 57
       * decisiones: hay que agrupar para que se pueda elegir.
       * ---------------------------------------------------------------- */}
      <section
        aria-labelledby="titulo-rubros"
        className="seccion-busqueda mx-auto max-w-6xl px-4"
      >
        <h2
          id="titulo-rubros"
          className="text-title font-black uppercase"
        >
          ¿Qué estás buscando?
          <span
            className="mt-3 block h-2 w-24 rounded-full bg-gradient-to-r from-noa-blue to-noa-cyan"
            aria-hidden="true"
          />
        </h2>

        <div className="mt-10 grupos-grid">
          {grupos.map((grupo) => (
            <div key={grupo.id} className="grupo-card">
              <h3 className="grupo-titulo">
                <span className="grupo-accent-bar" aria-hidden="true" />
                <span className="grupo-titulo-texto">{grupo.name}</span>
              </h3>

              <ul className="mt-4 flex flex-wrap gap-2">
                {grupo.categories.map((rubro) => (
                  <li key={rubro.id}>
                    <Link
                      href={`/buscar?rubro=${rubro.slug}`}
                      className="chip-busqueda"
                    >
                      {rubro.name}
                      {/* El contador solo se muestra si hay oferta. Decir "0" en
                          un rubro es lo peor que puede mostrar la home. */}
                      {(perfilesPorRubro.get(rubro.id) ?? 0) > 0 && (
                        <span className="conteo">{perfilesPorRubro.get(rubro.id)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <AccesosPorProvincia />
      </div>

      <InstalarApp />

      {/* ------------------------------------------------------------------
       * Llamado a publicar
       * ---------------------------------------------------------------- */}
      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="border-[3px] border-ink bg-ink p-8 text-paper sm:p-12">
          <h2 className="text-title font-black uppercase">¿Ofrecés un servicio?</h2>
          <p className="mt-4 max-w-prose text-lg leading-relaxed opacity-90">
            Publicá tu perfil, mostrale tu trabajo a la gente de tu zona y recibí consultas directo
            por WhatsApp. La suscripción renewea sola y te avisamos antes de cada cobro.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registro" className="btn border-paper bg-paper text-ink hover:bg-ink hover:text-paper">
              Publicá tu servicio
            </Link>
            <Link href="/publica-tu-servicio" className="btn border-paper bg-transparent text-paper hover:bg-paper hover:text-ink">
              Saber más
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}