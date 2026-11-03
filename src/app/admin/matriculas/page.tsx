import Link from 'next/link'

import { adminRevisarMatricula } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaCorta, fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarMatriculas } from '@/services/admin'

export const metadata = { title: 'Matrículas', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Matrículas informadas.
 *
 * El sitio no valida contra el colegio: deja constancia de que alguien miró el
 * número. La fecha y el autor de esa revisión son el dato que importa.
 */
export default async function PaginaMatriculas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('matriculas')
  const sp = await searchParams
  const paginaPedida = uno(sp.pagina)
  const { filas, pagina } = await listarMatriculas(Number(paginaPedida) || 1)
  const ruta = paginaPedida ? `/admin/matriculas?pagina=${paginaPedida}` : '/admin/matriculas'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Matrículas</h1>
      <p className="mt-2 text-muted">
        Revisar no valida la matrícula: deja registro de quién la miró y cuándo.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <ul className="mt-6 space-y-3">
        {filas.length === 0 ? (
          <li className="tarjeta p-6 text-muted">No hay matrículas informadas.</li>
        ) : (
          filas.map((fila) => (
            <li key={fila.id} className="tarjeta p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="font-black underline underline-offset-2" href={`/admin/perfiles/${fila.id}`}>
                    {fila.companyName ?? fila.name}
                  </Link>
                  <p className="text-sm">
                    {fila.user.email} · Alta {fechaCorta(fila.createdAt)}
                  </p>
                  <p className="text-sm">
                    Matrícula <strong>{fila.licenseNumber}</strong>
                  </p>
                  <p className="text-xs text-muted">
                    {fila.categories
                      .map((item) => `${item.category.name} (${item.category.licenseLabel ?? 'matrícula'})`)
                      .join(', ') || 'Sin rubro que la exija'}
                  </p>
                </div>

                <div className="text-right text-sm">
                  {fila.licenseReviewedAt ? (
                    <p className="text-muted">
                      Revisada {fechaHora(fila.licenseReviewedAt)}
                      <br />
                      por {fila.licenseReviewedBy}
                    </p>
                  ) : (
                    <form action={adminRevisarMatricula} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="profileId" value={fila.id} />
                      <input type="hidden" name="ruta" value={ruta} />
                      <input name="nota" className="campo w-48" placeholder="Nota" />
                      <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                        Marcar revisada
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="mt-6">
        <Paginacion pagina={pagina} base="/admin/matriculas" params={{}} />
      </div>
    </div>
  )
}
