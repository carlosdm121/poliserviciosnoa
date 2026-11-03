import Link from 'next/link'

import { ProfessionalCard } from '@/components/profesionales/ProfessionalCard'
import { ProfessionalCardSkeleton } from '@/components/profesionales/ProfessionalCardSkeleton'
import type { PerfilResultadoBusqueda } from '@/server/search'

export type Props = {
  perfiles: PerfilResultadoBusqueda[]
  total: number
  paginaActual: number
  q?: string
  rubro?: string
  provinciaSlug?: string
  ciudadSlug?: string
  tipo?: string
}

/**
 * Construye la URL de búsqueda manteniendo los filtros actuales y
 * cambiando solo la página. Evita que el usuario pierda el estado al
 * paginar.
 */
function urlConPagina(
  pagina: number,
  filtros: {
    q?: string
    rubro?: string
    provinciaSlug?: string
    ciudadSlug?: string
    tipo?: string
  },
): string {
  const params = new URLSearchParams()
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.rubro) params.set('rubro', filtros.rubro)
  if (filtros.provinciaSlug) params.set('provincia', filtros.provinciaSlug)
  if (filtros.ciudadSlug) params.set('ciudad', filtros.ciudadSlug)
  if (filtros.tipo) params.set('tipo', filtros.tipo)
  params.set('pagina', String(pagina))
  return `/buscar?${params.toString()}`
}

export function ResultadosBusqueda({
  perfiles,
  total,
  paginaActual,
  q,
  rubro,
  provinciaSlug,
  ciudadSlug,
  tipo,
}: Props): React.ReactElement {
  const filtros = { q, rubro, provinciaSlug, ciudadSlug, tipo }
  const paginas = Math.max(1, Math.ceil(total / 12))
  const hayAnterior = paginaActual > 1
  const haySiguiente = paginaActual < paginas

  if (perfiles.length === 0) {
    return (
      <div className="rounded-none border-[3px] border-ink bg-paper p-8 text-center">
        <h2 className="text-display font-black uppercase">Sin resultados</h2>
        <p className="mt-2 text-sm leading-relaxed">
          No encontramos profesionales que coincidan con tu búsqueda.
          Intentá con otro rubro o sin filtros.
        </p>
        <Link href="/buscar" className="btn-oscuro mt-4 inline-block">
          Ver todos los profesionales
        </Link>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm font-bold">
        {total} {total === 1 ? 'profesional encontrado' : 'profesionales encontrados'}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {perfiles.map((p) => (
          <ProfessionalCard key={p.id} profile={p} logueado={false} />
        ))}
      </div>

      {paginas > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Paginación">
          {hayAnterior && (
            <Link
              href={urlConPagina(paginaActual - 1, filtros)}
              className="btn-linea"
            >
              ← Anterior
            </Link>
          )}
          <span className="px-4 py-2 text-sm font-bold">
            Página {paginaActual} de {paginas}
          </span>
          {haySiguiente && (
            <Link
              href={urlConPagina(paginaActual + 1, filtros)}
              className="btn-linea"
            >
              Siguiente →
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}

export function ResultadosBusquedaSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProfessionalCardSkeleton key={i} />
      ))}
    </div>
  )
}