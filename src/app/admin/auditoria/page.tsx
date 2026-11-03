import Link from 'next/link'

import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarAuditoria } from '@/services/auditoria'

export const metadata = { title: 'Auditoría', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Auditoría.
 *
 * Solo lectura: una fila de auditoría no se edita ni se borra. Si el registro
 * se pudiera tocar, dejaría de servir para lo único que sirve, que es
 * reconstruir qué pasó cuando dos personas recuerdan distinto.
 */
export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('auditoria')
  const sp = await searchParams
  const accion = uno(sp.accion)
  const actorEmail = uno(sp.actorEmail)
  const paginaPedida = uno(sp.pagina)

  const { filas, pagina } = await listarAuditoria({
    accion,
    actorEmail,
    pagina: Number(paginaPedida) || 1,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Auditoría</h1>
      <p className="mt-2 text-muted">
        Cada acción del panel deja una fila. No se puede editar ni borrar desde acá.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-xs font-bold uppercase">Acción</span>
          <input name="accion" defaultValue={accion} className="campo" placeholder="perfil.suspender" />
        </label>
        <label>
          <span className="block text-xs font-bold uppercase">Actor</span>
          <input name="actorEmail" defaultValue={actorEmail} className="campo" placeholder="email" />
        </label>
        <button className="btn-oscuro" type="submit">
          Filtrar
        </button>
        <Link className="btn-linea" href="/admin/auditoria">
          Limpiar
        </Link>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b-[3px] border-ink text-left uppercase">
              <th className="p-2">Cuándo</th>
              <th className="p-2">Actor</th>
              <th className="p-2">Acción</th>
              <th className="p-2">Entidad</th>
              <th className="p-2">Antes / después</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  No hay registros con esos filtros.
                </td>
              </tr>
            ) : (
              filas.map((fila) => (
                <tr key={fila.id} className="border-b border-ink/30 align-top">
                  <td className="whitespace-nowrap p-2">{fechaHora(fila.createdAt)}</td>
                  <td className="p-2">{fila.actorEmail}</td>
                  <td className="p-2 font-bold">{fila.action}</td>
                  <td className="p-2">
                    {fila.entityType}
                    {fila.entityId ? (
                      <span className="block break-all text-xs text-muted">{fila.entityId}</span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <details>
                      <summary className="cursor-pointer text-xs font-bold uppercase">Ver</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto bg-ink/5 p-2 text-xs">
                        {JSON.stringify({ antes: fila.before, despues: fila.after }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Paginacion pagina={pagina} base="/admin/auditoria" params={{ accion, actorEmail }} />
      </div>
    </div>
  )
}
