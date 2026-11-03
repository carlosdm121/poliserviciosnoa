import { notFound } from 'next/navigation'

import {
  adminAccionPerfil,
  adminAnularVoto,
  adminOcultarImagen,
  adminRevisarMatricula,
  adminResolverEmpresa,
  adminResolverRiesgoForm,
  adminVerificarWhatsapp,
} from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { fechaCorta, fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { perfilDetalleAdmin } from '@/services/admin'

export const metadata = { title: 'Perfil', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Detalle de un perfil.
 *
 * Todo lo que un moderador necesita para decidir sin abrir cinco pestañas:
 * datos, fotos, votos recientes, señales y reclamos. Las acciones están
 * separadas por tipo de decisión, no por entidad de base de datos.
 */
export default async function PaginaPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('perfiles')
  const { id } = await params
  const sp = await searchParams
  const perfil = await perfilDetalleAdmin(id)

  if (!perfil) notFound()

  const ruta = `/admin/perfiles/${perfil.id}`

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="etiqueta">{perfil.type === 'COMPANY' ? 'Empresa' : 'Persona'}</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">{perfil.name}</h1>
          {perfil.companyName ? <p className="text-muted">{perfil.companyName}</p> : null}
        </div>
        <div className="text-right text-sm">
          <p className="font-bold uppercase">{perfil.moderationStatus}</p>
          <p className="text-muted">{perfil.isPublished ? 'Publicado' : 'No publicado'}</p>
          <p className="text-muted">Alta {fechaCorta(perfil.createdAt)}</p>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <dl className="tarjeta space-y-2 p-4 text-sm">
          <div>
            <dt className="font-bold uppercase">Email</dt>
            <dd>{perfil.user.email}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase">WhatsApp</dt>
            <dd>
              {perfil.whatsappE164}{' '}
              <span className="etiqueta">
                {perfil.whatsappVerifiedAt ? 'Verificado' : 'Sin verificar'}
              </span>
            </dd>
            {perfil.whatsappVerifiedBy ? (
              <dd className="text-muted">por {perfil.whatsappVerifiedBy}</dd>
            ) : null}
          </div>
          <div>
            <dt className="font-bold uppercase">Ubicación</dt>
            <dd>
              {perfil.baseCity
                ? `${perfil.baseCity.name}, ${perfil.baseCity.province}`
                : 'Sin ciudad base'}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase">Cobertura</dt>
            <dd>
              {perfil.coverage.length === 0
                ? 'Solo ciudad base'
                : perfil.coverage.map((item) => item.city.name).join(', ')}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase">Rubros</dt>
            <dd>{perfil.categories.map((item) => item.category.name).join(', ') || '-'}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase">CUIT</dt>
            <dd>{perfil.cuit ?? '-'}</dd>
          </div>
          <div>
            <dt className="font-bold uppercase">Matrícula</dt>
            <dd>
              {perfil.licenseNumber ?? 'No informada'}
              {perfil.licenseReviewedAt ? (
                <span className="block text-muted">
                  Revisada {fechaHora(perfil.licenseReviewedAt)} por {perfil.licenseReviewedBy}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="font-bold uppercase">Suscripción</dt>
            <dd>
              {perfil.subscription
                ? `${perfil.subscription.status} · vence ${fechaCorta(perfil.subscription.currentPeriodEnd)}`
                : 'Sin suscripción'}
            </dd>
          </div>
        </dl>

        <div className="space-y-4">
          <section className="tarjeta p-4">
            <h2 className="font-black uppercase">Estado del perfil</h2>
            <form action={adminAccionPerfil} className="mt-3 space-y-2">
              <input type="hidden" name="profileId" value={perfil.id} />
              <input type="hidden" name="ruta" value={ruta} />
              <textarea
                name="motivo"
                className="campo"
                rows={2}
                placeholder="Motivo (obligatorio al rechazar o suspender)"
              />
              <div className="flex flex-wrap gap-2">
                <button name="accion" value="aprobar" className="btn-oscuro px-3 py-1 text-sm">
                  Aprobar y publicar
                </button>
                <button name="accion" value="rechazar" className="btn-linea px-3 py-1 text-sm">
                  Rechazar
                </button>
                <button name="accion" value="suspender" className="btn-linea px-3 py-1 text-sm">
                  Suspender
                </button>
                <button name="accion" value="reactivar" className="btn-linea px-3 py-1 text-sm">
                  Reactivar
                </button>
              </div>
            </form>
            {perfil.moderationReason ? (
              <p className="mt-3 text-sm text-muted">Último motivo: {perfil.moderationReason}</p>
            ) : null}
          </section>

          <section className="tarjeta p-4">
            <h2 className="font-black uppercase">Verificar WhatsApp a mano</h2>
            <p className="text-sm text-muted">
              Solo si el titular confirmó el número por otro canal. Queda registrado quién lo hizo.
            </p>
            <form action={adminVerificarWhatsapp} className="mt-3 space-y-2">
              <input type="hidden" name="profileId" value={perfil.id} />
              <input type="hidden" name="ruta" value={ruta} />
              <input name="motivo" className="campo" placeholder="Cómo se confirmó" required />
              <button className="btn-linea px-3 py-1 text-sm" type="submit">
                Marcar verificado
              </button>
            </form>
          </section>
        </div>
      </section>

      {perfil.companyDocumentKey ? (
        <section className="tarjeta mt-4 p-4">
          <h2 className="font-black uppercase">Constancia de inscripción</h2>
          <p className="text-sm text-muted">
            Archivo cargado. Al resolverlo se borra del almacenamiento.
          </p>
          <form action={adminResolverEmpresa} className="mt-3 space-y-2">
            <input type="hidden" name="profileId" value={perfil.id} />
            <input type="hidden" name="ruta" value={ruta} />
            <input name="motivo" className="campo" placeholder="Motivo del rechazo (si aplica)" />
            <div className="flex gap-2">
              <button name="decision" value="aprobar" className="btn-oscuro px-3 py-1 text-sm">
                Aprobar constancia
              </button>
              <button name="decision" value="rechazar" className="btn-linea px-3 py-1 text-sm">
                Rechazar
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {perfil.licenseNumber && !perfil.licenseReviewedAt ? (
        <section className="tarjeta mt-4 p-4">
          <h2 className="font-black uppercase">Revisar matrícula</h2>
          <form action={adminRevisarMatricula} className="mt-3 space-y-2">
            <input type="hidden" name="profileId" value={perfil.id} />
            <input type="hidden" name="ruta" value={ruta} />
            <input name="nota" className="campo" placeholder="Nota de la revisión (opcional)" />
            <button className="btn-oscuro px-3 py-1 text-sm" type="submit">
              Marcar revisada
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Fotos</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perfil.images.length === 0 ? (
            <li className="text-muted">Sin fotos cargadas.</li>
          ) : (
            perfil.images.map((imagen) => (
              <li key={imagen.id} className="tarjeta p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagen.url} alt="" className="h-40 w-full object-cover" />
                <form action={adminOcultarImagen} className="mt-2 space-y-2">
                  <input type="hidden" name="profileId" value={perfil.id} />
                  <input type="hidden" name="imageId" value={imagen.id} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input type="hidden" name="ocultar" value={imagen.isHidden ? 'false' : 'true'} />
                  <input
                    name="motivo"
                    className="campo"
                    placeholder={imagen.isHidden ? 'Motivo para mostrarla' : 'Por qué la ocultás'}
                    required
                  />
                  <button className="btn-linea w-full px-3 py-1 text-sm" type="submit">
                    {imagen.isHidden ? 'Mostrar de nuevo' : 'Ocultar'}
                  </button>
                </form>
                {imagen.hiddenReason ? (
                  <p className="mt-1 text-xs text-muted">{imagen.hiddenReason}</p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Votos recientes</h2>
        <ul className="mt-3 divide-y divide-ink/30 border-y-[3px] border-ink text-sm">
          {perfil.votes.length === 0 ? (
            <li className="py-3 text-muted">Sin votos.</li>
          ) : (
            perfil.votes.map((voto) => (
              <li key={voto.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {voto.client.email} · {fechaHora(voto.createdAt)}
                </span>
                <form action={adminAnularVoto} className="flex gap-2">
                  <input type="hidden" name="voteId" value={voto.id} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input name="motivo" className="campo w-56" placeholder="Motivo" required />
                  <button className="btn-linea px-3 py-1 text-sm" type="submit">
                    Anular
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </section>

      {perfil.riskSignals.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black uppercase">Señales de riesgo abiertas</h2>
          <ul className="mt-3 space-y-3">
            {perfil.riskSignals.map((senal) => (
              <li key={senal.id} className="tarjeta p-4">
                <p className="font-bold">{senal.type}</p>
                <p className="text-sm text-muted">{fechaHora(senal.createdAt)}</p>
                <form action={adminResolverRiesgoForm} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="signalId" value={senal.id} />
                  <input type="hidden" name="ruta" value={ruta} />
                  <input name="resolucion" className="campo max-w-md" placeholder="Cómo se resolvió" required />
                  <button className="btn-linea px-3 py-1 text-sm" type="submit">
                    Resolver
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {perfil.reclamos.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-black uppercase">Reclamos abiertos</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {perfil.reclamos.map((reclamo) => (
              <li key={reclamo.id} className="border-l-[6px] border-ink pl-3">
                <p className="font-bold">
                  {reclamo.tramiteNumber} · {reclamo.estado}
                </p>
                <p>{reclamo.motivo}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
