import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Province } from '@prisma/client'

import { ResultadosBusqueda } from '@/components/busqueda/ResultadosBusqueda'
import { textoIntroRubroProvincia } from '@/lib/perfil-publico'
import { PROVINCIAS, provinceDesdeSlug } from '@/lib/constantes'
import { contarPerfilesPublicos, searchProfiles } from '@/server/search'

/**
 * Una sola ruta para los tres niveles de navegación:
 *
 *   /tucuman                      → todo lo de la provincia
 *   /tucuman/plomeria             → el rubro en la provincia
 *   /tucuman/yerba-buena/plomeria → el rubro en la ciudad
 *
 * Next no permite `[rubro]` y `[ciudad]` como segmentos hermanos, así que
 * el segundo y el tercer nivel viven en un catch-all. Los slugs de ciudad
 * son únicos dentro del país, por eso con dos segmentos el primero es la
 * ciudad y el segundo el rubro, igual que en la URL.
 */

interface PageProps {
  params: Promise<{ provincia: string; filtros?: string[] }>
}

interface Navegacion {
  provincia: Province
  provinciaSlug: string
  rubro?: string
  ciudad?: string
}

function interpretar(provincia: string, filtros: string[]): Navegacion | null {
  const provEnum = provinceDesdeSlug(provincia)

  if (!provEnum || filtros.length > 2) return null

  if (filtros.length === 0) {
    return { provincia: provEnum, provinciaSlug: provincia }
  }

  if (filtros.length === 1) {
    return { provincia: provEnum, provinciaSlug: provincia, rubro: filtros[0] }
  }

  return {
    provincia: provEnum,
    provinciaSlug: provincia,
    ciudad: filtros[0],
    rubro: filtros[1],
  }
}

function tituloPagina(nav: Navegacion): string {
  const provincia = PROVINCIAS[nav.provincia].nombre

  if (nav.rubro && nav.ciudad) {
    return `Profesionales de ${nav.rubro} en ${nav.ciudad}, ${provincia}`
  }

  if (nav.rubro) {
    return `Profesionales de ${nav.rubro} en ${provincia}`
  }

  return `Profesionales en ${provincia}`
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { provincia, filtros = [] } = await params
  const nav = interpretar(provincia, filtros)

  if (!nav) {
    return { title: 'Página no encontrada', robots: { index: false } }
  }

  // Las páginas de resultados sin perfiles no se indexan: evitan contenido fino.
  let total: number | null = null
  if (nav.rubro || nav.ciudad) {
    total = await contarPerfilesPublicos({
      rubro: nav.rubro,
      provincia: nav.provincia,
      ciudad: nav.ciudad,
    })
  }

  const provinciaNombre = PROVINCIAS[nav.provincia].nombre
  const descripcion =
    nav.rubro && nav.ciudad
      ? `Profesionales del rubro ${nav.rubro} en ${nav.ciudad}, ${provinciaNombre}. Contacto directo por WhatsApp.`
      : nav.rubro
        ? `Profesionales del rubro ${nav.rubro} en ${provinciaNombre}. Contacto directo por WhatsApp.`
        : `Profesionales y oficios de ${provinciaNombre}. Contacto directo por WhatsApp.`

  return {
    title: tituloPagina(nav),
    description: descripcion,
    ...(total === 0 ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: `/${[nav.provinciaSlug, nav.ciudad, nav.rubro]
        .filter(Boolean)
        .join('/')}`,
    },
  }
}

export default async function ProvinciaPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { provincia, filtros = [] } = await params
  const nav = interpretar(provincia, filtros)

  if (!nav) notFound()

  const { perfiles, total } = await searchProfiles({
    rubro: nav.rubro,
    provincia: nav.provincia,
    ciudad: nav.ciudad,
    pagina: 1,
  })

  const provinciaNombre = PROVINCIAS[nav.provincia].nombre
  const subtitulo = nav.ciudad
    ? `en ${nav.ciudad}, ${provinciaNombre}`
    : `en ${provinciaNombre}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-display font-black uppercase leading-none">
        {nav.rubro ? `Profesionales de ${nav.rubro}` : 'Profesionales'}
      </h1>
      <p className="mb-6 text-sm uppercase tracking-wide">{subtitulo}</p>

      {nav.rubro && (
        <p className="mb-8 max-w-prose text-sm leading-relaxed">
          {textoIntroRubroProvincia(
            nav.rubro,
            provinciaNombre,
            PROVINCIAS[nav.provincia].capital,
          )}
        </p>
      )}

      <ResultadosBusqueda
        perfiles={perfiles}
        total={total}
        paginaActual={1}
        rubro={nav.rubro}
        provinciaSlug={nav.provinciaSlug}
        ciudadSlug={nav.ciudad}
      />
    </div>
  )
}
