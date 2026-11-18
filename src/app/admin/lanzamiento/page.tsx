import Link from 'next/link'

import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarCupones, type FilaCupon } from '@/services/cupones'

export const metadata = {
  title: 'Lanzamiento',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Panel de lanzamiento.
 *
 * Lista los cupones con su cupo, sus usos y su vigencia. Los códigos de la
 * promoción de lanzamiento son los que empiezan con `PROMO-`: cada uno es de un
 * solo uso y otorga 2 meses gratis, así que un código usado es un profesional
 * que ya está publicado sin pagar.
 */
export default async function PaginaLanzamiento() {
  await exigirAccesoPagina('lanzamiento')
  const { filas: cupones, pagina } = await listarCupones({ pagina: 1 })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Lanzamiento</h1>
      <p className="mt-2 text-muted">
        Métricas de apertura: cupones de la promoción y sus usos.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Cupones</h2>
        <p className="text-sm text-muted mb-4">
          Cupones de lanzamiento creados. Cada uno tiene un código, un cupo de
          usos y una vigencia opcional.
        </p>
        <ul className="divide-y divide-ink/30 border-y-[3px] border-ink">
          {cupones.length === 0 ? (
            <li className="py-6 text-muted">
              No hay cupones creados todavía.
            </li>
          ) : (
            cupones.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{c.codigo}</p>
                    <p className="text-sm text-muted">
                      {c.tipo}
                      {c.valor !== null ? ` (${c.valor})` : ''} ·
                      {c.usosRestantes} / {c.cupoMaximoUsos} cupos ·
                      {fechaHora(c.vigenteDesde)}
                    </p>
                    <span
                      className={`etiqueta ${
                        c.activo
                          ? 'bg-green-50 text-green-900 border-green-700'
                          : 'bg-red-50 text-red-900 border-red-700'
                      }`}
                    >
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4">
          <Paginacion pagina={pagina} base="/admin/lanzamiento" params={{}} />
        </div>
      </section>

      <p className="mt-10 text-xs text-muted">
        Fuente: tablas `Cupon` y `CuponRedencion`. Los códigos `PROMO-` otorgan 2
        meses gratis y son de un solo uso.
      </p>
    </div>
  )
}
