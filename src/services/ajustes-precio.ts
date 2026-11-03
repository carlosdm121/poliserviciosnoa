import { Prisma, type PriceChangeEstado, SubscriptionStatus } from '@prisma/client'

import { calcularPagina, normalizarPagina, POR_PAGINA } from '@/lib/admin'
import { enviarEmailAumentoAplicado, enviarEmailAvisoAumento } from '@/lib/email'
import { formatArs } from '@/lib/dinero'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getProveedor } from '@/lib/mp'
import { registrarAuditoria } from '@/services/auditoria'
import { liberarEmail, reservarEmail } from '@/server/jobs/email-log'
import type { Job, ResultadoJob } from '@/server/jobs/registry'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

const DIAS_AVISO_MINIMO = 30
const MS_POR_DIA = 24 * 60 * 60 * 1000

export type AumentoCreado = {
  id: string
  fechaAviso: Date
  fechaAplicacion: Date
  montoNuevo: number
}

export type FiltrosAumentos = {
  estado?: string | ''
  pagina?: number
}

export type FilaAumento = {
  id: string
  planId: string
  planNombre: string
  montoAnterior: number
  montoNuevo: number
  fechaAviso: Date
  fechaAplicacion: Date
  estado: PriceChangeEstado
  motivo: string | null
  creadoPor: string | null
  creadoEn: Date
  avisadaEn: Date | null
  aplicadaEn: Date | null
}

/**
 * Programa un aumento de precio de un plan.
 *
 * El aviso se fija automáticamente 30 días antes de la aplicación. El aumento
 * rige para todos los suscriptores activos de ese plan; los que tengan el
 * precio congelado (`priceFrozen`) no cambian.
 */
export async function crearAumento(params: {
  planId: string
  montoNuevo: number
  fechaAplicacion: Date
  motivo?: string | null
  actor: { id: string; email: string }
}): Promise<Resultado<AumentoCreado>> {
  const { planId, montoNuevo, fechaAplicacion, motivo, actor } = params

  if (!Number.isFinite(montoNuevo) || montoNuevo <= 0) {
    return err('El monto nuevo tiene que ser mayor a cero.', ERROR_CODES.VALIDACION)
  }

  const ahora = new Date()

  // Mínimo 30 días entre aviso y aplicación: sin eso no hay aviso posible.
  const fechaAviso = new Date(fechaAplicacion.getTime() - DIAS_AVISO_MINIMO * MS_POR_DIA)

  if (fechaAviso <= ahora) {
    return err(
      `La fecha de aplicación tiene que ser al menos ${DIAS_AVISO_MINIMO} días después de hoy, para que los suscriptores reciban el aviso con antelación.`,
      ERROR_CODES.VALIDACION,
    )
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, amount: true, isActive: true },
  })

  if (!plan) {
    return err('No encontramos ese plan.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (!plan.isActive) {
    return err('No se puede programar un aumento sobre un plan inactivo.', ERROR_CODES.VALIDACION)
  }

  const montoAnterior = Number(plan.amount)

  try {
    const aumento = await prisma.priceChange.create({
      data: {
        planId,
        oldAmount: new Prisma.Decimal(montoAnterior),
        newAmount: new Prisma.Decimal(montoNuevo),
        fechaAviso,
        fechaAplicacion,
        estado: 'PROGRAMADO' as PriceChangeEstado,
        motivo: motivo?.trim() || null,
        creadoPor: actor.email,
      },
      select: { id: true, fechaAviso: true, fechaAplicacion: true, newAmount: true },
    })

    await registrarAuditoria(
      {
        actor,
        accion: 'precio.programarAumento',
        entidad: 'PriceChange',
        entidadId: aumento.id,
        despues: {
          planId,
          montoAnterior,
          montoNuevo,
          fechaAplicacion: fechaAplicacion.toISOString(),
        },
      },
    )

    logger.info('precio: aumento programado', {
      priceChangeId: aumento.id,
      planId,
      montoAnterior,
      montoNuevo,
      fechaAplicacion: fechaAplicacion.toISOString(),
      actor: actor.email,
    })

    return ok({
      id: aumento.id,
      fechaAviso,
      fechaAplicacion,
      montoNuevo: Number(aumento.newAmount),
    })
  } catch (error: unknown) {
    logger.error('precio: no se pudo programar el aumento', {
      planId,
      montoNuevo,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos programar el aumento de precio. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Listado paginado de aumentos programados, para el panel de administración.
 */
export async function listarAumentos(
  filtros: FiltrosAumentos = {},
): Promise<{ filas: FilaAumento[]; pagina: ReturnType<typeof calcularPagina> }> {
  const where: Record<string, unknown> = {}

  if (filtros.estado) where.estado = filtros.estado

  const total = await prisma.priceChange.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filasRaw = await prisma.priceChange.findMany({
    where,
    orderBy: { fechaAplicacion: 'asc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      planId: true,
      oldAmount: true,
      newAmount: true,
      fechaAviso: true,
      fechaAplicacion: true,
      estado: true,
      motivo: true,
      creadoPor: true,
      createdAt: true,
      avisadaEn: true,
      aplicadaEn: true,
      canceladaEn: true,
    },
  })

  const planIds = [...new Set(filasRaw.map((fila) => fila.planId))]
  const planes = await prisma.plan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, name: true },
  })
  const planPorId = new Map(planes.map((plan) => [plan.id, plan.name]))

  return {
    filas: filasRaw.map((fila) => ({
      id: fila.id,
      planId: fila.planId,
      planNombre: planPorId.get(fila.planId) ?? '',
      montoAnterior: Number(fila.oldAmount),
      montoNuevo: Number(fila.newAmount),
      fechaAviso: fila.fechaAviso,
      fechaAplicacion: fila.fechaAplicacion,
      estado: fila.estado as PriceChangeEstado,
      motivo: fila.motivo,
      creadoPor: fila.creadoPor,
      creadoEn: fila.createdAt,
      avisadaEn: fila.avisadaEn,
      aplicadaEn: fila.aplicadaEn,
    })),
    pagina,
  }
}

/**
 * Cancela un aumento programado. Solo se puede cancelar si todavía no se
 * aplicó (estado PROGRAMADO o AVISADO).
 */
export async function cancelarAumento(params: {
  aumentoId: string
  actor: { id: string; email: string }
}): Promise<Resultado<null>> {
  const aumento = await prisma.priceChange.findUnique({
    where: { id: params.aumentoId },
    select: { id: true, estado: true },
  })

  if (!aumento) {
    return err('No encontramos ese aumento.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (aumento.estado === 'APLICADO' || aumento.estado === 'CANCELADO') {
    return err('Este aumento ya no se puede cancelar.', ERROR_CODES.ESTADO_INVALIDO)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.priceChange.update({
        where: { id: params.aumentoId },
        data: {
          estado: 'CANCELADO' as PriceChangeEstado,
          canceladaEn: new Date(),
        },
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'precio.cancelarAumento',
          entidad: 'PriceChange',
          entidadId: params.aumentoId,
          antes: { estado: aumento.estado },
          despues: { estado: 'CANCELADO' },
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    logger.error('precio: no se pudo cancelar el aumento', {
      aumentoId: params.aumentoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos cancelar el aumento. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Suscripciones activas de un plan, para avisar o aplicar un aumento.
 *
 * Solo las que ya pagan (`ACTIVE`) y que pertenecen a este plan. Las
 * `PENDING` aún no pagan, las `EXPIRED`/`CANCELLED` terminaron.
 */
async function suscripcionesActivasDelPlan(planId: string) {
  return prisma.subscription.findMany({
    where: { planId, status: SubscriptionStatus.ACTIVE },
    select: {
      id: true,
      profileId: true,
      mpPreapprovalId: true,
      priceFrozen: true,
      planAmount: true,
      profile: {
        select: {
          name: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  })
}

/**
 * Job: envía el aviso de aumento a los suscriptores del plan.
 *
 * Se ejecuta una vez al día. Para cada `PriceChange` en `PROGRAMADO` cuyo
 * `fechaAviso` ya llegó, manda un email a cada suscriptor activo del plan y
 * pasa el aumento a `AVISADO`. El `EmailLog` evita reenviar si el cron se
 * repite.
 */
export const jobAvisosAumento: Job = {
  name: 'avisos-aumento-precio',

  async run(ahora: Date): Promise<ResultadoJob> {
    const aumentos = await prisma.priceChange.findMany({
      where: {
        estado: 'PROGRAMADO' as PriceChangeEstado,
        fechaAviso: { lte: ahora },
      },
      orderBy: { fechaAplicacion: 'asc' },
      select: {
        id: true,
        planId: true,
        newAmount: true,
        oldAmount: true,
        fechaAplicacion: true,
      },
    })

    let procesados = 0
    let errores = 0

    for (const aumento of aumentos) {
      const resultado = await avisarAumento(aumento)

      procesados += resultado.procesado ? 1 : 0
      errores += resultado.error ? 1 : 0
    }

    return { procesados, errores }
  },
}

/**
 * Avisa a todos los suscriptores activos de un plan que su precio va a subir.
 */
async function avisarAumento(aumento: {
  id: string
  planId: string
  newAmount: Prisma.Decimal
  oldAmount: Prisma.Decimal
  fechaAplicacion: Date
}): Promise<{ procesado: boolean; error: boolean }> {
  const suscripciones = await suscripcionesActivasDelPlan(aumento.planId)

  if (suscripciones.length === 0) {
    // Nadie a quien avisar: se marca igual como avisado para no volver a intentarlo.
    await marcarAvisado(aumento.id)
    return { procesado: false, error: false }
  }

  const plan = await prisma.plan.findUnique({
    where: { id: aumento.planId },
    select: { name: true },
  })

  const montoAnterior = formatArs(aumento.oldAmount)
  const montoNuevo = formatArs(aumento.newAmount)

  let enviosExitosos = 0
  let enviosFallidos = 0

  for (const suscripcion of suscripciones) {
    const email = suscripcion.profile.user?.email
    const nombre = suscripcion.profile.user?.name ?? suscripcion.profile.name

    if (!email) continue

    const reserva = await reservarEmail({
      profileId: suscripcion.profileId,
      email,
      template: 'aumento_aviso',
      dedupeKey: `aumento:aviso:${aumento.id}:${suscripcion.id}`,
    })

    if (!reserva) continue

    const envio = await enviarEmailAvisoAumento({
      email,
      nombre,
      plan: plan?.name ?? 'tu plan',
      montoAnterior,
      montoNuevo,
      fechaAplicacion: aumento.fechaAplicacion,
    })

    if (!envio.ok) {
      await liberarEmail(reserva)
      enviosFallidos += 1
      logger.warn('precio: no se pudo enviar aviso de aumento', {
        priceChangeId: aumento.id,
        subscriptionId: suscripcion.id,
        error: envio.error,
      })
      continue
    }

    enviosExitosos += 1
  }

  await marcarAvisado(aumento.id)

  return { procesado: enviosExitosos > 0, error: enviosFallidos > 0 }
}

async function marcarAvisado(aumentoId: string): Promise<void> {
  await prisma.priceChange.update({
    where: { id: aumentoId },
    data: {
      estado: 'AVISADO' as PriceChangeEstado,
      avisadaEn: new Date(),
    },
  })
}

/**
 * Job: aplica el aumento a las suscripciones activas del plan.
 *
 * Se ejecuta una vez al día. Para cada `PriceChange` en `AVISADO` cuyo
 * `fechaAplicacion` ya llegó, actualiza el `planAmount` de cada suscripción
 * activa (salvo las con `priceFrozen`) e intenta actualizar el preapproval de
 * Mercado Pago. Pasa el aumento a `APLICADO`. Un fallo en un lote no corta el
 * resto.
 */
export const jobAplicarAumentos: Job = {
  name: 'aplicar-aumento-precio',

  async run(ahora: Date): Promise<ResultadoJob> {
    const aumentos = await prisma.priceChange.findMany({
      where: {
        estado: 'AVISADO' as PriceChangeEstado,
        fechaAplicacion: { lte: ahora },
      },
      orderBy: { fechaAplicacion: 'asc' },
      select: { id: true, planId: true, newAmount: true },
    })

    let procesados = 0
    let errores = 0

    for (const aumento of aumentos) {
      const resultado = await aplicarAumento(aumento)

      procesados += resultado.procesado ? 1 : 0
      errores += resultado.error ? 1 : 0
    }

    return { procesados, errores }
  },
}

/**
 * Aplica el aumento a todas las suscripciones activas del plan.
 */
async function aplicarAumento(aumento: {
  id: string
  planId: string
  newAmount: Prisma.Decimal
}): Promise<{ procesado: number; error: number }> {
  const suscripciones = await suscripcionesActivasDelPlan(aumento.planId)

  const montoString = aumento.newAmount.toFixed(2)
  const proveedor = getProveedor()

  let aplicados = 0
  let fallos = 0

  // Cada suscripción se actualiza de forma independiente: una falla no corta el
  // resto. Se envía el email solo a quienes efectivamente cambiaron de monto.
  for (const suscripcion of suscripciones) {
    if (suscripcion.priceFrozen) continue

    const cambio = await prisma.subscription.updateMany({
      where: {
        id: suscripcion.id,
        status: SubscriptionStatus.ACTIVE,
        planId: aumento.planId,
      },
      data: { planAmount: new Prisma.Decimal(aumento.newAmount) },
    })

    if (cambio.count === 0) continue

    // Best-effort: Mercado Pago puede estar caído. El planAmount local es la
    // verdad de la plataforma; el preapproval se corrige cuando vuelva.
    if (suscripcion.mpPreapprovalId) {
      try {
        await proveedor.actualizarPreapproval(suscripcion.mpPreapprovalId, montoString)
      } catch (error: unknown) {
        logger.warn('precio: no se pudo actualizar el preapproval de Mercado Pago', {
          priceChangeId: aumento.id,
          subscriptionId: suscripcion.id,
          preapprovalId: suscripcion.mpPreapprovalId,
          error: error instanceof Error ? error.message : String(error),
        })
        fallos += 1
      }
    }

    // Email de confirmación al suscriptor.
    const email = suscripcion.profile.user?.email
    const nombre = suscripcion.profile.user?.name ?? suscripcion.profile.name

    if (email) {
      const reserva = await reservarEmail({
        profileId: suscripcion.profileId,
        email,
        template: 'aumento_aplicado',
        dedupeKey: `aumento:aplicado:${aumento.id}:${suscripcion.id}`,
      })

      if (reserva) {
        const envio = await enviarEmailAumentoAplicado({
          email,
          nombre,
          montoNuevo: formatArs(aumento.newAmount),
        })

        if (!envio.ok) {
          await liberarEmail(reserva)
          logger.warn('precio: no se pudo enviar email de aumento aplicado', {
            priceChangeId: aumento.id,
            subscriptionId: suscripcion.id,
            error: envio.error,
          })
        }
      }
    }

    aplicados += 1
  }

  await marcarAplicado(aumento.id)

  return { procesado: aplicados, error: fallos }
}

async function marcarAplicado(aumentoId: string): Promise<void> {
  await prisma.priceChange.update({
    where: { id: aumentoId },
    data: {
      estado: 'APLICADO' as PriceChangeEstado,
      aplicadaEn: new Date(),
    },
  })
}
