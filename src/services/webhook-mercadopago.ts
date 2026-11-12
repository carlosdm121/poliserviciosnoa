import { Prisma, SubscriptionStatus, PaymentStatus } from '@prisma/client'

import { env } from '@/lib/env'
import { enviarEmailPagoAprobado } from '@/lib/email'
import { logger } from '@/lib/logger'
import { getProveedor, type PagoConsultado } from '@/lib/mp'
import {
  claveEventoMp,
  estadoPagoAStatus,
  preapprovalCancelado,
  type EventoMercadoPago,
  type TipoEventoMp,
} from '@/lib/mp/evento'
import { prisma } from '@/lib/prisma'
import { diasDeGracia } from '@/services/configuracion'
import { finDeGracia, finDePeriodo } from '@/lib/suscripcion'
import { encolarFacturaSeguro, solicitarNotaDeCredito } from '@/services/facturacion'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Procesamiento de los webhooks de Mercado Pago.
 *
 * La regla que ordena todo el archivo: **el body de la notificación no es una
 * fuente de verdad**. Dice qué recurso cambió; el estado se consulta a la API
 * con el access token del servidor. Si se confiara en el body, cualquiera que
 * descubra la URL podría mandar `{"type":"payment","data":{"id":"..."}}` y
 * activar una suscripción sin pagar.
 *
 * Hay tres recursos y cada uno tiene su idempotencia:
 *
 * - `payment`: el pago real.
 * - `subscription_authorized_payment`: un cobro de la suscripción que apunta al
 *   pago real. Se consulta el cobro y después el pago.
 * - `subscription_preapproval`: el acuerdo de cobro recurrente. Solo interesa
 *   cuando se cancela.
 *
 * El webhook nunca crea una suscripción. Si el pago no se puede asociar a un
 * perfil, se ignora y se registra: crear una suscripción desde una notificación
 * externa sería dejar que Mercado Pago decida quién aparece en el portal.
 */

/** Lo que la ruta devuelve en el body, útil para el script de verificación. */
export type ResultadoWebhook = {
  accion: 'procesado' | 'duplicado' | 'ignorado'
  tipo: TipoEventoMp
  recursoId: string
  estado?: string
  pagoId?: string
  profileId?: string
  motivo?: string
}

/** Suscripción mínima para decidir una transición. */
type SuscripcionParaWebhook = {
  id: string
  profileId: string
  status: SubscriptionStatus
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  cancelledAt: Date | null
  pastDueSince: Date | null
  graceUntil: Date | null
}

/**
 * Procesa una notificación ya validada.
 *
 * La firma se valida en la ruta, antes de llamar acá: este servicio no sabe de
 * headers. La separación permite testear el procesamiento con eventos armados
 * a mano y deja la ruta con una sola responsabilidad, que es la de seguridad.
 */
export async function procesarWebhookMercadoPago(params: {
  evento: EventoMercadoPago
  payloadHash: string
}): Promise<Resultado<ResultadoWebhook>> {
  const { evento, payloadHash } = params

  try {
    switch (evento.tipo) {
      case 'payment':
        return await procesarEventoDePago(evento, payloadHash)
      case 'subscription_authorized_payment':
        return await procesarEventoDeCobroAutorizado(evento, payloadHash)
      case 'subscription_preapproval':
        return await procesarEventoDePreapproval(evento, payloadHash)
      default:
        return ok({
          accion: 'ignorado',
          tipo: evento.tipo,
          recursoId: evento.recursoId,
          motivo: 'tipo no soportado',
        })
    }
  } catch (error: unknown) {
    logger.error('webhook MP: fallo inesperado', {
      tipo: evento.tipo,
      recursoId: evento.recursoId,
      error,
    })

    return err(
      'No pudimos procesar la notificación de Mercado Pago.',
      ERROR_CODES.ERROR_EXTERNO,
    )
  }
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

async function procesarEventoDePago(
  evento: EventoMercadoPago,
  payloadHash: string,
): Promise<Resultado<ResultadoWebhook>> {
  const pago = await getProveedor().consultarPago(evento.recursoId)

  if (!pago) {
    logger.warn('webhook MP: el pago no existe en la pasarela', {
      recursoId: evento.recursoId,
    })

    return ok({
      accion: 'ignorado',
      tipo: evento.tipo,
      recursoId: evento.recursoId,
      motivo: 'pago inexistente',
    })
  }

  const clave = claveEventoMp('payment', pago.id, pago.estado)

  return procesarConClave({
    clave,
    tipo: evento.tipo,
    recursoId: pago.id,
    estado: pago.estado,
    payloadHash,
    fn: () => aplicarPago(pago, evento.tipo, pago.id),
  })
}

async function procesarEventoDeCobroAutorizado(
  evento: EventoMercadoPago,
  payloadHash: string,
): Promise<Resultado<ResultadoWebhook>> {
  const proveedor = getProveedor()
  const cobro = await proveedor.consultarPagoAutorizado(evento.recursoId)

  if (!cobro) {
    logger.warn('webhook MP: el cobro autorizado no existe', {
      recursoId: evento.recursoId,
    })

    return ok({
      accion: 'ignorado',
      tipo: evento.tipo,
      recursoId: evento.recursoId,
      motivo: 'cobro inexistente',
    })
  }

  if (!cobro.pagoId) {
    return ok({
      accion: 'ignorado',
      tipo: evento.tipo,
      recursoId: cobro.id,
      estado: cobro.estado,
      motivo: 'cobro sin pago',
    })
  }

  const pago = await proveedor.consultarPago(cobro.pagoId)

  if (!pago) {
    logger.warn('webhook MP: el pago del cobro autorizado no existe', {
      cobroId: cobro.id,
      pagoId: cobro.pagoId,
    })

    return ok({
      accion: 'ignorado',
      tipo: evento.tipo,
      recursoId: cobro.id,
      estado: cobro.estado,
      motivo: 'pago inexistente',
    })
  }

  /**
   * El cobro autorizado puede traer la referencia que el pago no trae. Se
   * completan los datos que falten antes de buscar la suscripción: un pago
   * suelto sin `external_reference` es imposible de asociar.
   */
  const pagoCompleto: PagoConsultado = {
    ...pago,
    preapprovalId: pago.preapprovalId ?? cobro.preapprovalId,
    externalReference: pago.externalReference ?? cobro.externalReference,
  }

  const clave = claveEventoMp(
    'subscription_authorized_payment',
    cobro.id,
    pagoCompleto.estado,
  )

  return procesarConClave({
    clave,
    tipo: evento.tipo,
    recursoId: cobro.id,
    estado: pagoCompleto.estado,
    payloadHash,
    fn: () => aplicarPago(pagoCompleto, evento.tipo, cobro.id),
  })
}

// ---------------------------------------------------------------------------
// Preapproval
// ---------------------------------------------------------------------------

async function procesarEventoDePreapproval(
  evento: EventoMercadoPago,
  payloadHash: string,
): Promise<Resultado<ResultadoWebhook>> {
  const preapproval = await getProveedor().consultarPreapproval(evento.recursoId)

  if (!preapproval) {
    logger.warn('webhook MP: el preapproval no existe', { recursoId: evento.recursoId })

    return ok({
      accion: 'ignorado',
      tipo: evento.tipo,
      recursoId: evento.recursoId,
      motivo: 'preapproval inexistente',
    })
  }

  const clave = claveEventoMp(
    'subscription_preapproval',
    preapproval.id,
    preapproval.estado,
  )

  return procesarConClave({
    clave,
    tipo: evento.tipo,
    recursoId: preapproval.id,
    estado: preapproval.estado,
    payloadHash,
    fn: async () => {
      const suscripcion = await buscarSuscripcion({
        preapprovalId: preapproval.id,
        externalReference: preapproval.externalReference,
      })

      if (!suscripcion) {
        logger.warn('webhook MP: preapproval sin suscripción asociada', {
          preapprovalId: preapproval.id,
        })

        return {
          accion: 'ignorado',
          tipo: evento.tipo,
          recursoId: preapproval.id,
          estado: preapproval.estado,
          motivo: 'sin suscripción',
        }
      }

      /**
       * Cancelar el preapproval no cambia el estado de la suscripción.
       *
       * El profesional pagó hasta `currentPeriodEnd`: el perfil sigue visible
       * hasta esa fecha y recién el cron (2.7) pasa a CANCELLED. Adelantarlo acá
       * sería despublicar a alguien que todavía tiene un mes pagado.
       */
      if (preapprovalCancelado(preapproval.estado)) {
        await prisma.subscription.update({
          where: { id: suscripcion.id },
          data: {
            cancelAtPeriodEnd: true,
            cancelledAt: suscripcion.cancelledAt ?? new Date(),
          },
        })

        await sincronizarSeguro(suscripcion.profileId)
      }

      return {
        accion: 'procesado',
        tipo: evento.tipo,
        recursoId: preapproval.id,
        estado: preapproval.estado,
        profileId: suscripcion.profileId,
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Aplicación del pago
// ---------------------------------------------------------------------------

async function aplicarPago(
  pago: PagoConsultado,
  tipo: TipoEventoMp,
  recursoId: string,
): Promise<ResultadoWebhook> {
  const suscripcion = await buscarSuscripcion({
    preapprovalId: pago.preapprovalId,
    externalReference: pago.externalReference,
    mpPaymentId: pago.id,
  })

  if (!suscripcion) {
    logger.warn('webhook MP: pago sin suscripción asociada', {
      mpPaymentId: pago.id,
      preapprovalId: pago.preapprovalId,
    })

    return {
      accion: 'ignorado',
      tipo,
      recursoId,
      estado: pago.estado,
      pagoId: pago.id,
      motivo: 'sin suscripción',
    }
  }

  if (pago.monto === null) {
    throw new Error('El pago no trae monto')
  }

  const estado = estadoPagoAStatus(pago.estado)
  const ahora = new Date()
  const pagadoEn = pago.pagadoEn ?? ahora

  /**
   * `yaCubierto` evita extender el período dos veces.
   *
   * Un pago aprobado se puede notificar varias veces (reintentos de Mercado
   * Pago, dos eventos distintos del mismo cobro). Si cada uno sumara un mes, un
   * pago de $10.000 regalaría medio año. El pago que llega con fecha anterior al
   * fin del período actual no abre un período nuevo.
   */
  const yaCubierto =
    suscripcion.currentPeriodEnd !== null && pagadoEn <= suscripcion.currentPeriodEnd

  const finNuevo = yaCubierto ? null : finDePeriodo(pagadoEn)
  const debeActivar = estado === PaymentStatus.APPROVED && (!yaCubierto || suscripcion.status !== SubscriptionStatus.ACTIVE)

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { mpPaymentId: pago.id },
      create: {
        subscriptionId: suscripcion.id,
        mpPaymentId: pago.id,
        amount: new Prisma.Decimal(pago.monto ?? 0),
        currency: pago.moneda ?? 'ARS',
        status: estado,
        feeAmount: pago.fee === null ? null : new Prisma.Decimal(pago.fee),
        netAmount: pago.neto === null ? null : new Prisma.Decimal(pago.neto),
        paidAt: pago.pagadoEn,
        refundedAt: pago.reembolsadoEn,
        failureReason: estado === PaymentStatus.REJECTED ? pago.estadoDetalle : null,
      },
      update: {
        amount: new Prisma.Decimal(pago.monto ?? 0),
        currency: pago.moneda ?? 'ARS',
        status: estado,
        feeAmount: pago.fee === null ? null : new Prisma.Decimal(pago.fee),
        netAmount: pago.neto === null ? null : new Prisma.Decimal(pago.neto),
        paidAt: pago.pagadoEn,
        refundedAt: pago.reembolsadoEn,
        failureReason: estado === PaymentStatus.REJECTED ? pago.estadoDetalle : null,
      },
    })

    if (estado === PaymentStatus.APPROVED) {
      if (!debeActivar) return suscripcion

      const actualizada = await tx.subscription.update({
        where: { id: suscripcion.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: finNuevo === null ? suscripcion.currentPeriodStart : pagadoEn,
          currentPeriodEnd: finNuevo ?? suscripcion.currentPeriodEnd,
          pastDueSince: null,
          graceUntil: null,
          // Una suscripción que se activa por primera vez no puede quedar con
          // una baja programada del intento anterior.
          cancelAtPeriodEnd:
            suscripcion.status === SubscriptionStatus.PENDING
              ? false
              : suscripcion.cancelAtPeriodEnd,
          cancelledAt:
            suscripcion.status === SubscriptionStatus.PENDING
              ? null
              : suscripcion.cancelledAt,
        },
        select: {
          id: true,
          profileId: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          pastDueSince: true,
          graceUntil: true,
        },
      })

      return actualizada
    }

    /**
     * Primer pago rechazado: la suscripción queda PENDING.
     *
     * No pasa a PAST_DUE porque nunca estuvo al día. Si pasara, la ventana de
     * gracia publicaría el perfil sin que el profesional haya pagado nunca, que
     * es el agujero más caro que puede tener este flujo.
     */
    if (suscripcion.status === SubscriptionStatus.PENDING) {
      return tx.subscription.update({
        where: { id: suscripcion.id },
        data: {
          pastDueSince: suscripcion.pastDueSince ?? ahora,
          graceUntil: null,
        },
        select: {
          id: true,
          profileId: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          cancelledAt: true,
          pastDueSince: true,
          graceUntil: true,
        },
      })
    }

    /**
     * Una suscripción ya cancelada o vencida no vuelve atrás por un webhook.
     *
     * El caso concreto es el arrepentimiento: se reembolsa el pago, la
     * suscripción queda `CANCELLED` y Mercado Pago manda además su propia
     * notificación de reembolso. Sin este corte, esa notificación la pasaría a
     * `PAST_DUE`, le daría una ventana de gracia y volvería a publicar un perfil
     * que el profesional acababa de dar de baja. La nota de crédito se sigue
     * pidiendo más abajo, porque el pago sí existe y la factura hay que
     * anularla.
     */
    if (
      suscripcion.status === SubscriptionStatus.CANCELLED ||
      suscripcion.status === SubscriptionStatus.EXPIRED
    ) {
      return suscripcion
    }

    /**
     * Renovación rechazada, reembolsada o desconocida: PAST_DUE con gracia.
     *
     * `graceUntil` se calcula una sola vez. Un segundo rechazo no renueva la
     * ventana: si lo hiciera, una tarjeta muerta mantendría el perfil publicado
     * para siempre y la gracia dejaría de ser una gracia.
     */
    return tx.subscription.update({
      where: { id: suscripcion.id },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        pastDueSince: suscripcion.pastDueSince ?? ahora,
        graceUntil:
          suscripcion.graceUntil ?? finDeGracia(ahora, await diasDeGracia()),
      },
      select: {
        id: true,
        profileId: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        cancelledAt: true,
        pastDueSince: true,
        graceUntil: true,
      },
    })
  })

  await sincronizarSeguro(suscripcion.profileId)

  if (estado === PaymentStatus.APPROVED) {
    const periodoHasta = resultado.currentPeriodEnd

    if (periodoHasta) {
      await enviarAvisoPago(suscripcion.profileId, pago, periodoHasta)
    }

    /**
     * La factura se encola después de que el pago y la suscripción ya están
     * guardados. Si ARCA falla, la suscripción sigue activa y el comprobante
     * queda en la cola: cobrar y facturar son dos responsabilidades distintas.
     */
    await encolarFacturaSeguro(pago.id)
  }

  if (estado === PaymentStatus.REFUNDED || estado === PaymentStatus.CHARGED_BACK) {
    await solicitarNotaDeCredito({
      mpPaymentId: pago.id,
      motivo: estado === PaymentStatus.REFUNDED ? 'reembolso' : 'contracargo',
    })
  }

  return {
    accion: 'procesado',
    tipo,
    recursoId,
    estado: pago.estado,
    pagoId: pago.id,
    profileId: suscripcion.profileId,
  }
}

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

/**
 * Reserva la clave del evento y ejecuta el trabajo.
 *
 * La reserva es un `INSERT` con id único, no un `findUnique` seguido de un
 * `create`: dos webhooks simultáneos pueden pasar los dos por el `findUnique` y
 * los dos procesar. El índice único decide el ganador y el segundo se va con
 * `duplicado`.
 *
 * Si una ejecución anterior dejó `error`, se permite reintentar. Mercado Pago
 * reintenta los 5xx, y una fila con error que bloqueara para siempre convertiría
 * un corte de red de un segundo en un pago perdido.
 */
async function procesarConClave(params: {
  clave: string
  tipo: TipoEventoMp
  recursoId: string
  estado: string
  payloadHash: string
  fn: () => Promise<ResultadoWebhook>
}): Promise<Resultado<ResultadoWebhook>> {
  const reservado = await reservarEvento({
    clave: params.clave,
    tipo: params.tipo,
    payloadHash: params.payloadHash,
  })

  if (!reservado) {
    return ok({
      accion: 'duplicado',
      tipo: params.tipo,
      recursoId: params.recursoId,
      estado: params.estado,
    })
  }

  try {
    const resultado = await params.fn()

    await prisma.webhookEvent.update({
      where: { id: params.clave },
      data: { processedAt: new Date(), error: null },
    })

    return ok(resultado)
  } catch (error: unknown) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido'

    logger.error('webhook MP: no se pudo procesar el evento', {
      clave: params.clave,
      tipo: params.tipo,
      recursoId: params.recursoId,
      error,
    })

    await prisma.webhookEvent.update({
      where: { id: params.clave },
      data: { error: mensaje.slice(0, 500) },
    })

    return err(
      'No pudimos procesar la notificación. Mercado Pago va a reintentar.',
      ERROR_CODES.ERROR_EXTERNO,
    )
  }
}

async function reservarEvento(params: {
  clave: string
  tipo: TipoEventoMp
  payloadHash: string
}): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: {
        id: params.clave,
        provider: 'MERCADOPAGO',
        eventType: params.tipo,
        payloadHash: params.payloadHash,
      },
    })

    return true
  } catch (error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error
    }

    const existente = await prisma.webhookEvent.findUnique({
      where: { id: params.clave },
      select: { processedAt: true, error: true },
    })

    if (!existente) return true

    if (existente.processedAt !== null) return false

    // Sin error y sin `processedAt`: otro proceso lo tiene tomado.
    if (existente.error === null) return false

    /**
     * Reintento de un evento que falló. El `updateMany` con la condición evita
     * que dos reintentos simultáneos procesen los dos: solo uno encuentra la
     * fila todavía con error.
     */
    const tomado = await prisma.webhookEvent.updateMany({
      where: { id: params.clave, processedAt: null, error: { not: null } },
      data: { error: null, payloadHash: params.payloadHash },
    })

    return tomado.count === 1
  }
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/**
 * Busca la suscripción por las tres vías posibles, en orden de confianza.
 *
 * 1. El preapproval: es el vínculo que puso el alta.
 * 2. La referencia externa: el `profileId` que viajó en el checkout.
 * 3. El pago ya guardado: sirve para un reintento del mismo pago cuando el
 *    preapproval no vino en la respuesta.
 */
async function buscarSuscripcion(datos: {
  preapprovalId?: string | null
  externalReference?: string | null
  mpPaymentId?: string | null
}): Promise<SuscripcionParaWebhook | null> {
  const seleccion = {
    id: true,
    profileId: true,
    status: true,
    currentPeriodStart: true,
    currentPeriodEnd: true,
    cancelAtPeriodEnd: true,
    cancelledAt: true,
    pastDueSince: true,
    graceUntil: true,
  } as const

  if (datos.preapprovalId) {
    const porPreapproval = await prisma.subscription.findUnique({
      where: { mpPreapprovalId: datos.preapprovalId },
      select: seleccion,
    })

    if (porPreapproval) return porPreapproval
  }

  if (datos.externalReference) {
    const porReferencia = await prisma.subscription.findUnique({
      where: { profileId: datos.externalReference },
      select: seleccion,
    })

    if (porReferencia) return porReferencia
  }

  if (datos.mpPaymentId) {
    const porPago = await prisma.subscription.findFirst({
      where: { payments: { some: { mpPaymentId: datos.mpPaymentId } } },
      select: seleccion,
    })

    if (porPago) return porPago
  }

  return null
}

/**
 * Re-sincroniza la publicación y no deja que su error tumbe el webhook.
 *
 * El pago ya está guardado y la suscripción ya cambió. Si la publicación falla,
 * el estado de la suscripción es correcto y el cron (2.7) vuelve a pasar. Un 500
 * acá haría que Mercado Pago reintentara un pago que ya se procesó.
 */
async function sincronizarSeguro(profileId: string): Promise<void> {
  const resultado = await sincronizarPublicacion(profileId)

  if (!resultado.ok) {
    logger.warn('webhook MP: no se pudo sincronizar la publicación', {
      profileId,
      error: resultado.error,
    })
  }
}

/**
 * Email de pago aprobado, con candado en `EmailLog`.
 *
 * La clave es el pago, no el perfil: dos cobros distintos del mismo mes son dos
 * emails legítimos, y el mismo cobro reintentado es uno solo. Si el envío falla,
 * se borra la fila para que un reintento de Mercado Pago lo pueda mandar.
 */
async function enviarAvisoPago(
  profileId: string,
  pago: PagoConsultado,
  periodoHasta: Date,
): Promise<void> {
  if (pago.monto === null) return

  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { slug: true, user: { select: { email: true, name: true } } },
  })

  if (!perfil?.user.email) return

  const email = perfil.user.email
  const dedupeKey = `pago:${pago.id}`

  let registro: { id: string }

  try {
    registro = await prisma.emailLog.create({
      data: {
        profileId,
        email,
        template: 'pago_aprobado',
        dedupeKey,
      },
      select: { id: true },
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return
    }

    logger.warn('webhook MP: no se pudo registrar el email', { profileId, error })
    return
  }

  const envio = await enviarEmailPagoAprobado({
    email,
    nombre: perfil.user.name ?? '',
    monto: pago.monto,
    periodoHasta,
    urlEspacio: `${env.NEXTAUTH_URL.replace(/\/+$/, '')}/${perfil.slug}`,
  })

  if (!envio.ok) {
    logger.warn('webhook MP: el email de pago no se pudo enviar', {
      profileId,
      error: envio.error,
    })

    await prisma.emailLog
      .delete({ where: { id: registro.id } })
      .catch(() => undefined)
  }
}

