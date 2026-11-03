import Link from 'next/link'

import { seccionesVisibles, textoRol } from '@/lib/admin'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { contarBandejas } from '@/services/admin'

export const metadata = { title: 'Resumen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Pantalla de entrada.
 *
 * No muestra gráficos: muestra lo que espera una decisión. Cada número es un
 * link a la bandeja, porque un contador que no lleva a ningún lado es
 * decoración.
 */
export default async function PaginaAdmin() {
  const actor = await exigirAccesoPagina('inicio')
  const bandejas = await contarBandejas()

  const pendientes = [
    { label: 'Altas por aprobar', valor: bandejas.aprobaciones, href: '/admin/aprobaciones' },
    { label: 'Constancias de empresa', valor: bandejas.empresas, href: '/admin/empresas' },
    { label: 'Matrículas por revisar', valor: bandejas.matriculas, href: '/admin/matriculas' },
    { label: 'Señales de riesgo', valor: bandejas.riesgos, href: '/admin/riesgos' },
    { label: 'Reportes abiertos', valor: bandejas.reportes, href: '/admin/moderacion' },
    { label: 'Reclamos abiertos', valor: bandejas.reclamos, href: '/admin/moderacion' },
    { label: 'Tickets de soporte', valor: bandejas.tickets, href: '/admin/soporte' },
    { label: 'Identificadores bloqueados', valor: bandejas.bloqueos, href: '/admin/riesgos' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="etiqueta">{textoRol(actor.role)}</p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight">Qué hay para hacer</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Bandejas del sitio. Los números salen de la base en este momento; no hay caché.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pendientes.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="tarjeta flex items-center justify-between gap-4 p-5 transition-colors hover:bg-ink hover:text-paper"
            >
              <span className="text-sm font-bold uppercase tracking-wide">{item.label}</span>
              <span className="text-3xl font-black tabular-nums">{item.valor}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-xl font-black uppercase tracking-tight">Secciones</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {seccionesVisibles(actor.role)
          .filter((seccion) => seccion.key !== 'inicio')
          .map((seccion) => (
            <li key={seccion.key}>
              <Link href={seccion.href} className="block border-l-[6px] border-ink py-1 pl-3">
                <span className="font-bold">{seccion.label}</span>
                <span className="block text-sm text-muted">{seccion.descripcion}</span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  )
}
