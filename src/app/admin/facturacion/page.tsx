import { InvoiceStatus } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'

import { BotonReintentarFactura } from '@/components/admin/BotonReintentarFactura'
import { formatArs } from '@/lib/dinero'
import { listarFacturasDelMes, type FacturaAdmin } from '@/services/facturacion'

export const metadata: Metadata = {
  title: 'Facturación',
  robots: { index: false, follow: false },
}

/**
 * Panel de facturación.
 *
 * No es un ERP: es la pantalla que el dueño del negocio abre una vez por mes
 * para (a) bajar el CSV del contador, (b) ver cuánto entró neto de comisiones y
 * (c) destrabar la factura que quedó en FAILED. Todo lo demás vive en la base.
 */

export const dynamic = 'force-dynamic'

const ESTADOS: Record<InvoiceStatus, string> = {
  PENDING: 'Pendiente',
  ISSUED: 'Emitida',
  FAILED: 'Falló',
  VOIDED: 'Anulada',
}

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

function fecha(valor: Date | null): string {
  if (!valor) return '—'

  const dia = String(valor.getDate()).padStart(2, '0')
  const mes = String(valor.getMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getFullYear()}`
}

function comprobante(factura: FacturaAdmin): string {
  const puntoVenta = String(factura.puntoVenta).padStart(4, '0')
  const numero = factura.numero === null ? '—' : String(factura.numero).padStart(8, '0')

  return `${factura.tipoComprobante} ${puntoVenta}-${numero}`
}

/** Corre un mes hacia atrás o adelante, sin cruzar el año a mano. */
function correrMes(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const fecha = new Date(Date.UTC(anio, mes - 1 + delta, 1))

  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 }
}

export default async function PaginaFacturacion({
  searchParams,
}: {
  searchParams: { anio?: string; mes?: string }
}): Promise<React.ReactElement> {
  const ahora = new Date()
  const anio = Number(searchParams.anio) || ahora.getFullYear()
  const mes = Number(searchParams.mes) || ahora.getMonth() + 1

  const { facturas, resumen } = await listarFacturasDelMes(anio, mes)

  const anterior = correrMes(anio, mes, -1)
  const siguiente = correrMes(anio, mes, 1)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-muted">Administración</p>
            <h1 className="text-title font-black uppercase">Facturación</h1>
            <p className="mt-2 max-w-prose leading-relaxed">
              {MESES[mes - 1]} de {anio}. Los importes salen de Mercado Pago; el comprobante fiscal
              se emite contra ARCA y se puede descargar desde acá.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/facturacion?anio=${anterior.anio}&mes=${anterior.mes}`}
              className="font-bold underline underline-offset-2"
            >
              ← {MESES[anterior.mes - 1]}
            </Link>

            <Link
              href={`/admin/facturacion?anio=${siguiente.anio}&mes=${siguiente.mes}`}
              className="font-bold underline underline-offset-2"
            >
              {MESES[siguiente.mes - 1]} →
            </Link>

            <a
              href={`/api/admin/facturacion/reporte?anio=${anio}&mes=${mes}`}
              className="btn-oscuro"
            >
              Bajar CSV
            </a>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="tarjeta p-4">
          <p className="text-sm font-bold uppercase text-muted">Facturado</p>
          <p className="mt-1 text-2xl font-black">{formatArs(resumen.facturado)}</p>
        </div>

        <div className="tarjeta p-4">
          <p className="text-sm font-bold uppercase text-muted">Comisiones MP</p>
          <p className="mt-1 text-2xl font-black">{formatArs(resumen.comisiones)}</p>
        </div>

        <div className="tarjeta p-4">
          <p className="text-sm font-bold uppercase text-muted">Neto percibido</p>
          <p className="mt-1 text-2xl font-black">{formatArs(resumen.neto)}</p>
        </div>

        <div className="tarjeta p-4">
          <p className="text-sm font-bold uppercase text-muted">Reembolsado</p>
          <p className="mt-1 text-2xl font-black">{formatArs(resumen.reembolsado)}</p>
        </div>

        <div className="tarjeta p-4">
          <p className="text-sm font-bold uppercase text-muted">Pagos / pendientes</p>
          <p className="mt-1 text-2xl font-black">
            {resumen.cantidad} / {resumen.pendientes}
          </p>
        </div>
      </div>

      {facturas.length === 0 ? (
        <p className="tarjeta mt-6 p-6">
          No hay facturas en {MESES[mes - 1]} de {anio}. Si el mes ya cerró y esto sigue vacío,
          revisá que el webhook de Mercado Pago esté llegando.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-[3px] border-ink">
                <th className="py-2 pr-4 font-black uppercase">Fecha</th>
                <th className="py-2 pr-4 font-black uppercase">Profesional</th>
                <th className="py-2 pr-4 font-black uppercase">Comprobante</th>
                <th className="py-2 pr-4 text-right font-black uppercase">Total</th>
                <th className="py-2 pr-4 text-right font-black uppercase">Comisión</th>
                <th className="py-2 pr-4 text-right font-black uppercase">Neto</th>
                <th className="py-2 pr-4 font-black uppercase">Estado</th>
                <th className="py-2 font-black uppercase">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {facturas.map((factura) => (
                <tr key={factura.id} className="border-b border-ink/20 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap">{fecha(factura.fecha)}</td>

                  <td className="py-3 pr-4">
                    <span className="font-bold">{factura.profesional}</span>
                    <br />
                    <span className="text-xs text-muted">{factura.email}</span>
                  </td>

                  <td className="py-3 pr-4 whitespace-nowrap">
                    {comprobante(factura)}
                    {factura.cae && (
                      <>
                        <br />
                        <span className="text-xs text-muted">CAE {factura.cae}</span>
                      </>
                    )}
                    {factura.notaCredito && (
                      <>
                        <br />
                        <span className="text-xs font-bold">NC {factura.notaCredito.cae ?? 'pendiente'}</span>
                      </>
                    )}
                  </td>

                  <td className="py-3 pr-4 text-right whitespace-nowrap">
                    {formatArs(factura.total)}
                  </td>

                  <td className="py-3 pr-4 text-right whitespace-nowrap">
                    {factura.comision === null ? '—' : formatArs(factura.comision)}
                  </td>

                  <td className="py-3 pr-4 text-right whitespace-nowrap">
                    {factura.netoPercibido === null ? '—' : formatArs(factura.netoPercibido)}
                  </td>

                  <td className="py-3 pr-4 whitespace-nowrap">
                    <span className="font-bold">{ESTADOS[factura.estado]}</span>
                    {factura.attempts > 0 && factura.estado !== InvoiceStatus.ISSUED && (
                      <>
                        <br />
                        <span className="text-xs text-muted">{factura.attempts} intentos</span>
                      </>
                    )}
                  </td>

                  <td className="py-3">
                    <div className="flex flex-col items-start gap-2">
                      {factura.pdfUrl && factura.estado === InvoiceStatus.ISSUED && (
                        <a
                          href={factura.pdfUrl}
                          className="font-bold underline underline-offset-2"
                        >
                          PDF
                        </a>
                      )}

                      {(factura.estado === InvoiceStatus.FAILED ||
                        factura.estado === InvoiceStatus.PENDING) && (
                        <BotonReintentarFactura invoiceId={factura.id} />
                      )}

                      {factura.lastError && (
                        <p className="max-w-xs text-xs text-muted">{factura.lastError}</p>
                      )}

                      {factura.nextAttemptAt && (
                        <p className="text-xs text-muted">
                          Próximo intento: {fecha(factura.nextAttemptAt)}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
