import { SubscriptionStatus } from '@prisma/client'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { authOptions } from '@/lib/auth'
import { formatArs } from '@/lib/dinero'
import { prisma } from '@/lib/prisma'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { obtenerSuscripcion } from '@/services/suscripcion'

export const metadata: Metadata = {
  title: 'Volviendo del pago',
  robots: { index: false, follow: false },
}

/**
 * Destino del `back_url` del preapproval.
 *
 * Mercado Pago manda acá sí o sí cuando el pagador termina, haya pagado o no.
 * Por eso **no dice "gracias por tu pago"**: si el pagador cerró la pestaña en
 * el checkout y volvió con el botón "atrás", esa pantalla le estaría confirmando
 * una suscripción que no existe.
 *
 * Dice lo único que se puede decir con certeza —"estamos confirmando"— y desde
 * acá se manda a la pantalla de suscripción, que es la que sabe la verdad. La
 * verdad la pone el webhook del 2.4, no esta página: esto solo lee.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaResultado(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  const perfilId = sesion?.user?.id
    ? await prisma.profile.findUnique({
        where: { userId: sesion.user.id },
        select: { id: true },
      })
    : null

  const suscripcion = perfilId ? await obtenerSuscripcion(perfilId.id) : null

  const activa = suscripcion?.status === SubscriptionStatus.ACTIVE

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Casi listo</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0 space-y-6">
          <div className="tarjeta p-6">
            {activa ? (
              <>
                <p className="etiqueta">Pago confirmado</p>
                <h2 className="mt-4 text-2xl font-black uppercase">Ya sos parte</h2>
                <p className="mt-3 max-w-prose leading-relaxed">
                  Tu pago entró y tu suscripción está activa a {formatArs(suscripcion.planAmount)} por
                  mes. Te mandamos el detalle por email y vas a recibir un aviso antes de cada
                  renovación.
                </p>
              </>
            ) : (
              <>
                {/*
                  El caso real de esta pantalla es volver sin haber pagado —el
                  pagador apretó "atrás" o cerró la pestaña —, así que el texto no
                  promete nada. Dice que se está confirmando y da el siguiente
                  paso, que siempre es el mismo: volver al botón de pagar.
                */}
                <p className="etiqueta">Confirmando el pago</p>
                <h2 className="mt-4 text-2xl font-black uppercase">Estamos verificando</h2>
                <p className="mt-3 max-w-prose leading-relaxed">
                  Mercado Pago nos está avisando del pago. Tarda unos segundos: la confirmación llega
                  sola y no hace falta que hagas nada. Si ya te descontaron y en un minuto tu perfil
                  sigue sin aparecer, volvé a intentar el pago o escribinos.
                </p>
              </>
            )}

            <div className="mt-8">
              <Link href="/panel/suscripcion" className="btn-oscuro">
                Ir a mi suscripción
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}