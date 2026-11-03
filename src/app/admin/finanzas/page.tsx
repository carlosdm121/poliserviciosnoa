import Link from 'next/link'

import { BotonReintentarFactura } from '@/components/admin/BotonReintentarFactura'
import { formatArs } from '@/lib/dinero'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { resumenFinanzas } from '@/services/admin-finanzas'

export const metadata = { title: 'Finanzas', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

function fecha(valor: Date | null): string {
  if (!valor) return '-'

  const dia = String(valor.getDate()).padStart(2, '0')
  const mes = String(valor.getMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getFullYear()}`
}

/**
 * Finanzas del mes.
 *
 * Tres preguntas: cuánto entró, cuánto quedó después de Mercado Pago y qué
 * factura está trabada. El detalle fiscal completo vive en `/admin/facturacion`.
 */
export default async function PaginaFinanzas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('finanzas')
  const sp = await searchParams
  const ahora = new Date()
  const anioPedido = Number(uno(sp.anio))
  const mesPedido = Number(uno(sp.mes))
  const anio =
    Number.isFinite(anioPedido) && anioPedido >= 2000 && anioPedido <= 2100
      ? Math.floor(anioPedido)
      : ahora.getFullYear()
  const mes =
    Number.isFinite(mesPedido) && mesPedido >= 1 && mesPedido <= 12
      ? Math.floor(mesPedido)
      : ahora.getMonth() + 1
  const { resumen, pagos, facturas } = await resumenFinanzas(anio, mes)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Finanzas</h1>
          <p className="mt-2 text-muted">
            {MESES[mes - 1] ?? mes} de {anio} · montos en pesos
          </p>
        </div>
        <Link className="btn-linea px-3 py-2 text-sm" href="/admin/facturacion">
          Ir a facturación
        </Link>
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-xs font-bold uppercase">Mes</span>
          <select name="mes" defaultValue={String(mes)} className="campo">
            {MESES.map((nombre, indice) => (
              <option key={nombre} value={String(indice + 1)}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs font-bold uppercase">Año</span>
          <input name="anio" type="number" defaultValue={anio} className="campo w-32" />
        </label>
        <button className="btn-oscuro" type="submit">
          Ver
        </button>
      </form>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">Bruto</dt>
          <dd className="text-2xl font-black tabular-nums">{formatArs(resumen.bruto)}</dd>
          <dd className="text-sm text-muted">{resumen.pagos} pagos aprobados</dd>
        </div>
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">Comisiones</dt>
          <dd className="text-2xl font-black tabular-nums">{formatArs(resumen.comisiones)}</dd>
        </div>
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">Neto</dt>
          <dd className="text-2xl font-black tabular-nums">{formatArs(resumen.neto)}</dd>
        </div>
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">Reembolsado</dt>
          <dd className="text-2xl font-black tabular-nums">{formatArs(resumen.reembolsado)}</dd>
        </div>
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">Suscriptos activos</dt>
          <dd className="text-2xl font-black tabular-nums">{resumen.suscriptosActivos}</dd>
        </div>
        <div className="tarjeta p-4">
          <dt className="text-xs font-bold uppercase">MRR</dt>
          <dd className="text-2xl font-black tabular-nums">{formatArs(resumen.mrr)}</dd>
        </div>
        <div className="tarjeta p-4 sm:col-span-2">
          <dt className="text-xs font-bold uppercase">Suscripciones por estado</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {Object.entries(resumen.porEstado).map(([estado, cantidad]) => (
              <span key={estado} className="etiqueta">
                {estado}: {cantidad}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="text-xl font-black uppercase">Facturas con problema</h2>
        <p className="text-sm text-muted">
          Pendientes o fallidas. Reintentar reinicia el contador de intentos.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b-[3px] border-ink text-left uppercase">
                <th className="p-2">Profesional</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Intentos</th>
                <th className="p-2">Último error</th>
                <th className="p-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">
                    No hay facturas trabadas.
                  </td>
                </tr>
              ) : (
                facturas.map((factura) => (
                  <tr key={factura.id} className="border-b border-ink/30 align-top">
                    <td className="p-2">
                      <span className="font-bold">{factura.profesional}</span>
                      <span className="block text-muted">{factura.email}</span>
                    </td>
                    <td className="p-2">
                      <span className="etiqueta">{factura.estado}</span>
                    </td>
                    <td className="p-2 tabular-nums">{factura.intentos}</td>
                    <td className="p-2 text-xs">{factura.ultimoError ?? '-'}</td>
                    <td className="p-2">
                      {factura.estado === 'FAILED' ? (
                        <BotonReintentarFactura invoiceId={factura.id} />
                      ) : (
                        <span className="text-muted">Esperando</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black uppercase">Pagos del mes</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b-[3px] border-ink text-left uppercase">
                <th className="p-2">Profesional</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Monto</th>
                <th className="p-2">Comisión</th>
                <th className="p-2">Neto</th>
                <th className="p-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pagos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted">
                    No hay pagos en el período.
                  </td>
                </tr>
              ) : (
                pagos.map((pago) => (
                  <tr key={pago.id} className="border-b border-ink/30">
                    <td className="p-2">
                      <span className="font-bold">{pago.profesional}</span>
                      <span className="block text-muted">{pago.email}</span>
                    </td>
                    <td className="p-2">
                      <span className="etiqueta">{pago.estado}</span>
                    </td>
                    <td className="p-2 tabular-nums">{formatArs(pago.monto)}</td>
                    <td className="p-2 tabular-nums">
                      {pago.comision === null ? '-' : formatArs(pago.comision)}
                    </td>
                    <td className="p-2 tabular-nums">
                      {pago.neto === null ? '-' : formatArs(pago.neto)}
                    </td>
                    <td className="p-2">{fecha(pago.pagadoEl)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

