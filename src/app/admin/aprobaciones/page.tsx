import Link from 'next/link'

import { adminAccionPerfil } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaCorta } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarAprobaciones } from '@/services/admin'

export const metadata = { title: 'Aprobaciones', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Días que lleva un perfil esperando aprobación. Se usa para priorizar:
 * quien lleva más tiempo, primero.
 */
function diasPendiente(creadoEn: Date): number {
  return Math.max(0, Math.floor((Date.now() - creadoEn.getTime()) / 86_400_000))
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Cola de altas.
 *
 * Se ordena de la más vieja a la más nueva: la persona que esperó tres días
 * tiene prioridad sobre la que se registró hace una hora.
 */
export default async function PaginaAprobaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('aprobaciones')
  const sp = await searchParams
  const paginaPedida = uno(sp.pagina)
  const { filas, pagina } = await listarAprobaciones(Number(paginaPedida) || 1)
  const ruta = paginaPedida ? `/admin/aprobaciones?pagina=${paginaPedida}` : '/admin/aprobaciones'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Altas por aprobar</h1>
      <p className="mt-2 text-muted">
        Solo aparecen acá si la revisión manual está activada. Aprobar publica el perfil.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <ul className="mt-6 space-y-4">
        {filas.length === 0 ? (
          <li className="tarjeta p-6 text-muted">No hay altas esperando revisión.</li>
        ) : (
          filas.map((fila) => (
            <li key={fila.id} className="tarjeta p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="text-lg font-black underline underline-offset-2" href={`/admin/perfiles/${fila.id}`}>
                    {fila.name}
                  </Link>
                  <p className="text-sm">
                    {fila.user.email} · {fila.whatsappE164}{' '}
                    <span className="etiqueta">
                      {fila.whatsappVerifiedAt ? 'WhatsApp verificado' : 'Sin verificar'}
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    {fila.type === 'COMPANY' ? fila.companyName ?? 'Empresa' : 'Persona'} ·{' '}
                    {fila.baseCity ? `${fila.baseCity.name}, ${fila.baseCity.province}` : 'Sin ciudad'} ·{' '}
                    Alta {fechaCorta(fila.createdAt)}{' '}
                    {diasPendiente(fila.createdAt) > 0 && (
                      <>
                        ·{' '}
                        <span
                          className={`etiqueta ${
                            diasPendiente(fila.createdAt) > 2
                              ? 'bg-red-50 text-red-900 border-red-700'
                              : 'bg-amber-50 text-amber-900 border-amber-700'
                          }`}
                        >
                          hace {diasPendiente(fila.createdAt)} día{
                            diasPendiente(fila.createdAt) !== 1 ? 's' : ''
                          } pendiente
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <form action={adminAccionPerfil} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="profileId" value={fila.id} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input name="motivo" className="campo w-64" placeholder="Motivo si rechazás" />
                  <button name="accion" value="aprobar" className="btn-oscuro px-3 py-2 text-sm">
                    Aprobar
                  </button>
                  <button name="accion" value="rechazar" className="btn-linea px-3 py-2 text-sm">
                    Rechazar
                  </button>
                </form>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="mt-6">
        <Paginacion pagina={pagina} base="/admin/aprobaciones" params={{}} />
      </div>
    </div>
  )
}
