'use server'

import { Prisma } from '@prisma/client'

import { exigirSuperAdmin } from '@/lib/admin-auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria } from '@/services/auditoria'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

const METODOS = ['TRANSFERENCIA', 'EFECTIVO', 'OTRO'] as const

export type MetodoPagoManual = (typeof METODOS)[number]

export type DatosPagoManual = {
  profileId: string
  metodo: MetodoPagoManual
  monto: number
  /** Número de operación o nota. Obligatorio en transferencias. */
  referencia?: string
}

export type PagoAcreditado = {
  subscriptionId: string
  paymentId: string
  slug: string
  /** Hasta cuándo queda activa la suscripción. */
  hasta: string
}

/**
 * Acredita un pago cobrado por fuera (transferencia o efectivo) y activa la
 * suscripción por 30 días.
 *
 * Solo lo hace un ADMIN: es la instancia que confirma que el dinero entró.
 * El pago queda registrado con método, monto y referencia para que Finanzas
 * lo vea y para poder cruzarlo con el movimiento bancario si alguien reclama.
 */
export async function adminAcreditarPago(
  datos: DatosPagoManual,
): Promise<Resultado<PagoAcreditado>> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return admin

  const { profileId, metodo, monto } = datos
  const referencia = datos.referencia?.trim() || null

  if (!profileId) {
    return err('Elegí el espacio a acreditar.', ERROR_CODES.VALIDACION)
  }

  if (!METODOS.includes(metodo)) {
    return err('Elegí un método de pago válido.', ERROR_CODES.VALIDACION)
  }

  if (!Number.isFinite(monto) || monto <= 0 || monto > 10_000_000) {
    return err('Escribí un monto válido.', ERROR_CODES.VALIDACION)
  }

  if (metodo === 'TRANSFERENCIA' && (!referencia || referencia.length < 4)) {
    return err('Escribí el número de operación de la transferencia.', ERROR_CODES.VALIDACION)
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const perfil = await tx.profile.findUnique({
        where: { id: profileId },
        select: {
          id: true,
          slug: true,
          subscription: {
            select: { id: true, status: true, currentPeriodEnd: true },
          },
        },
      })

      if (!perfil) throw new Error('PERFIL_NO_ENCONTRADO')
      if (!perfil.subscription) throw new Error('SIN_SUSCRIPCION')

      const ahora = new Date()
      const suscripcion = perfil.subscription
      const vigente =
        suscripcion.status === 'ACTIVE' &&
        suscripcion.currentPeriodEnd !== null &&
        suscripcion.currentPeriodEnd > ahora

      if (vigente) throw new Error('YA_ACTIVA')

      // Condicional para que dos clics simultáneos no cobren dos veces.
      const activada = await tx.subscription.updateMany({
        where: {
          id: suscripcion.id,
          OR: [
            { status: { not: 'ACTIVE' } },
            { currentPeriodEnd: null },
            { currentPeriodEnd: { lte: ahora } },
          ],
        },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: ahora,
          currentPeriodEnd: new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          pastDueSince: null,
          graceUntil: null,
        },
      })

      if (activada.count === 0) throw new Error('YA_ACTIVA')

      const montoDecimal = new Prisma.Decimal(monto)
      const pago = await tx.payment.create({
        data: {
          subscriptionId: suscripcion.id,
          mpPaymentId: null,
          amount: montoDecimal,
          currency: 'ARS',
          status: 'APPROVED',
          method: metodo,
          reference: referencia,
          registeredByEmail: admin.data.email,
          feeAmount: new Prisma.Decimal(0),
          netAmount: montoDecimal,
          paidAt: ahora,
        },
        select: { id: true },
      })

      const hasta = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000)

      await registrarAuditoria(
        {
          actor: admin.data,
          accion: 'suscripcion.pago_manual',
          entidad: 'Profile',
          entidadId: perfil.id,
          despues: {
            metodo,
            monto,
            referencia,
            paymentId: pago.id,
            hasta: hasta.toISOString(),
          },
        },
        tx,
      )

      return {
        subscriptionId: suscripcion.id,
        paymentId: pago.id,
        slug: perfil.slug,
        hasta: hasta.toISOString(),
      }
    })

    logger.info('admin: pago manual acreditado', {
      admin: admin.data.email,
      profileId,
      metodo,
      monto,
      subscriptionId: resultado.subscriptionId,
    })

    return ok(resultado)
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'PERFIL_NO_ENCONTRADO') {
        return err('No encontramos ese espacio.', ERROR_CODES.NO_ENCONTRADO)
      }
      if (error.message === 'SIN_SUSCRIPCION') {
        return err('Ese espacio no tiene una suscripción.', ERROR_CODES.ESTADO_INVALIDO)
      }
      if (error.message === 'YA_ACTIVA') {
        return err('La suscripción ya está activa. No registres el pago dos veces.', ERROR_CODES.ESTADO_INVALIDO)
      }
    }

    logger.error('admin: error al acreditar pago manual', { profileId, error })
    return err('No pudimos registrar el pago. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

export type EstadoPagoManual =
  | { ok: true; nombre: string; hasta: string }
  | { ok: false; error: string }

/** Versión de formulario que usa el listado del panel. */
export async function adminAcreditarPagoAction(
  datosForm: FormData,
): Promise<EstadoPagoManual> {
  const profileId = String(datosForm.get('profileId') ?? '')
  const metodo = String(datosForm.get('metodo') ?? '') as MetodoPagoManual
  const monto = Number(String(datosForm.get('monto') ?? '').replace(',', '.'))
  const referencia = String(datosForm.get('referencia') ?? '')

  const resultado = await adminAcreditarPago({ profileId, metodo, monto, referencia })

  if (!resultado.ok) {
    return { ok: false, error: resultado.error }
  }

  return { ok: true, nombre: '', hasta: resultado.data.hasta }
}
