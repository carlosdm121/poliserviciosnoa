import { InvoiceStatus, SubscriptionStatus } from '@prisma/client'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { authOptions } from '@/lib/auth'
import { formatArs } from '@/lib/dinero'
import { prisma } from '@/lib/prisma'
import { CancelarSuscripcion } from '@/components/panel/CancelarSuscripcion'
import { FormularioPago } from '@/components/panel/FormularioPago'
import { FormularioPromo } from '@/components/panel/FormularioPromo'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import {
  requisitosParaMostrar,
  resumenCondiciones,
  VERSION_TERMINOS,
  type RequisitoPago,
} from '@/lib/suscripcion'
import { getCurrentPlan } from '@/services/planes'
import { listarPagos, obtenerSuscripcion, requisitosDePago } from '@/services/suscripcion'

export const metadata: Metadata = {
  title: 'Mi suscripción',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Fecha corta argentina, sin `Intl` suelto.
 *
 * `toLocaleDateString('es-AR')` depende del locale del runtime —en un contenedor
 * que no tiene el dato devuelve 01/10/2026 en vez de 01/10/2026 con el otro
 * orden— y esta fecha decide si un profesional cree que su mes ya venció. Un
 * formateador propio con `dd/mm/aaaa` no depende de nada.
 */
function fecha(valor: Date | null): string {
  if (!valor) return '—'

  const dia = String(valor.getDate()).padStart(2, '0')
  const mes = String(valor.getMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getFullYear()}`
}

export default async function PaginaSuscripcion(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  const perfilId = sesion?.user?.id
    ? await prisma.profile.findUnique({
        where: { userId: sesion.user.id },
        select: { id: true },
      })
    : null

  const id = perfilId?.id ?? null

  const [plan, faltantes, suscripcion, pagos] = await Promise.all([
    getCurrentPlan(),
    id ? requisitosDePago(id) : Promise.resolve(['PERFIL_INCOMPLETO'] as RequisitoPago[]),
    id ? obtenerSuscripcion(id) : Promise.resolve(null),
    id ? listarPagos(id) : Promise.resolve([]),
  ])

  const activa = suscripcion?.status === SubscriptionStatus.ACTIVE
  const pendiente = suscripcion?.status === SubscriptionStatus.PENDING
  const promoReservada = pendiente && suscripcion?.pendingCouponCode !== null
  const requisitos = requisitosParaMostrar(faltantes)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Mi suscripción</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Tu perfil aparece en las búsquedas mientras la suscripción esté activa. Sin ella, tu
          información queda guardada pero no te encuentra nadie.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar mostradorDatosFiscales={false} />

        <div className="min-w-0 space-y-6">
          {/* Precio grande. Sale del formateador y del plan de la base: si acá
              hubiera un número escrito, cambiar el precio en el panel de
              administración no cambiaría nada de lo que ve el profesional. */}
          <div className="tarjeta p-6">
            {plan ? (
              <>
                <p className="text-sm font-bold uppercase text-muted">{plan.nombre}</p>
                <p className="mt-1 text-title font-black uppercase">{plan.precio}</p>
                <p className="mt-2 text-muted">
                  {formatArs(plan.monto, { conDecimales: true })} {plan.moneda} por mes. Se cobra
                  todos los meses y podés cancelar cuando quieras.
                </p>
              </>
            ) : (
              <p className="error">
                No hay ningún plan disponible en este momento. Escribinos y te avisamos apenas
                haya.
              </p>
            )}
          </div>

          {/*
            Requisitos primero, siempre. Es lo que decide si el botón aparece, y
            que aparezca deshabilitado sin decir por qué sería un laberinto: el
            profesional apriza, no pasa nada y no sabe qué hacer.
          */}
          {requisitos.length > 0 && (
            <div className="tarjeta border-l-4 border-l-[12px] p-6">
              <h2 className="text-xl font-black uppercase">Para pagar necesitamos esto</h2>
              <ul className="mt-4 space-y-3">
                {requisitos.map((requisito) => (
                  <li key={requisito.motivo} className="flex flex-wrap items-baseline gap-2">
                    <span aria-hidden="true" className="font-black">
                      —
                    </span>
                    <span className="leading-relaxed">{requisito.texto}</span>
                    <Link
                      href={requisito.href}
                      className="font-bold underline underline-offset-2"
                    >
                      Ir
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activa && suscripcion && (
            <div className="tarjeta p-6">
              <h2 className="text-xl font-black uppercase">Tu suscripción</h2>

              <dl className="mt-4 space-y-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Estado</dt>
                  <dd className="font-bold">
                    {suscripcion.cancelAtPeriodEnd ? 'Activa, sin renovación' : 'Activa'}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {suscripcion.mpPreapprovalId === null ? 'Promoción' : 'Tu precio'}
                  </dt>
                  <dd className="font-bold">
                    {suscripcion.mpPreapprovalId === null
                      ? 'Meses gratis'
                      : `${formatArs(suscripcion.planAmount)}/mes`}
                  </dd>
                </div>
              </dl>

              <div className="flex justify-between gap-4">
                <dt className="text-muted">
                  {suscripcion.mpPreapprovalId === null ? 'Gratis hasta' : suscripcion.cancelAtPeriodEnd ? 'Vence' : 'Se renueva'}
                  {fecha(suscripcion.currentPeriodEnd)}
                </dt>
              </div>
              {/* La línea de "Tu precio" se muestra solo si no es promo */}
            </div>
          )}

          {/*
            Estado PENDING con promo reservada: mostrar cartel "promo reservada" sin formulario
          */}
          {promoReservada && (
            <div className="tarjeta border-l-4 border-l-[12px] p-6 bg-noa-silver/30">
              <h2 className="text-xl font-black uppercase">Promo reservada</h2>
              <p className="mt-3 max-w-prose leading-relaxed">
                Tenés un código promocional reservado. Cuando completes los requisitos que faltan,
                la promo se activará automáticamente y tendrás el servicio gratis por el período
                correspondiente. No se te cobra nada mientras tanto.
              </p>
            </div>
          )}

          {/* 
            Estado PENDING sin requisitos: mostrar FormularioPago (checkout normal)
          */}
          {pendiente && !promoReservada && requisitos.length === 0 && plan && (
            <FormularioPago
              condiciones={resumenCondiciones(plan.precio, plan.moneda)}
              versionTerminos={VERSION_TERMINOS}
              tipo="checkout"
            />
          )}

          {/* 
            Estado PENDING sin requisitos: mostrar FormularioPromo 
          */}
          {!activa && requisitos.length === 0 && plan && !promoReservada && (
            <FormularioPromo
              condiciones={resumenCondiciones(plan.precio, plan.moneda)}
              versionTerminos={VERSION_TERMINOS}
            />
          )}

          {/* 
            Estado PENDING sin requisitos: mostrar FormularioPago (checkout normal)
          */}
          {pendiente && !promoReservada && requisitos.length === 0 && plan && (
            <FormularioPago
              condiciones={resumenCondiciones(plan.precio, plan.moneda)}
              versionTerminos={VERSION_TERMINOS}
              tipo="checkout"
            />
          )}

          {/* 
            El historial va al final y solo si hay algo que mostrar. Un 
            "Todavía no tenés pagos" debajo de un botón de pago confunde más de
            lo que informa: el profesional no sabe si el listado falló o si es
            que nunca pagó.
          */}
          {pagos.length > 0 && (
            <div className="tarjeta p-6">
              <h2 className="text-xl font-black uppercase">Tus pagos</h2>

              <ul className="mt-4 divide-y-[3px] divide-ink">
                {pagos.map((pago) => (
                  <li key={pago.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span className="font-bold">
                      {formatArs(pago.monto)} {pago.moneda}
                    </span>

                    <span className="flex flex-wrap items-baseline gap-3 text-sm text-muted">
                      <span>
                        {fecha(pago.pagadoEn ?? pago.creadoEn)} · {pago.estado}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}