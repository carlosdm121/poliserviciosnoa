import { ModerationStatus, ProfileType, Province, SubscriptionStatus } from '@prisma/client'
import Link from 'next/link'

import { adminAccionPerfil } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaCorta } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarPerfilesAdmin } from '@/services/admin'

export const metadata = { title: 'Perfiles', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const TIPOS: Record<ProfileType, string> = {
  PERSON: 'Persona',
  COMPANY: 'Empresa',
}

const MODERACION: Record<ModerationStatus, string> = {
  PENDING_REVIEW: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
}

const PROVINCIAS: Record<Province, string> = {
  TUCUMAN: 'Tucumán',
  SALTA: 'Salta',
  SANTIAGO_DEL_ESTERO: 'Santiago del Estero',
  CATAMARCA: 'Catamarca',
  JUJUY: 'Jujuy',
}

const SUSCRIPCION: Record<SubscriptionStatus, string> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Activa',
  PAST_DUE: 'En mora',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

function unoDe<T extends string>(valores: readonly T[], valor: string): T | '' {
  return valores.find((item) => item === valor) ?? ''
}

const SUSCRIPCIONES = [...Object.values(SubscriptionStatus), 'SIN_SUSCRIPCION'] as const

export default async function PaginaPerfiles({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('perfiles')
  const sp = await searchParams

  const q = uno(sp.q)
  const tipo = unoDe(Object.values(ProfileType), uno(sp.tipo))
  const provincia = unoDe(Object.values(Province), uno(sp.provincia))
  const moderacion = unoDe(Object.values(ModerationStatus), uno(sp.moderacion))
  const suscripcion = unoDe(SUSCRIPCIONES, uno(sp.suscripcion))
  const whatsapp = unoDe(['SI', 'NO'] as const, uno(sp.whatsapp))
  const paginaPedida = uno(sp.pagina)

  const { filas, pagina } = await listarPerfilesAdmin({
    q,
    tipo,
    provincia,
    moderacion,
    suscripcion,
    whatsapp,
    pagina: Number(paginaPedida) || 1,
  })

  const ruta = `/admin/perfiles?${new URLSearchParams(
    Object.entries({ q, tipo, provincia, moderacion, suscripcion, whatsapp, pagina: paginaPedida }).filter(
      ([, valor]) => valor,
    ) as [string, string][],
  ).toString()}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Perfiles</h1>
      <p className="mt-2 text-muted">
        Buscar, revisar y suspender. La suspensión pide motivo y se le muestra al profesional.
      </p>

      <div className="mt-4 space-y-3">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <form method="get" className="mt-6 grid gap-3 border-[3px] border-ink p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-sm font-bold uppercase">Buscar</span>
          <input name="q" defaultValue={q} className="campo" placeholder="Nombre, email, WhatsApp" />
        </label>

        <label>
          <span className="mb-1 block text-sm font-bold uppercase">Tipo</span>
          <select name="tipo" defaultValue={tipo} className="campo">
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-bold uppercase">Provincia</span>
          <select name="provincia" defaultValue={provincia} className="campo">
            <option value="">Todas</option>
            {Object.entries(PROVINCIAS).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-bold uppercase">Moderación</span>
          <select name="moderacion" defaultValue={moderacion} className="campo">
            <option value="">Todas</option>
            {Object.entries(MODERACION).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-bold uppercase">Suscripción</span>
          <select name="suscripcion" defaultValue={suscripcion} className="campo">
            <option value="">Todas</option>
            <option value="SIN_SUSCRIPCION">Sin suscripción</option>
            {Object.entries(SUSCRIPCION).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-bold uppercase">WhatsApp</span>
          <select name="whatsapp" defaultValue={whatsapp} className="campo">
            <option value="">Todos</option>
            <option value="SI">Verificado</option>
            <option value="NO">Sin verificar</option>
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button className="btn-oscuro flex-1" type="submit">
            Filtrar
          </button>
          <Link className="btn-linea" href="/admin/perfiles">
            Limpiar
          </Link>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b-[3px] border-ink text-left uppercase">
              <th className="p-2">Perfil</th>
              <th className="p-2">Contacto</th>
              <th className="p-2">Ubicación</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Suscripción</th>
              <th className="p-2">Alta</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted">
                  No hay perfiles con esos filtros.
                </td>
              </tr>
            ) : (
              filas.map((fila) => (
                <tr key={fila.id} className="border-b border-ink/30 align-top">
                  <td className="p-2">
                    <Link className="font-bold underline underline-offset-2" href={`/admin/perfiles/${fila.id}`}>
                      {fila.name}
                    </Link>
                    {fila.companyName ? (
                      <span className="block text-muted">{fila.companyName}</span>
                    ) : null}
                    <span className="etiqueta mt-1">{TIPOS[fila.type]}</span>
                  </td>
                  <td className="p-2">
                    <span className="block">{fila.email}</span>
                    <span className="block text-muted">{fila.whatsappE164}</span>
                    <span className="etiqueta mt-1">
                      {fila.whatsappVerifiedAt ? 'WhatsApp verificado' : 'Sin verificar'}
                    </span>
                  </td>
                  <td className="p-2">
                    {fila.ciudad ?? '-'}
                    <span className="block text-muted">
                      {fila.provincia ? PROVINCIAS[fila.provincia] : '-'}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="etiqueta">{MODERACION[fila.moderationStatus]}</span>
                    <span className="mt-1 block text-muted">
                      {fila.isPublished ? 'Publicado' : 'No publicado'}
                    </span>
                  </td>
                  <td className="p-2">
                    {fila.suscripcion ? SUSCRIPCION[fila.suscripcion] : 'Sin suscripción'}
                    {fila.vence ? (
                      <span className="block text-muted">Vence {fechaCorta(fila.vence)}</span>
                    ) : null}
                  </td>
                  <td className="p-2">{fechaCorta(fila.createdAt)}</td>
                  <td className="p-2">
                    <details>
                      <summary className="cursor-pointer font-bold">Cambiar estado</summary>
                      <form action={adminAccionPerfil} className="mt-2 space-y-2">
                        <input type="hidden" name="profileId" value={fila.id} />
                        <input type="hidden" name="ruta" value={ruta} />
                        <input
                          name="motivo"
                          className="campo"
                          placeholder="Motivo (obligatorio al suspender)"
                          required
                        />
                        <div className="flex flex-wrap gap-2">
                          {fila.moderationStatus === 'SUSPENDED' || fila.moderationStatus === 'REJECTED' ? (
                            <button name="accion" value="reactivar" className="btn-linea px-3 py-1 text-sm">
                              Reactivar
                            </button>
                          ) : (
                            <button name="accion" value="suspender" className="btn-oscuro px-3 py-1 text-sm">
                              Suspender
                            </button>
                          )}
                        </div>
                      </form>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Paginacion
          pagina={pagina}
          base="/admin/perfiles"
          params={{ q, tipo, provincia, moderacion, suscripcion, whatsapp }}
        />
      </div>
    </div>
  )
}

