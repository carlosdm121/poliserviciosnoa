import Link from 'next/link'

import { adminBloquearForm, adminDesbloquearForm, adminResolverRiesgoForm } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarSenalesRiesgo } from '@/services/admin-moderacion'
import { listarBloqueos, type TipoBloqueo } from '@/services/bloqueo'

export const metadata = { title: 'Riesgo y bloqueos', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const TIPOS_BLOQUEO: Record<TipoBloqueo, string> = {
  EMAIL: 'Email',
  WHATSAPP_HASH: 'WhatsApp',
  CUIT_HASH: 'CUIT',
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Señales de riesgo y lista de bloqueo.
 *
 * Las señales se resuelven con una nota: una señal cerrada sin explicación no
 * le sirve a nadie seis meses después. La lista de bloqueo guarda hashes, así
 * que para desbloquear hay que escribir el dato original otra vez.
 */
export default async function PaginaRiesgos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('riesgos')
  const sp = await searchParams
  const paginaPedida = uno(sp.pagina)
  const [{ filas, pagina }, bloqueos] = await Promise.all([
    listarSenalesRiesgo({ pagina: Number(paginaPedida) || 1 }),
    listarBloqueos(),
  ])
  const ruta = paginaPedida ? `/admin/riesgos?pagina=${paginaPedida}` : '/admin/riesgos'

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Riesgo y bloqueos</h1>
      <p className="mt-2 text-muted">
        Señales automáticas del alta y de la actividad. No son pruebas: son motivos para mirar.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Señales abiertas</h2>
        <ul className="mt-3 space-y-3">
          {filas.length === 0 ? (
            <li className="tarjeta p-6 text-muted">No hay señales abiertas.</li>
          ) : (
            filas.map((senal) => (
              <li key={senal.id} className="tarjeta p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{senal.type}</p>
                    <Link
                      className="underline underline-offset-2"
                      href={`/admin/perfiles/${senal.profile.id}`}
                    >
                      {senal.profile.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {senal.profile.user.email} · {senal.profile.whatsappE164} ·{' '}
                      {fechaHora(senal.createdAt)}
                    </p>
                    <pre className="mt-2 max-w-full overflow-x-auto bg-ink/5 p-2 text-xs">
                      {JSON.stringify(senal.details, null, 2)}
                    </pre>
                  </div>

                  <form action={adminResolverRiesgoForm} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="signalId" value={senal.id} />
                    <input type="hidden" name="ruta" value={ruta} />
                    <input name="resolucion" className="campo w-64" placeholder="Cómo se resolvió" required />
                    <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                      Resolver
                    </button>
                  </form>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4">
          <Paginacion pagina={pagina} base="/admin/riesgos" params={{}} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black uppercase">Bloquear un identificador</h2>
        <p className="text-sm text-muted">
          Se guarda hasheado. Al bloquear un email o un WhatsApp, esa persona no puede volver a
          registrarse con el mismo dato.
        </p>
        <form action={adminBloquearForm} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <input type="hidden" name="ruta" value={ruta} />
          <select name="tipo" className="campo" defaultValue="EMAIL">
            {Object.entries(TIPOS_BLOQUEO).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
          <input name="valor" className="campo" placeholder="Email, WhatsApp o CUIT" required />
          <input name="motivo" className="campo" placeholder="Motivo" required />
          <button className="btn-oscuro" type="submit">
            Bloquear
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Lista de bloqueo</h2>
        <ul className="mt-3 divide-y divide-ink/30 border-y-[3px] border-ink text-sm">
          {bloqueos.length === 0 ? (
            <li className="py-4 text-muted">No hay identificadores bloqueados.</li>
          ) : (
            bloqueos.map((bloqueo) => (
              <li
                key={`${bloqueo.type}-${bloqueo.createdAt.toISOString()}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <span className="etiqueta">
                    {TIPOS_BLOQUEO[bloqueo.type as TipoBloqueo] ?? bloqueo.type}
                  </span>
                  <p className="mt-1">{bloqueo.reason}</p>
                  <p className="text-xs text-muted">
                    {fechaHora(bloqueo.createdAt)} · por {bloqueo.createdBy}
                  </p>
                </div>

                <form action={adminDesbloquearForm} className="flex gap-2">
                  <input type="hidden" name="tipo" value={bloqueo.type} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input name="valor" className="campo w-56" placeholder="Dato original" required />
                  <button className="btn-linea px-3 py-1 text-sm" type="submit">
                    Desbloquear
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
