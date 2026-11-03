import type { Metadata } from 'next'

import { ResultadosBusqueda } from '@/components/busqueda/ResultadosBusqueda'
import { BuscadorHome } from '@/components/home/BuscadorHome'
import { searchProfiles } from '@/server/search'
import { PROVINCIAS, PROVINCIAS_LISTA, provinceDesdeSlug } from '@/lib/constantes'

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''
  const provinciaSlug = typeof sp.provincia === 'string' ? sp.provincia : ''

  const provEnum = provinciaSlug ? provinceDesdeSlug(provinciaSlug) : undefined
  const provinciaNombre = provEnum ? PROVINCIAS[provEnum].nombre : ''

  const partes: string[] = []
  if (q) partes.push(`"${q}"`)
  if (provinciaNombre) partes.push(`en ${provinciaNombre}`)

  const suffix = partes.length ? ` — ${partes.join(', ')}` : ''

  return {
    title: `Búsqueda${suffix ? `: ${suffix}` : ''} | PoliserviciosNOA`,
    description: q
      ? `Resultados de búsqueda para "${q}" en el NOA argentino.`
      : 'Buscá profesionales por rubro, provincia y ciudad.',
  }
}

export default async function BuscarPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const sp = await searchParams

  const rubro = typeof sp.rubro === 'string' ? sp.rubro : undefined
  const provinciaSlug = typeof sp.provincia === 'string' ? sp.provincia : undefined
  const ciudadSlug = typeof sp.ciudad === 'string' ? sp.ciudad : undefined
  const tipoStr = typeof sp.tipo === 'string' ? sp.tipo : undefined
  const q = typeof sp.q === 'string' ? sp.q.trim() : undefined
  const paginaStr = typeof sp.pagina === 'string' ? sp.pagina : undefined

  const provincia = provinciaSlug ? provinceDesdeSlug(provinciaSlug) : undefined
  const pagina = paginaStr ? Math.max(1, parseInt(paginaStr, 10) || 1) : 1

  const { perfiles, total } = await searchProfiles({
    rubro,
    provincia,
    ciudad: ciudadSlug,
    tipo:
      tipoStr === 'Persona' ? 'PERSON' : tipoStr === 'Empresa' ? 'COMPANY' : undefined,
    q,
    pagina,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8">
        <BuscadorHome />
      </section>

      <ResultadosBusqueda
        perfiles={perfiles}
        total={total}
        paginaActual={pagina}
        q={q}
        rubro={rubro}
        provinciaSlug={provinciaSlug}
        ciudadSlug={ciudadSlug}
        tipo={tipoStr}
      />
    </div>
  )
}
