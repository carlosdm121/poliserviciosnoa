import { InvoiceStatus, SubscriptionStatus } from '@prisma/client'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { authOptions } from '@/lib/auth'
import { formatArs } from '@/lib/dinero'
import { prisma } from '@/lib/prisma'
import { CancelarSuscripcion } from '@/components/panel/CancelarSuscripcion'
import { FormularioPago } from '@/components/panel/FormularioPago'
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

/**
 * Suscripción del panel.
 *
 * `force-dynamic` porque el precio sale de la base y el admin lo cambia, y
 * porque el estado de la suscripción cambia con cada webhook. Con estático, el
 * precio de hoy se serviría del build de ayer, que es exactamente el bug que el
 * módulo 2.2 existe para evitar.
 *
 * La pantalla tiene tres versiones según el estado, y el orden de las
 * condiciones importa: primero lo que falta para poder pagar, después el botón,
 * y recién al final el historial. Un profesional que todavía no puede pagar no
 * necesita ver la tabla de pagos; uno que ya paga no necesita un checklist de
 * cinco puntos que ya cumplió.
 */
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

  /**
   * Las cuatro lecturas van juntas.
   *
   * Un `Promise.all` y no cuatro `await` secuenciales: cada consulta va a la red
   * y awaited una detrás de otra la pantalla tarda cuatro viajes de ida y vuelta
   * en un celular del interior, que es de dónde nos miran.
   */
  const [plan, faltantes, suscripcion, pagos] = await Promise.all([
    getCurrentPlan(),
    id ? requisitosDePago(id) : Promise.resolve(['PERFIL_INCOMPLETO' as RequisitoPago]),
    id ? obtenerSuscripcion(id) : Promise.resolve(null),
    id ? listarPagos(id) : Promise.resolve([]),
  ])

  const activa = suscripcion?.status === SubscriptionStatus.ACTIVE
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
        <PanelNavbar />

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
              /*
                Sin plan no hay precio que mostrar, y no se muestra uno de
                respaldo. Decirle a alguien $10.000 sin que ese sea el precio
                real es peor que decirle que todavía no hay nada disponible:
                el profesional organiza su plata alrededor de ese número.
              */
              <p className="error">
                No hay ningún plan disponible en este momento. Escribinos y te avisamos apenas
                haya.
              </p>
            )}
          </div>

          {/*
            Requisitos primero, siempre. Es lo que decide si el botón aparece, y
            que aparezca deshabilitado sin decir por qué sería un laberinto: el
            profesional aprieta, no pasa nada y no sabe qué hacer.
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

          {suscripcion?.status === SubscriptionStatus.PENDING && (
            <div className="tarjeta border-l-4 border-l-[12px] p-6">
              <p className="font-bold uppercase">Hay un pago sin terminar</p>
              <p className="mt-2">
                Empezaste a suscribirte y no completaste el pago. Podés retomarlo con el botón de
                abajo: se cancela el intento anterior y se abre uno nuevo, así que no te queda nada
                cobrando atrás.
              </p>
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

                {/* El monto congelado, no el del plan. Es la diferencia entre lo
                    que se le promete a este profesional y lo que se está
                    vendiendo hoy, y por eso van los dos. */}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Tu precio</dt>
                  <dd className="font-bold">{formatArs(suscripcion.planAmount)}/mes</dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {suscripcion.cancelAtPeriodEnd ? 'Vence' : 'Se renueva'}
                  </dt>
                  <dd className="font-bold">{fecha(suscripcion.currentPeriodEnd)}</dd>
                </div>
              </dl>

              {suscripcion.cancelAtPeriodEnd ? (
                <p className="exito mt-6">
                  No se va a cobrar nada más. Tu perfil sigue apareciendo hasta el{' '}
                  {fecha(suscripcion.currentPeriodEnd)}.
                </p>
              ) : (
                <div className="mt-6">
                  <CancelarSuscripcion />
                </div>
              )}
            </div>
          )}

          {!activa && requisitos.length === 0 && plan && (
            <FormularioPago
              condiciones={resumenCondiciones(plan.precio, plan.moneda)}
              versionTerminos={VERSION_TERMINOS}
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

                      {/* El comprobante se baja de la ruta que lo genera al vuelo.
                          Si el pago todavía no tiene factura emitida no se muestra
                          nada: un enlace roto es peor que la ausencia del enlace. */}
                      {pago.factura?.pdfUrl && pago.factura.estado === InvoiceStatus.ISSUED ? (
                        <a
                          href={pago.factura.pdfUrl}
                          className="font-bold underline underline-offset-2"
                        >
                          Comprobante
                        </a>
                      ) : (
                        pago.factura &&
                        (pago.factura.estado === InvoiceStatus.PENDING ||
                          pago.factura.estado === InvoiceStatus.FAILED) && (
                          <span>Comprobante en proceso</span>
                        )
                      )}
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