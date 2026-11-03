import Link from 'next/link'

import {
  soporteAsignarTicket,
  soporteCambiarEstado,
  soporteCerrarTicket,
  soporteResponderTicket,
} from '@/app/actions/soporte'
import { Aviso } from '@/components/admin/Aviso'
import { Paginacion } from '@/components/admin/Paginacion'
import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarTickets, listarPlantillas } from '@/services/soporte'
import { prisma } from '@/lib/prisma'
import { ETIQUETA_CATEGORIA, ETIQUETA_ESTADO_TICKET, ETIQUETA_PRIORIDAD } from '@/lib/soporte'

export const metadata = { title: 'Soporte', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

function unoDe<T extends string>(valores: readonly T[], valor: string): T | '' {
  return valores.find((item) => item === valor) ?? ''
}

export default async function BandejaSoporte({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('soporte')
  const sp = await searchParams

  const estado = unoDe(
    ['ABIERTO', 'EN_CURSO', 'RESUELTO'],
    uno(sp.estado),
  )
  const categoria = unoDe(
    ['VERIFICACION_WHATSAPP', 'PAGO', 'PERFIL', 'PUBLICACION', 'OTRO'],
    uno(sp.categoria),
  )
  const asignadoA = uno(sp.asignadoA)
  const q = uno(sp.q)
  const paginaPedida = uno(sp.pagina)

  const [tickets, plantillas, equipo] = await Promise.all([
    listarTickets({
      estado: estado || undefined,
      categoria: categoria || undefined,
      asignadoA: asignadoA || undefined,
      q: q || undefined,
      pagina: Number(paginaPedida) || 1,
    }),
    listarPlantillas(),
    prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MODERADOR'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true },
    }),
  ])

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (categoria) params.set('categoria', categoria)
  if (asignadoA) params.set('asignadoA', asignadoA)
  if (q) params.set('q', q)
  const ruta = `/admin/soporte?${params.toString()}`

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Soporte</h1>
      <p className="mt-2 text-muted">
        Tickets abiertos por clientes y profesionales. Cada número de trámite
        se informa al cliente por email cuando abre el ticket.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      {/* Filtros */}
      <form className="mt-6 grid gap-3 sm:grid-cols-4" action="#" method="GET">
        <select name="estado" className="campo w-full">
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO_TICKET).map(([valor, etiqueta]) => (
            <option key={valor} value={valor} selected={estado === valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select name="categoria" className="campo w-full">
          <option value="">Todas las categorías</option>
          {Object.entries(ETIQUETA_CATEGORIA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor} selected={categoria === valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select name="asignadoA" className="campo w-full">
          <option value="">Sin asignar / todos</option>
          {equipo.map((integrante) => (
            <option
              key={integrante.id}
              value={integrante.id}
              selected={asignadoA === integrante.id}
            >
              {integrante.name ?? integrante.email} ({integrante.role})
            </option>
          ))}
        </select>
        <div className="flex items-end">
          <input
            name="q"
            value={q}
            className="campo w-full"
            placeholder="Buscá trámite, asunto o email…"
          />
        </div>
      </form>

      {/* Lista */}
      <ul className="mt-6 space-y-3">
        {tickets.filas.length === 0 ? (
          <li className="tarjeta p-6 text-muted">No hay tickets.</li>
        ) : (
          tickets.filas.map((ticket) => (
            <li key={ticket.id} className="tarjeta p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="etiqueta">{ticket.categoria}</span>
                    <span className="etiqueta">{ticket.prioridad}</span>
                    <span className="etiqueta">{ticket.estado}</span>
                  </div>
                  <p className="font-black text-lg">{ticket.asunto}</p>
                  <p className="text-sm text-muted">
                    Trámite{' '}
                    <span className="font-bold">{ticket.numeroTramite}</span>{' '}
                    · {ticket.nombre ?? 'Sin nombre'} ·{' '}
                    {ticket.email ?? 'sin email'} · {fechaHora(ticket.creadoEn)}
                  </p>
                  {ticket.asignadoA ? (
                    <p className="mt-1 text-sm">
                      Asignado a:{' '}
                      <span className="font-bold">
                        {ticket.asignadoNombre ?? ticket.asignadoEmail}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">
                      Sin asignar.
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-line text-sm">
                    {ticket.resumenMensaje.slice(0, 300)}
                    {ticket.resumenMensaje.length > 300 ? '…' : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <form
                    action={soporteResponderTicket}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="ruta" value={ruta} />
                    <select
                      name="plantillaId"
                      className="campo w-48"
                    >
                      <option value="">Plantilla</option>
                      {plantillas.map((plantilla) => (
                        <option key={plantilla.id} value={plantilla.id}>
                          {plantilla.nombre}
                        </option>
                      ))}
                    </select>
                    <textarea
                      name="mensaje"
                      rows={2}
                      className="campo w-64"
                      placeholder="Tu respuesta…"
                      required
                    ></textarea>
                    <input
                      name="nombreCliente"
                      className="campo w-40 hidden"
                      defaultValue={ticket.nombre ?? ''}
                    />
                    <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                      Responder
                    </button>
                  </form>

                  <form
                    action={soporteAsignarTicket}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="ruta" value={ruta} />
                    <select name="asignadoA" className="campo w-44">
                      <option value="">Asignar a</option>
                      {equipo.map((integrante) => (
                        <option key={integrante.id} value={integrante.id}>
                          {integrante.name ?? integrante.email}
                        </option>
                      ))}
                    </select>
                    <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                      Asignar
                    </button>
                  </form>

                  <form
                    action={soporteCambiarEstado}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="ruta" value={ruta} />
                    <select name="estado" className="campo w-40">
                      {Object.entries(ETIQUETA_ESTADO_TICKET).map(
                        ([valor, etiqueta]) => (
                          <option
                            key={valor}
                            value={valor}
                            selected={ticket.estado === valor}
                          >
                            {etiqueta}
                          </option>
                        ),
                      )}
                    </select>
                    <input name="motivo" className="campo w-44 hidden" defaultValue="" />
                    <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                      Estado
                    </button>
                  </form>

                  {ticket.estado !== 'RESUELTO' ? (
                    <form
                      action={soporteCerrarTicket}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <input type="hidden" name="ruta" value={ruta} />
                      <input
                        name="motivo"
                        className="campo w-44"
                        placeholder="Motivo del cierre"
                        required
                      />
                      <button className="btn-oscuro px-3 py-2 text-sm" type="submit">
                        Cerrar
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
          pagina={tickets.pagina}
          base="/admin/soporte"
          params={{
            ...(estado ? { estado } : {}),
            ...(categoria ? { categoria } : {}),
            ...(asignadoA ? { asignadoA } : {}),
            ...(q ? { q } : {}),
          }}
        />
      </div>
    </div>
  )
}
