import Link from 'next/link'

import { fechaHora } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { obtenerEstadoMonitoreo } from '@/services/monitoreo'

export const metadata = {
  title: 'Monitoreo',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * Panel de monitoreo.
 *
 * Muestra los últimos errores de webhooks (Mercado Pago y WhatsApp) y las
 * últimas corridas del cron diario. Es de solo lectura: no hay acciones desde
 * acá, solo información para decidir si hay que revisar un servicio.
 */
export default async function PaginaMonitoreo() {
  await exigirAccesoPagina('monitoreo')
  const {
    webhooks,
    cron,
    erroresWebhook24h,
    cronFallido24h,
    verificacionesVencidas24h,
    verificacionesPendientesVencidas,
  } = await obtenerEstadoMonitoreo()

  const proveedores = {
    mercadopago: 'Mercado Pago',
    whatsapp: 'WhatsApp',
  }

  const estadoGlobal =
    erroresWebhook24h > 0 ||
    cronFallido24h > 0 ||
    verificacionesPendientesVencidas > 0
      ? 'atencion'
      : 'ok'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Monitoreo</h1>
      <p className="mt-2 text-muted">
        Últimos errores de webhooks y corridas del cron. Los datos salen de la
        base en este momento; no hay caché.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Errores webhook (24 h)
          </span>
          <span className="text-3xl font-black tabular-nums">
            {erroresWebhook24h}
          </span>
        </div>
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Cron fallido (24 h)
          </span>
          <span className="text-3xl font-black tabular-nums">
            {cronFallido24h}
          </span>
        </div>
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Webhooks con error
          </span>
          <span className="text-3xl font-black tabular-nums">
            {webhooks.length}
          </span>
        </div>
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Corridas del cron
          </span>
          <span className="text-3xl font-black tabular-nums">{cron.length}</span>
        </div>
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Verificaciones vencidas (24 h)
          </span>
          <span className="text-3xl font-black tabular-nums">
            {verificacionesVencidas24h}
          </span>
        </div>
        <div className="tarjeta p-5">
          <span className="text-sm font-bold uppercase tracking-wide">
            Verificaciones pendientes vencidas
          </span>
          <span className="text-3xl font-black tabular-nums">
            {verificacionesPendientesVencidas}
          </span>
        </div>
      </div>

      {estadoGlobal === 'atencion' && (
        <div className="mt-6 p-4 rounded border-l-4 border-error bg-error/5">
          <p className="font-bold text-error">Hay errores recientes</p>
          <p className="mt-1 text-sm text-error/80">
            Revisá las listas de abajo. Un webhook que sigue fallando puede
            dejar pagos sin procesar o verificaciones de WhatsApp sin confirmar.
          </p>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-black uppercase">Webhooks con error</h2>
        <p className="text-sm text-muted mb-3">
          Últimos {LIMITE_WEBHOOKS} webhooks de Mercado Pago y WhatsApp que
          devolvieron error. Un webhook con error se reintenta automáticamente
          por el proveedor; si se repite, revisá el panel del proveedor.
        </p>
        <ul className="divide-y divide-ink/30 border-y-[3px] border-ink">
          {webhooks.length === 0 ? (
            <li className="py-6 text-muted">No hay errores de webhook.</li>
          ) : (
            webhooks.map((w: { id: string; proveedor: string; tipoEvento: string; error: string | null; creadoEn: Date }) => (
              <li key={w.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">
                      {proveedores[w.proveedor as keyof typeof proveedores] ?? w.proveedor}
                    </p>
                    <p className="text-sm text-muted">
                      {w.tipoEvento} · {fechaHora(w.creadoEn)}
                    </p>
                    {w.error && (
                      <pre className="mt-2 max-w-full overflow-x-auto bg-ink/5 p-2 text-xs">
                        {w.error}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black uppercase">Corridas del cron</h2>
        <p className="text-sm text-muted mb-3">
          Últimas {LIMITE_CRON} ejecuciones del cron diario. Cada corrida
          incluye los jobs de avisos, vencimientos, facturación y ajustes de
          precio.
        </p>
        <ul className="divide-y divide-ink/30 border-y-[3px] border-ink">
          {cron.length === 0 ? (
            <li className="py-6 text-muted">No hay corridas del cron registradas.</li>
          ) : (
            cron.map((c: { id: string; job: string; ok: boolean; procesados: number; errores: number; duracionMs: number; error: string | null; detalle: string | null; ejecutadoEn: Date }) => (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-start gap-3">
                      <p className="font-black">{c.job}</p>
                      <span
                        className={`etiqueta ${
                          c.ok
                            ? 'bg-green-50 text-green-900 border-green-700'
                            : 'bg-red-50 text-red-900 border-red-700'
                        }`}
                      >
                        {c.ok ? 'OK' : 'ERROR'}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {c.procesados} procesados · {c.errores} errores ·
                      {c.duracionMs} ms · {fechaHora(c.ejecutadoEn)}
                    </p>
                    {c.error && (
                      <pre className="mt-2 max-w-full overflow-x-auto bg-ink/5 p-2 text-xs">
                        {c.error}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <p className="mt-10 text-xs text-muted">
        Fuente: tabla `WebhookEvent` (errores de webhook) y `CronJobRun`
        (corridas del cron). Los errores de webhook se registran automáticamente
        desde las rutas de `/api/webhooks`.
      </p>
    </div>
  )
}

const LIMITE_WEBHOOKS = 20
const LIMITE_CRON = 20
