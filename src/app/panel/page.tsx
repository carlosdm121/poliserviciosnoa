import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { obtenerEstadoPanel, obtenerMetricasPanel } from '@/services/panel'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { PanelPasos } from '@/components/panel/PanelPasos'
import { DashboardMetricas } from '@/components/panel/DashboardMetricas'

export const metadata: Metadata = {
  title: 'Mi panel',
  // Header con noindex en next.config, pero el título tampoco debe indexarse.
  robots: { index: false, follow: false },
}

/**
 * Panel del profesional.
 *
 * `dynamic = 'force-dynamic'` porque es una página autenticada: si se
 * cacheara, el contenido del panel de una persona se le serviría a otra.
 *
 * El control de rol real está en el middleware (rápido, sin base) y se repite
 * acá contra la sesión del servidor. La duplicación es intencional: el
 * middleware puede tener un token desactualizado, y acá no.
 */
export const dynamic = 'force-dynamic'

export default async function PanelPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions)
  const estado = await obtenerEstadoPanel(session?.user.id ?? '')

  let metricas
  if (estado.existePerfil && estado.perfil) {
    metricas = await obtenerMetricasPanel(estado.perfil.id)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="text-sm font-black uppercase tracking-widest">Mi panel</p>
        <h1 className="mt-1 text-title font-black uppercase">
          Hola{estado.perfil ? `, ${estado.perfil.nombre}` : ''}
        </h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0">
          {!estado.existePerfil && (
            <p className="error">
              Tu cuenta no tiene un perfil asociado. Escribinos y lo revisamos.
            </p>
          )}

          {estado.existePerfil && estado.pasos.length > 0 && (
            <PanelPasos pasos={estado.pasos} />
          )}

          {estado.existePerfil && estado.pasos.length === 0 && estado.perfil && (
            <div className="exito">
              <p className="font-bold">Tu perfil está publicado y visible en las búsquedas.</p>
              {estado.perfil.slug && (
                <p className="mt-2">
                  Tu URL pública: <span className="font-mono">/p/{estado.perfil.slug}</span>
                </p>
              )}
            </div>
          )}

          {estado.existePerfil && estado.perfil && metricas && (
            <section className="mt-8">
              <h2 className="text-lg font-black uppercase mb-4">Tu resumen</h2>
              <DashboardMetricas
                corazones={metricas.corazones}
                clicsWhatsapp30d={metricas.clicsWhatsapp30d}
                visitas30d={metricas.visitas30d}
                visitasTotal={metricas.visitasTotal}
                evolucion={metricas.evolucion}
                maximoEvolucion={metricas.maximoEvolucion}
                suscripcion={metricas.suscripcion}
                precioVigente={metricas.precioVigente}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}