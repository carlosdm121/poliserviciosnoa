import Link from 'next/link'

import { adminResolverEmpresa } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaCorta } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarEmpresasPendientes } from '@/services/admin'

export const metadata = { title: 'Empresas', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Constancias de inscripción.
 *
 * El archivo es privado: no se muestra embebido porque un PDF subido por un
 * tercero no es contenido confiable. Se abre en otra pestaña y se resuelve.
 */
export default async function PaginaEmpresas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('empresas')
  const sp = await searchParams
  const paginaPedida = uno(sp.pagina)
  const { filas, pagina } = await listarEmpresasPendientes(Number(paginaPedida) || 1)
  const ruta = paginaPedida ? `/admin/empresas?pagina=${paginaPedida}` : '/admin/empresas'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Constancias de empresa</h1>
      <p className="mt-2 text-muted">
        Al aprobar o rechazar se borra el archivo. La decisión queda en la auditoría.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <ul className="mt-6 space-y-4">
        {filas.length === 0 ? (
          <li className="tarjeta p-6 text-muted">No hay constancias pendientes.</li>
        ) : (
          filas.map((fila) => (
            <li key={fila.id} className="tarjeta p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="text-lg font-black underline underline-offset-2" href={`/admin/perfiles/${fila.id}`}>
                    {fila.companyName ?? fila.name}
                  </Link>
                  <p className="text-sm">
                    {fila.name} · {fila.user.email}
                  </p>
                  <p className="text-sm text-muted">
                    CUIT {fila.cuit ?? '-'} · Alta {fechaCorta(fila.createdAt)}
                  </p>
                  {fila.companyDocumentKey ? (
                    <p className="mt-1 break-all text-xs text-muted">
                      Archivo: {fila.companyDocumentKey}
                    </p>
                  ) : null}
                </div>

                <form action={adminResolverEmpresa} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="profileId" value={fila.id} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input name="motivo" className="campo w-64" placeholder="Motivo si rechazás" />
                  <button name="decision" value="aprobar" className="btn-oscuro px-3 py-2 text-sm">
                    Aprobar
                  </button>
                  <button name="decision" value="rechazar" className="btn-linea px-3 py-2 text-sm">
                    Rechazar
                  </button>
                </form>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="mt-6">
        <Paginacion pagina={pagina} base="/admin/empresas" params={{}} />
      </div>
    </div>
  )
}
