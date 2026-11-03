import Link from 'next/link'

import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import {
  contadorSociosFundadores,
  listarCupones,
  type FilaCupon,
} from '@/services/cupones'

/**
 * Código del cupón de socios fundadores.
 *
 * El admin lo crea desde este mismo panel con el código que elija. Este valor
 * es el que se consulta para mostrar el contador público; si cambia, hay que
 * actualizarlo acá y en cualquier lugar que lo lea.
 */
const CUPON_SOCIOS_FUNDADORES = process.env.CUPON_SOCIOS_FUNDADORES ?? 'SOCIO_FUNDADOR'

export const metadata = {
  title: 'Lanzamiento',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Panel de lanzamiento.
 *
 * Métricas para los primeros días: cuántos socios fundadores quedan, cuántos
 * cupones se crearon y cuántos se usaron. Es de solo lectura; crear y editar
 * cupones se hace desde esta misma pantalla en un futuro cercano. Por ahora se
 * muestra la lista y el contador.
 */
export default async function PaginaLanzamiento() {
  await exigirAccesoPagina('lanzamiento')
  const [{ filas: cupones, pagina }, socios] = await Promise.all([
    listarCupones({ pagina: 1 }),
    contadorSociosFundadores(CUPON_SOCIOS_FUNDADORES),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Lanzamiento</h1>
      <p className="mt-2 text-muted">
        Métricas de apertura: cupones, socios fundadores y referidos.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Socios fundadores</h2>
        <p className="text-sm text-muted mb-4">
          Los primeros {socios.cupoMaximo} profesionales que usen el cupón
          <code className="font-mono">{CUPON_SOCIOS_FUNDADORES}</code> se llevan
          el primer mes gratis y el precio congelado.
        </p>
        <div className="tarjeta p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-black">{socios.usados}</p>
              <p className="text-sm text-muted">de {socios.cupoMaximo} cupos usados</p>
            </div>
            <div>
              <p className="font-black text-green-900">{socios.restantes}</p>
              <p className="text-sm text-muted">cupos restantes</p>
            </div>
          </div>
          {socios.restantes === 0 && (
            <p className="mt-3 text-sm text-red-900 font-bold">
              Se agotaron los cupos de socio fundador.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
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
                      {c.tipo} ·
                      {c.valor !== null ? `${c.valor}%` : 'mes gratis'} ·
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
        Fuente: tabla `Cupon` y `CuponRedencion`. Un socio fundador es cualquier
        perfil que canjeó un cupón de tipo MES_GRATIS.
      </p>
    </div>
  )
}
