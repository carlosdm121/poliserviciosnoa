import { randomUUID } from 'node:crypto'

import { CancellationStatus, CancellationType, PaymentStatus, SubscriptionStatus } from '@prisma/client'

import {
  DIAS_ARREPENTIMIENTO,
  dentroDelPlazoDeArrepentimiento,
  diasRestantesDeArrepentimiento,
  generarNumeroTramite,
} from '@/lib/cancelaciones'
import { enviarEmailArrepentimiento, enviarEmailBaja } from '@/lib/email'
import { logger } from '@/lib/logger'
import { getProveedor } from '@/lib/mp'
import { prisma } from '@/lib/prisma'
import { aNumero } from '@/lib/dinero'
import { solicitarNotaDeCredito } from '@/services/facturacion'
import { sincronizarPublicacion } from '@/services/publicacion'
import { cancelarRenovacion } from '@/services/suscripcion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Baja y arrepentimiento (módulo 2.6).
 *
 * Dos operaciones con la misma forma y consecuencias distintas:
 *
 * - **Baja**: corta la renovación y deja el perfil visible hasta el fin del
 *   período pagado. No devuelve dinero.
 * - **Arrepentimiento**: revoca la contratación dentro de los 10 días corridos.
 *   Devuelve el pago completo, cancela, despublica y anula el comprobante.
 *
 * Los dos dejan una fila en `CancellationRequest` con un número de trámite. Sin
 * eso no hay constancia de que la baja existió, y el primer reclamo depende de
 * la memoria de quien atendió el teléfono.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Lo que la pantalla de baja necesita saber. */
export type EstadoBaja = {
  suscripcionActiva: boolean
  cancelada: boolean
  visibleHasta: Date | null
  tramite: string | null
}

/** Lo que la pantalla de arrepentimiento necesita saber. */
export type EvaluacionArrepentimiento = {
  elegible: boolean
  motivo: string
  tramiteExistente: string | null
  monto: number | null
  contratadoEn: Date | null
  venceEl: Date | null
  diasRestantes: number
}

/**
 * Pide la baja.
 *
 * Reintentar el botón no crea dos trámites: si ya hay una baja completada para
 * esta suscripción, se devuelve la misma. La operación es idempotente de cara
 * al profesional, que es lo que importa cuando la red del celular corta justo
 * después de apretar.
 */
export async function solicitarBaja(
  profileId: string,
  motivo?: string | null,
): Promise<Resultado<{ tramite: string; visibleHasta: Date | null }>> {
  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: {
      id: true,
      status: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
    },
  })

  if (!suscripcion) {
    return err('No encontramos una suscripción a tu nombre.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (suscripcion.status !== SubscriptionStatus.ACTIVE) {
    return err(
      'Tu suscripción no está activa, así que no hay nada que dar de baja.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  const existente = await prisma.cancellationRequest.findFirst({
    where: {
      profileId,
      type: CancellationType.BAJA,
      status: CancellationStatus.COMPLETADA,
      subscriptionId: suscripcion.id,
    },
    orderBy: { createdAt: 'desc' },
    select: { tramiteNumber: true, effectiveAt: true },
  })

  if (existente) {
    return ok({ tramite: existente.tramiteNumber, visibleHasta: existente.effectiveAt })
  }

  const ahora = new Date()
  const tramite = generarNumeroTramite(CancellationType.BAJA, ahora, randomUUID())

  const pedido = await prisma.cancellationRequest.create({
    data: {
      profileId,
      subscriptionId: suscripcion.id,
      type: CancellationType.BAJA,
      reason: normalizarMotivo(motivo),
      status: CancellationStatus.PENDIENTE,
      tramiteNumber: tramite,
    },
    select: { id: true },
  })

  const baja = await cancelarRenovacion(profileId)

  if (!baja.ok) {
    await prisma.cancellationRequest.update({
      where: { id: pedido.id },
      data: { status: CancellationStatus.FALLIDA, processedAt: new Date() },
    })

    return err(baja.error, baja.code)
  }

  await prisma.cancellationRequest.update({
    where: { id: pedido.id },
    data: {
      status: CancellationStatus.COMPLETADA,
      processedAt: new Date(),
      effectiveAt: suscripcion.currentPeriodEnd,
    },
  })

  await enviarBajaSeguro(profileId, tramite, suscripcion.currentPeriodEnd)

  return ok({ tramite, visibleHasta: suscripcion.currentPeriodEnd })
}

/**
 * Evalúa si corresponde el arrepentimiento.
 *
 * La pantalla la usa para explicar antes de que el profesional apriete. La
 * acción vuelve a evaluar con la misma función: entre que se pinta la página y
 * se aprieta el botón puede haber pasado el día 10.
 */
export async function evaluarArrepentimiento(
  profileId: string,
  ahora: Date = new Date(),
): Promise<Resultado<EvaluacionArrepentimiento>> {
  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: { id: true, createdAt: true },
  })

  if (!suscripcion) {
    return err('No encontramos una suscripción a tu nombre.', ERROR_CODES.NO_ENCONTRADO)
  }

  const pago = await prisma.payment.findFirst({
    where: { subscriptionId: suscripcion.id, paidAt: { not: null } },
    orderBy: { paidAt: 'desc' },
    select: {
      id: true,
      amount: true,
      status: true,
      paidAt: true,
      refundedAt: true,
    },
  })

  const tramite = await prisma.cancellationRequest.findFirst({
    where: {
      profileId,
      type: CancellationType.ARREPENTIMIENTO,
      status: CancellationStatus.COMPLETADA,
    },
    orderBy: { createdAt: 'desc' },
    select: { tramiteNumber: true },
  })

  const vacio: EvaluacionArrepentimiento = {
    elegible: false,
    motivo: '',
    tramiteExistente: tramite?.tramiteNumber ?? null,
    monto: null,
    contratadoEn: null,
    venceEl: null,
    diasRestantes: 0,
  }

  if (!pago) {
    return ok({
      ...vacio,
      motivo: 'No encontramos un pago a tu nombre. Escribinos y lo revisamos.',
    })
  }

  if (pago.status === PaymentStatus.REFUNDED || pago.status === PaymentStatus.CHARGED_BACK || pago.refundedAt) {
    return ok({
      ...vacio,
      motivo: 'Ese pago ya fue reembolsado. No se puede reembolsar dos veces.',
      monto: aNumero(pago.amount),
      contratadoEn: pago.paidAt,
    })
  }

  if (pago.status !== PaymentStatus.APPROVED) {
    return ok({
      ...vacio,
      motivo: 'El último pago no está aprobado, así que no hay dinero que devolver.',
      monto: aNumero(pago.amount),
      contratadoEn: pago.paidAt,
    })
  }

  const contratadoEn = pago.paidAt ?? suscripcion.createdAt
  const venceEl = new Date(contratadoEn.getTime() + DIAS_ARREPENTIMIENTO * MS_POR_DIA)
  const monto = aNumero(pago.amount)

  if (!dentroDelPlazoDeArrepentimiento(contratadoEn, ahora)) {
    return ok({
      elegible: false,
      motivo:
        `El plazo de arrepentimiento de ${DIAS_ARREPENTIMIENTO} días corridos venció el ` +
        `${fechaCorta(venceEl)}. Igual podés dar de baja la renovación cuando quieras.`,
      tramiteExistente: tramite?.tramiteNumber ?? null,
      monto,
      contratadoEn,
      venceEl,
      diasRestantes: 0,
    })
  }

  return ok({
    elegible: true,
    motivo: '',
    tramiteExistente: tramite?.tramiteNumber ?? null,
    monto,
    contratadoEn,
    venceEl,
    diasRestantes: diasRestantesDeArrepentimiento(contratadoEn, ahora),
  })
}

/**
 * Ejecuta el arrepentimiento.
 *
 * Orden deliberado: primero se registra el pedido, después se devuelve el
 * dinero y recién cuando la pasarela confirmó se toca el estado local. Si se
 * despublicara antes y el reembolso fallara, el profesional quedaría sin perfil
 * y sin plata.
 *
 * Una vez reembolsado no hay vuelta atrás: el segundo intento se bloquea contra
 * el estado del pago, no contra la memoria del proceso.
 */
export async function solicitarArrepentimiento(
  profileId: string,
  motivo?: string | null,
  ahora: Date = new Date(),
): Promise<Resultado<{ tramite: string; monto: number; reembolsadoEn: Date }>> {
  const evaluacion = await evaluarArrepentimiento(profileId, ahora)

  if (!evaluacion.ok) return err(evaluacion.error, evaluacion.code)

  if (!evaluacion.data.elegible || evaluacion.data.monto === null) {
    return err(evaluacion.data.motivo, ERROR_CODES.ESTADO_INVALIDO)
  }

  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: { id: true, mpPreapprovalId: true },
  })

  if (!suscripcion) {
    return err('No encontramos una suscripción a tu nombre.', ERROR_CODES.NO_ENCONTRADO)
  }

  const pago = await prisma.payment.findFirst({
    where: {
      subscriptionId: suscripcion.id,
      status: PaymentStatus.APPROVED,
      paidAt: { not: null },
    },
    orderBy: { paidAt: 'desc' },
    select: { id: true, mpPaymentId: true, amount: true },
  })

  if (!pago) {
    return err(
      'No encontramos un pago aprobado para devolver. Escribinos y lo revisamos.',
      ERROR_CODES.NO_ENCONTRADO,
    )
  }

  if (!pago.mpPaymentId) {
    return err(
      'Ese pago fue por transferencia o efectivo y se devuelve manualmente. Escribinos y lo gestionamos.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  const tramite = generarNumeroTramite(CancellationType.ARREPENTIMIENTO, ahora, randomUUID())

  const pedido = await prisma.cancellationRequest.create({
    data: {
      profileId,
      subscriptionId: suscripcion.id,
      refundedPaymentId: pago.id,
      type: CancellationType.ARREPENTIMIENTO,
      reason: normalizarMotivo(motivo),
      status: CancellationStatus.PENDIENTE,
      tramiteNumber: tramite,
    },
    select: { id: true },
  })

  let reembolsadoEn: Date | null

  try {
    const reembolso = await getProveedor().reembolsarPago(pago.mpPaymentId)
    reembolsadoEn = reembolso.reembolsadoEn ?? new Date()
  } catch (error: unknown) {
    logger.error('cancelaciones: falló el reembolso del arrepentimiento', {
      profileId,
      tramite,
      error: error instanceof Error ? error.message : String(error),
    })

    await prisma.cancellationRequest.update({
      where: { id: pedido.id },
      data: { status: CancellationStatus.FALLIDA, processedAt: new Date() },
    })

    return err(
      'No pudimos completar el reembolso en este momento. No te cobramos nada más y te escribimos para terminarlo.',
      ERROR_CODES.ERROR_EXTERNO,
    )
  }

  const monto = aNumero(pago.amount)

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: pago.id },
      data: { status: PaymentStatus.REFUNDED, refundedAt: reembolsadoEn },
    })

    await tx.subscription.update({
      where: { id: suscripcion.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: true,
        cancelledAt: ahora,
        pastDueSince: null,
        graceUntil: null,
      },
    })
  })

  if (suscripcion.mpPreapprovalId) {
    try {
      await getProveedor().cancelarPreapproval(suscripcion.mpPreapprovalId)
    } catch (error: unknown) {
      // El reembolso ya se aplicó y la suscripción local ya está cancelada. Un
      // fallo al cortar el preapproval se registra para revisión; no se le
      // devuelve un error al profesional sobre una operación que sí terminó.
      logger.warn('cancelaciones: no se pudo cancelar el preapproval', {
        profileId,
        tramite,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await solicitarNotaSegura(pago.mpPaymentId)
  await sincronizarSeguro(profileId)

  await prisma.cancellationRequest.update({
    where: { id: pedido.id },
    data: {
      status: CancellationStatus.COMPLETADA,
      processedAt: new Date(),
      effectiveAt: ahora,
    },
  })

  await enviarArrepentimientoSeguro(profileId, tramite, monto, reembolsadoEn)

  return ok({ tramite, monto, reembolsadoEn })
}

/**
 * El estado de la baja para la pantalla.
 *
 * Se consulta acá y no se arma con `obtenerSuscripcion` porque la pantalla
 * necesita el número de trámite, que vive en otra tabla.
 */
export async function estadoDeBaja(profileId: string): Promise<Resultado<EstadoBaja>> {
  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: { id: true, status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
  })

  if (!suscripcion) {
    return err('No encontramos una suscripción a tu nombre.', ERROR_CODES.NO_ENCONTRADO)
  }

  const pedido = await prisma.cancellationRequest.findFirst({
    where: { profileId, type: CancellationType.BAJA, status: CancellationStatus.COMPLETADA },
    orderBy: { createdAt: 'desc' },
    select: { tramiteNumber: true, effectiveAt: true },
  })

  return ok({
    suscripcionActiva: suscripcion.status === SubscriptionStatus.ACTIVE,
    cancelada: suscripcion.cancelAtPeriodEnd || suscripcion.status === SubscriptionStatus.CANCELLED,
    visibleHasta: pedido?.effectiveAt ?? suscripcion.currentPeriodEnd,
    tramite: pedido?.tramiteNumber ?? null,
  })
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/** Motivo opcional, recortado y sin convertir vacío en `null` ambiguo. */
function normalizarMotivo(motivo?: string | null): string | null {
  const limpio = motivo?.trim()

  if (!limpio) return null

  return limpio.slice(0, 1000)
}

async function enviarBajaSeguro(
  profileId: string,
  tramite: string,
  visibleHasta: Date | null,
): Promise<void> {
  const contacto = await contactoDe(profileId)

  if (!contacto) return

  const envio = await enviarEmailBaja({
    email: contacto.email,
    nombre: contacto.nombre,
    tramite,
    visibleHasta,
  })

  if (!envio.ok) {
    logger.warn('cancelaciones: no se pudo enviar el email de baja', {
      profileId,
      tramite,
      error: envio.error,
    })
  }
}

async function enviarArrepentimientoSeguro(
  profileId: string,
  tramite: string,
  monto: number,
  reembolsadoEn: Date,
): Promise<void> {
  const contacto = await contactoDe(profileId)

  if (!contacto) return

  const envio = await enviarEmailArrepentimiento({
    email: contacto.email,
    nombre: contacto.nombre,
    tramite,
    monto,
    reembolsadoEn,
  })

  if (!envio.ok) {
    logger.warn('cancelaciones: no se pudo enviar la constancia de arrepentimiento', {
      profileId,
      tramite,
      error: envio.error,
    })
  }
}

async function contactoDe(profileId: string): Promise<{ email: string; nombre: string } | null> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { name: true, user: { select: { email: true, name: true } } },
  })

  if (!perfil?.user.email) return null

  return { email: perfil.user.email, nombre: perfil.user.name ?? perfil.name }
}

async function solicitarNotaSegura(mpPaymentId: string): Promise<void> {
  try {
    await solicitarNotaDeCredito({ mpPaymentId, motivo: 'reembolso' })
  } catch (error: unknown) {
    logger.warn('cancelaciones: no se pudo solicitar la nota de crédito', {
      mpPaymentId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function sincronizarSeguro(profileId: string): Promise<void> {
  const resultado = await sincronizarPublicacion(profileId)

  if (!resultado.ok) {
    logger.warn('cancelaciones: no se pudo sincronizar la publicación', {
      profileId,
      error: resultado.error,
    })
  }
}

function fechaCorta(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, '0')
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${fecha.getUTCFullYear()}`
}
