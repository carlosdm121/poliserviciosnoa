import Link from 'next/link'

import { formatArs } from '@/lib/dinero'

import { GraficoSemanal } from '@/components/panel/GraficoSemanal'

type TarjetaMetrica = {
  titulo: string
  valor: string | number
  subtitulo?: string
  href?: string
}

/**
 * Tarjeta de una sola métrica del dashboard.
 *
 * Va en una `tarjeta` del panel: borde grueso [3px], sin radius, tipografía
 * grande para el número. Si tiene `href`, es un enlace a la sección donde se
 * puede mejorar ese número (por ejemplo, la galería para subir más fotos).
 */
export function Metrica({
  titulo,
  valor,
  subtitulo,
  href,
}: TarjetaMetrica): React.ReactElement {
  return (
    <div className="tarjeta p-6">
      <p className="text-sm font-bold uppercase text-muted">{titulo}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-title font-black">{valor}</span>
        {subtitulo && <span className="text-sm text-muted">{subtitulo}</span>}
      </div>
      {href && (
        <Link
          href={href}
          className="mt-4 inline-flex min-h-[44px] items-center font-bold underline"
        >
          Ver detalle →
        </Link>
      )}
    </div>
  )
}

/**
 * Estado de la suscripción como tarjeta informativa.
 *
 * Muestra si está activa, cuándo vence y si la renovación está cancelada.
 * Sin botones de acción: esos viven en `/panel/suscripcion`.
 */
export function EstadoSuscripcion({
  suscripcion,
  precioVigente,
}: {
  suscripcion: {
    status: string
    planAmount: number | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } | null
  precioVigente: string | null
}): React.ReactElement {
  if (!suscripcion) {
    return (
      <div className="tarjeta p-6">
        <p className="text-sm font-bold uppercase text-muted">Suscripción</p>
        <p className="mt-2 text-lg font-black">Sin suscripción activa</p>
        <p className="mt-2 text-sm text-muted">
          Sin una suscripción activa tu perfil no aparece en las búsquedas.
        </p>
        <Link
          href="/panel/suscripcion"
          className="mt-4 inline-flex min-h-[44px] items-center font-bold underline"
        >
          Suscribirse →
        </Link>
      </div>
    )
  }

  const fechaVence = suscripcion.currentPeriodEnd
    ? new Date(suscripcion.currentPeriodEnd).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—'

  let estadoTexto: string
  if (suscripcion.cancelAtPeriodEnd) {
    estadoTexto = 'Renovación cancelada. Seguís visible hasta que termine el mes pagado.'
  } else if (suscripcion.status === 'ACTIVE') {
    estadoTexto = 'Activa. Se renueva automáticamente cada mes.'
  } else if (suscripcion.status === 'PAST_DUE') {
    estadoTexto = 'Pago rechazado. Tenés gracia hasta que termine el período.'
  } else {
    estadoTexto = `Estado: ${suscripcion.status}.`
  }

  const monto = suscripcion.planAmount != null ? formatArs(suscripcion.planAmount) : null
  const precioTexto = monto ? `${monto}/mes` : null

  return (
    <div className="tarjeta p-6">
      <p className="text-sm font-bold uppercase text-muted">Suscripción</p>
      <p className="mt-2 text-lg font-black">{estadoTexto}</p>
      {precioTexto && (
        <p className="mt-1 text-sm text-muted">
          Cobrás {precioTexto}.{' '}
          {precioVigente && precioVigente !== `${monto}/mes` && (
            <span>
              El plan vigente es {precioVigente}/mes; el tuyo se congeló al suscribirte.
            </span>
          )}
        </p>
      )}
      <p className="mt-3 text-sm text-muted">
        Vence el <strong>{fechaVence}</strong>.
      </p>
      <Link
        href="/panel/suscripcion"
        className="mt-4 inline-flex min-h-[44px] items-center font-bold underline"
      >
        Gestionar →
      </Link>
    </div>
  )
}

/**
 * Bloque completo de métricas del dashboard.
 *
 * Recibe los datos ya resueltos por el servicio y los pinta en tarjetas más el
 * gráfico semanal. Es un componente de servidor: no hay interactividad de
 * cliente, solo presentación.
 */
export function DashboardMetricas(params: {
  corazones: number
  clicsWhatsapp30d: number
  visitas30d: number
  visitasTotal: number
  evolucion: {
    fecha: string
    visitas: number
    clics: number
  }[]
  maximoEvolucion: number
  suscripcion: {
    status: string
    planAmount: number | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } | null
  precioVigente: string | null
}): React.ReactElement {
  const {
    corazones,
    clicsWhatsapp30d,
    visitas30d,
    visitasTotal,
    evolucion,
    maximoEvolucion,
    suscripcion,
    precioVigente,
  } = params

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Metrica
        titulo="Corazones de confianza"
        valor={corazones}
        subtitulo="Clientes que te valoraron"
      />
      <Metrica
        titulo="Clics a WhatsApp (30 días)"
        valor={clicsWhatsapp30d}
        subtitulo="Clientes que te contactaron"
      />
      <Metrica
        titulo="Visitas al perfil (30 días)"
        valor={visitas30d}
        subtitulo="Vistas en el último mes"
      />
      <Metrica
        titulo="Visitas al perfil (total)"
        valor={visitasTotal}
        subtitulo="Desde que publicaste"
      />
      <div className="lg:col-span-3">
        <GraficoSemanal evolucion={evolucion} maximo={maximoEvolucion} />
      </div>
      <EstadoSuscripcion suscripcion={suscripcion} precioVigente={precioVigente} />
    </div>
  )
}
