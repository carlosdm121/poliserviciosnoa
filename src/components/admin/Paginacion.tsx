import Link from 'next/link'

import type { Pagina } from '@/lib/admin'

/**
 * Paginación por links, sin JavaScript.
 *
 * Conserva los filtros que ya estaban en la URL: si se buscó "plomero" en
 * Salta, la página 2 sigue siendo de plomeros en Salta y no del padrón entero.
 */
export function Paginacion({
  pagina,
  base,
  params,
}: {
  pagina: Pagina
  base: string
  params: Record<string, string | undefined>
}) {
  if (pagina.totalPaginas <= 1) return null

  const href = (destino: number): string => {
    const query = new URLSearchParams()

    for (const [clave, valor] of Object.entries(params)) {
      if (valor) query.set(clave, valor)
    }

    if (destino > 1) query.set('pagina', String(destino))
    else query.delete('pagina')

    const cadena = query.toString()

    return cadena ? `${base}?${cadena}` : base
  }

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink pt-4 text-sm"
    >
      <p className="text-muted">
        {pagina.total === 0
          ? 'Sin resultados'
          : `${pagina.desde}–${pagina.hasta} de ${pagina.total}`}
      </p>

      <div className="flex items-center gap-2">
        {pagina.pagina > 1 ? (
          <Link className="btn-linea min-h-[40px] px-3 py-1 text-sm" href={href(pagina.pagina - 1)}>
            Anterior
          </Link>
        ) : (
          <span className="btn-linea min-h-[40px] cursor-not-allowed px-3 py-1 text-sm opacity-40">
            Anterior
          </span>
        )}

        <span className="px-2 font-bold">
          {pagina.pagina} / {pagina.totalPaginas}
        </span>

        {pagina.pagina < pagina.totalPaginas ? (
          <Link className="btn-linea min-h-[40px] px-3 py-1 text-sm" href={href(pagina.pagina + 1)}>
            Siguiente
          </Link>
        ) : (
          <span className="btn-linea min-h-[40px] cursor-not-allowed px-3 py-1 text-sm opacity-40">
            Siguiente
          </span>
        )}
      </div>
    </nav>
  )
}
