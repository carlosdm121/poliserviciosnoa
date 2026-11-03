import Link from 'next/link'

import { preciosCrearAumento, preciosCancelarAumento, preciosListarAumentos } from '@/app/actions/precios'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaCorta } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { formatArs } from '@/lib/dinero'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Precios', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaPrecios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('precios')
  const sp = await searchParams

  const estado = uno(sp.estado)
  const paginaPedida = uno(sp.pagina)

  const [planes, aumentos] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ vigenteDesde: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, amount: true },
    }),
    preciosListarAumentos({
      estado: estado || undefined,
      pagina: Number(paginaPedida) || 1,
    }),
  ])

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  const ruta = `/admin/precios?${params.toString()}`

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Precios</h1>
      <p className="mt-2 text-muted">
        Los aumentos de precio se programan con aviso previo: los suscriptores
        reciben un email con al menos 30 días de antelación antes de que se
        aplique el nuevo monto.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      {/* Formulario de aumento */}
      <section className="mt-8 tarjeta p-5">
        <h2 className="text-xl font-black uppercase mb-4">Programar aumento de precio</h2>
        <form action={preciosCrearAumento} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="ruta" value={ruta} />

          <div className="col-span-1 sm:col-span-2">
            <label className="block mb-2 font-bold uppercase text-sm">Plan</label>
            <select name="planId" className="campo w-full" required>
              <option value="">Elegí un plan</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatArs(plan.amount)}/mes
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-2 font-bold uppercase text-sm">
              Nuevo monto
            </label>
            <input
              name="montoNuevo"
              type="number"
              min="0"
              step="0.01"
              className="campo w-full"
              placeholder="Ejemplo: 12000"
              required
            />
          </div>

          <div>
            <label className="block mb-2 font-bold uppercase text-sm">
              Fecha de aplicación
            </label>
            <input
              name="fechaAplicacion"
              type="date"
              className="campo w-full"
              required
              min={fechaMinima()}
            />
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="block mb-2 font-bold uppercase text-sm">
              Motivo (opcional)
            </label>
            <textarea
              name="motivo"
              rows={2}
              className="campo w-full"
              placeholder="Por ejemplo: ajuste por inflación."
            ></textarea>
          </div>

          <button className="btn-oscuro px-4 py-3 text-base font-bold uppercase" type="submit">
            Programar aumento
          </button>
        </form>

        <p className="mt-3 text-sm text-muted">
          El aviso a los suscriptores se envía automáticamente 30 días antes de
          la fecha de aplicación. Los suscriptores con precio congelado (socios
          fundadores) no cambian de monto.
        </p>
      </section>

      {/* Lista de aumentos */}
      <section className="mt-8">
        <h2 className="text-xl font-black uppercase mb-4">Aumentos programados</h2>

        <div className="mt-4 flex gap-2">
          <select
            name="estado"
            onChange={(e) => {
              const valor = (e.target as HTMLSelectElement).value
              const siguiente = new URLSearchParams(params)
              if (valor) siguiente.set('estado', valor)
              else siguiente.delete('estado')
              window.location.href = `/admin/precios?${siguiente.toString()}`
            }}
            className="campo w-48"
          >
            <option value="">Todos los estados</option>
            <option value="PROGRAMADO" selected={estado === 'PROGRAMADO'}>
              Programado
            </option>
            <option value="AVISADO" selected={estado === 'AVISADO'}>
              Avisado
            </option>
            <option value="APLICADO" selected={estado === 'APLICADO'}>
              Aplicado
            </option>
            <option value="CANCELADO" selected={estado === 'CANCELADO'}>
              Cancelado
            </option>
          </select>
        </div>

        <ul className="mt-6 space-y-3">
          {aumentos.filas.length === 0 ? (
            <li className="tarjeta p-6 text-muted">No hay aumentos programados.</li>
          ) : (
            aumentos.filas.map((aumento) => (
              <li key={aumento.id} className="tarjeta p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <p className="font-black">
                      {aumento.planNombre} — <span className="etiqueta">{aumento.estado}</span>
                    </p>
                    <p className="text-sm text-muted">
                      De {formatArs(aumento.montoAnterior)} a{' '}
                      <span className="font-bold">{formatArs(aumento.montoNuevo)}</span>
                      por mes · Avisado{' '}
                      <span className="font-bold">{fechaCorta(aumento.fechaAviso)}</span> ·{' '}
                      Se aplica{' '}
                      <span className="font-bold">{fechaCorta(aumento.fechaAplicacion)}</span>
                    </p>
                    {aumento.motivo ? (
                      <p className="mt-1 text-sm whitespace-pre-line">{aumento.motivo}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">
                      Programado por {aumento.creadoPor ?? '—'} el{' '}
                      {fechaCorta(aumento.creadoEn)}
                    </p>
                    {aumento.avisadaEn ? (
                      <p className="mt-1 text-sm">
                        Aviso enviado: {fechaCorta(aumento.avisadaEn)}
                      </p>
                    ) : null}
                    {aumento.aplicadaEn ? (
                      <p className="mt-1 text-sm">
                        Aplicado: {fechaCorta(aumento.aplicadaEn)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {aumento.estado === 'PROGRAMADO' || aumento.estado === 'AVISADO' ? (
                      <form action={preciosCancelarAumento} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="aumentoId" value={aumento.id} />
                        <input type="hidden" name="ruta" value={ruta} />
                        <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                          Cancelar
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4">
          <Paginacion
            pagina={aumentos.pagina}
            base="/admin/precios"
            params={{ ...(estado ? { estado } : {}) }}
          />
        </div>
      </section>
    </div>
  )
}

function fechaMinima(): string {
  const hoy = new Date()
  hoy.setUTCDate(hoy.getUTCDate() + 30)
  return hoy.toISOString().slice(0, 10)
}
