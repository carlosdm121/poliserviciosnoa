import Link from 'next/link'

import { PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'

/**
 * Buscador de la home.
 *
 * Va en Server Component: no necesita estado, y mandarlo como HTML plano
 * hace que funcione antes de que cargue el JavaScript. En 3G lenta esa
 * diferencia se nota.
 */
export function BuscadorHome(): React.ReactElement {
  return (
    <form action="/buscar" method="get" className="w-full max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label htmlFor="q" className="sr-only">
            ¿Qué servicio necesitás?
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Plomero, corte de pelo, flete…"
            className="campo text-lg"
            // Enter ya dispara el envío: no hace falta un botón de buscar
            // que ocupe medio ancho en un celular.
          />
        </div>

        <div>
          <label htmlFor="provincia" className="sr-only">
            Provincia
          </label>
          <select id="provincia" name="provincia" className="campo text-lg" defaultValue="">
            <option value="">Toda la región</option>
            {PROVINCIAS_LISTA.map((provincia) => (
              <option key={provincia} value={PROVINCIAS[provincia].slug}>
                {PROVINCIAS[provincia].nombre}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-oscuro px-8">
          Buscar
        </button>
      </div>
    </form>
  )
}

/**
 * Bloque de acceso rápido por provincia.
 *
 * Enlaza a `/[provincia]` porque es la ruta con más valor SEO y la que el
 * usuario comparte por WhatsApp cuando busca "plomero en Tucumán".
 */
export function AccesosPorProvincia(): React.ReactElement {
  return (
    <section aria-labelledby="titulo-provincias" className="mt-16">
      <h2 id="titulo-provincias" className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
        Buscá por provincia
      </h2>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PROVINCIAS_LISTA.map((provincia) => (
          <li key={provincia}>
            <Link
              href={`/${PROVINCIAS[provincia].slug}`}
              className="flex min-h-[72px] flex-col justify-between border-[3px] border-ink p-4 transition-colors hover:bg-ink hover:text-paper"
            >
              <span className="text-lg font-black uppercase leading-none">
                {PROVINCIAS[provincia].nombre}
              </span>
              <span className="text-xs opacity-70">{PROVINCIAS[provincia].capital}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}