import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { FormularioBaja } from '@/components/baja/FormularioBaja'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { estadoDeBaja } from '@/services/cancelaciones'

export const metadata: Metadata = {
  title: 'Dar de baja',
  robots: { index: false, follow: false },
}

/** Fecha corta argentina. Ver la explicación en `panel/suscripcion/page.tsx`. */
function fecha(valor: Date | null): string {
  if (!valor) return 'fin del período que ya pagaste'

  const dia = String(valor.getDate()).padStart(2, '0')
  const mes = String(valor.getMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getFullYear()}`
}

/**
 * Baja de la suscripción.
 *
 * `force-dynamic` porque el estado de la suscripción cambia con los webhooks y
 * con la propia baja: una versión cacheada podría mostrarle el botón a alguien
 * que ya se dio de baja.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaBaja(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    redirect('/login?callbackUrl=/baja')
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-title font-black uppercase">Dar de baja</h1>
        <p className="mt-4 leading-relaxed">
          Tu usuario no tiene un perfil asociado, así que no hay una suscripción para dar de baja.
        </p>
        <Link href="/panel" className="btn-oscuro mt-6 inline-flex items-center">
          Ir a mi panel
        </Link>
      </div>
    )
  }

  const estado = await estadoDeBaja(perfil.id)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Dar de baja</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Podés darte de baja sin llamar a nadie y sin explicar nada. El motivo es opcional.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0 space-y-6">
          {!estado.ok && (
            <div className="tarjeta p-6">
              <p className="error" role="alert">
                {estado.error}
              </p>
            </div>
          )}

          {estado.ok && !estado.data.suscripcionActiva && (
            <div className="tarjeta p-6">
              <p className="font-black uppercase">No tenés una suscripción activa</p>
              <p className="mt-3 leading-relaxed">
                {estado.data.cancelada
                  ? 'Tu suscripción ya está dada de baja. No se te cobra nada más.'
                  : 'No encontramos una suscripción activa a tu nombre.'}
              </p>

              {estado.data.tramite && (
                <p className="mt-3 leading-relaxed">
                  Número de trámite: <strong>{estado.data.tramite}</strong>
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/panel/suscripcion" className="btn-linea inline-flex items-center">
                  Ver mi suscripción
                </Link>
                <Link href="/arrepentimiento" className="btn-linea inline-flex items-center">
                  Consultar arrepentimiento
                </Link>
              </div>
            </div>
          )}

          {estado.ok && estado.data.suscripcionActiva && estado.data.cancelada && (
            <div className="tarjeta p-6">
              <p className="font-black uppercase">Tu baja ya está registrada</p>
              <p className="mt-3 leading-relaxed">
                No se te cobra nada más. Tu perfil sigue visible hasta el{' '}
                <strong>{fecha(estado.data.visibleHasta)}</strong>.
              </p>
              {estado.data.tramite && (
                <p className="mt-3 leading-relaxed">
                  Número de trámite: <strong>{estado.data.tramite}</strong>
                </p>
              )}
              <Link href="/panel/suscripcion" className="btn-linea mt-6 inline-flex items-center">
                Volver a mi suscripción
              </Link>
            </div>
          )}

          {estado.ok && estado.data.suscripcionActiva && !estado.data.cancelada && (
            <FormularioBaja visibleHasta={fecha(estado.data.visibleHasta)} />
          )}

          <div className="tarjeta p-6">
            <h2 className="text-xl font-black uppercase">¿Te arrepentiste del pago?</h2>
            <p className="mt-3 leading-relaxed">
              Si pagaste hace menos de 10 días corridos, podés revocar la contratación y te
              devolvemos el total.
            </p>
            <Link href="/arrepentimiento" className="btn-linea mt-4 inline-flex items-center">
              Ver si me corresponde
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
