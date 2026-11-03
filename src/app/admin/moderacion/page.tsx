import { ComplaintStatus, ReportStatus } from '@prisma/client'
import Link from 'next/link'

import { adminResolverQueja, adminResolverReporte } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarQuejas, listarReportes } from '@/services/admin-moderacion'

export const metadata = { title: 'Moderación', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

function unoDe<T extends string>(valores: readonly T[], valor: string): T | '' {
  return valores.find((item) => item === valor) ?? ''
}

/**
 * Bandeja de moderación.
 *
 * Dos libros distintos: reportes anónimos sobre un perfil y quejas del libro
 * de visitantes. Se muestran por separado porque la decisión es distinta: un
 * reporte puede terminar en suspensión; una queja, en una respuesta.
 */
export default async function PaginaModeracion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('moderacion')
  const sp = await searchParams
  const vista = uno(sp.vista) === 'quejas' ? 'quejas' : 'reportes'
  const paginaPedida = uno(sp.pagina)
  const estado = uno(sp.estado)
  const estadoReporte = unoDe(Object.values(ReportStatus), estado)
  const estadoQueja = unoDe(Object.values(ComplaintStatus), estado)

  const reportes =
    vista === 'reportes'
      ? await listarReportes({
          estado: estadoReporte,
          pagina: Number(paginaPedida) || 1,
        })
      : null

  const quejas =
    vista === 'quejas'
      ? await listarQuejas({
          estado: estadoQueja,
          pagina: Number(paginaPedida) || 1,
        })
      : null

  const params = new URLSearchParams({ vista })
  if (estado) params.set('estado', estado)
  const ruta = `/admin/moderacion?${params.toString()}`

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Moderación</h1>
      <p className="mt-2 text-muted">
        Las fotos y los votos se resuelven desde el detalle del perfil, no desde acá.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <nav className="mt-6 flex gap-2 border-b-[3px] border-ink" aria-label="Tipo de bandeja">
        <Link
          href="/admin/moderacion"
          className={`px-4 py-2 text-sm font-bold uppercase ${
            vista === 'reportes' ? 'bg-ink text-paper' : 'hover:bg-ink/10'
          }`}
        >
          Reportes
        </Link>
        <Link
          href="/admin/moderacion?vista=quejas"
          className={`px-4 py-2 text-sm font-bold uppercase ${
            vista === 'quejas' ? 'bg-ink text-paper' : 'hover:bg-ink/10'
          }`}
        >
          Libro de quejas
        </Link>
      </nav>

      {reportes ? (
        <section className="mt-6">
          <ul className="space-y-3">
            {reportes.filas.length === 0 ? (
              <li className="tarjeta p-6 text-muted">No hay reportes.</li>
            ) : (
              reportes.filas.map((reporte) => (
                <li key={reporte.id} className="tarjeta p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl">
                      <p className="font-black">
                        {reporte.reason} · <span className="etiqueta">{reporte.status}</span>
                      </p>
                      <Link
                        className="underline underline-offset-2"
                        href={`/admin/perfiles/${reporte.profile.id}`}
                      >
                        {reporte.profile.name}
                      </Link>
                      <p className="text-sm text-muted">
                        {reporte.profile.user.email} · {fechaHora(reporte.createdAt)}
                      </p>
                      {reporte.detail ? <p className="mt-2 text-sm">{reporte.detail}</p> : null}
                      {reporte.resolution ? (
                        <p className="mt-1 text-sm text-muted">Resolución: {reporte.resolution}</p>
                      ) : null}
                    </div>

                    <form action={adminResolverReporte} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="reportId" value={reporte.id} />
                      <input type="hidden" name="ruta" value={ruta} />
                      <select name="estado" className="campo w-40" defaultValue="EN_REVISION">
                        <option value="EN_REVISION">En revisión</option>
                        <option value="RESUELTO">Resuelto</option>
                        <option value="DESCARTADO">Descartado</option>
                      </select>
                      <input name="resolucion" className="campo w-64" placeholder="Qué se hizo" required />
                      <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                        Guardar
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="mt-4">
            <Paginacion
              pagina={reportes.pagina}
              base="/admin/moderacion"
              params={{ vista: 'reportes', estado }}
            />
          </div>
        </section>
      ) : null}

      {quejas ? (
        <section className="mt-6">
          <ul className="space-y-3">
            {quejas.filas.length === 0 ? (
              <li className="tarjeta p-6 text-muted">No hay quejas.</li>
            ) : (
              quejas.filas.map((queja) => (
                <li key={queja.id} className="tarjeta p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-xl">
                      <p className="font-black">
                        {queja.name} · <span className="etiqueta">{queja.status}</span>
                      </p>
                      <p className="text-sm text-muted">
                        {queja.email} {queja.phone ? `· ${queja.phone}` : ''} ·{' '}
                        {fechaHora(queja.createdAt)}
                      </p>
                      {queja.reference ? (
                        <p className="text-sm">Referencia: {queja.reference}</p>
                      ) : null}
                      <p className="mt-2 whitespace-pre-line text-sm">{queja.message}</p>
                    </div>

                    <form action={adminResolverQueja} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="complaintId" value={queja.id} />
                      <input type="hidden" name="ruta" value={ruta} />
                      <select name="estado" className="campo w-40" defaultValue="EN_REVISION">
                        <option value="EN_REVISION">En revisión</option>
                        <option value="RESUELTO">Resuelto</option>
                      </select>
                      <input name="resolucion" className="campo w-64" placeholder="Qué se hizo" required />
                      <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                        Guardar
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="mt-4">
            <Paginacion
              pagina={quejas.pagina}
              base="/admin/moderacion"
              params={{ vista: 'quejas', estado }}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}




