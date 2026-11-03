import { prisma } from '@/lib/prisma'

/**
 * Números del negocio para la pantalla de finanzas.
 *
 * No reemplaza la facturación: responde tres preguntas que el dueño hace
 * todos los meses — cuánto entró, cuánto quedó después de la pasarela y qué
 * está trabado. El detalle fiscal vive en `/admin/facturacion`.
 */

export type ResumenFinanzas = {
  bruto: number
  comisiones: number
  neto: number
  reembolsado: number
  pagos: number
  suscriptosActivos: number
  mrr: number
  porEstado: Record<string, number>
  facturasConProblema: number
}

export type PagoAdmin = {
  id: string
  profesional: string
  email: string
  monto: number
  comision: number | null
  neto: number | null
  estado: string
  pagadoEl: Date | null
}

export type FacturaConProblema = {
  id: string
  profesional: string
  email: string
  estado: string
  intentos: number
  ultimoError: string | null
  proximoIntento: Date | null
  fecha: Date
}

function rangoDelMes(anio: number, mes: number): { desde: Date; hasta: Date } {
  return {
    desde: new Date(Date.UTC(anio, mes - 1, 1)),
    hasta: new Date(Date.UTC(anio, mes, 1)),
  }
}

function aNumero(valor: { toNumber(): number } | null | undefined): number {
  return valor ? valor.toNumber() : 0
}

export async function resumenFinanzas(anio: number, mes: number): Promise<{
  resumen: ResumenFinanzas
  pagos: PagoAdmin[]
  facturas: FacturaConProblema[]
}> {
  const { desde, hasta } = rangoDelMes(anio, mes)

  const [aprobados, reembolsos, suscripciones, facturas] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: 'APPROVED', paidAt: { gte: desde, lt: hasta } },
      _sum: { amount: true, feeAmount: true, netAmount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { refundedAt: { gte: desde, lt: hasta } },
      _sum: { amount: true },
    }),
    prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { planAmount: true },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true,
        status: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        fecha: true,
        payment: {
          select: {
            subscription: {
              select: {
                profile: {
                  select: {
                    name: true,
                    companyName: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ])

  const filas = await prisma.payment.findMany({
    where: { status: 'APPROVED', paidAt: { gte: desde, lt: hasta } },
    orderBy: { paidAt: 'desc' },
    take: 100,
    select: {
      id: true,
      amount: true,
      feeAmount: true,
      netAmount: true,
      status: true,
      paidAt: true,
      subscription: {
        select: {
          profile: {
            select: { name: true, companyName: true, user: { select: { email: true } } },
          },
        },
      },
    },
  })

  const porEstado: Record<string, number> = {}
  let mrr = 0

  for (const fila of suscripciones) {
    porEstado[fila.status] = fila._count._all

    if (fila.status === 'ACTIVE') {
      mrr += aNumero(fila._sum.planAmount)
    }
  }

  const resumen: ResumenFinanzas = {
    bruto: aNumero(aprobados._sum.amount),
    comisiones: aNumero(aprobados._sum.feeAmount),
    neto: aNumero(aprobados._sum.netAmount),
    reembolsado: aNumero(reembolsos._sum.amount),
    pagos: aprobados._count._all,
    suscriptosActivos: porEstado.ACTIVE ?? 0,
    mrr,
    porEstado,
    facturasConProblema: facturas.length,
  }

  return {
    resumen,
    pagos: filas.map((fila) => ({
      id: fila.id,
      profesional: fila.subscription.profile.companyName ?? fila.subscription.profile.name,
      email: fila.subscription.profile.user.email,
      monto: aNumero(fila.amount),
      comision: fila.feeAmount === null ? null : aNumero(fila.feeAmount),
      neto: fila.netAmount === null ? null : aNumero(fila.netAmount),
      estado: fila.status,
      pagadoEl: fila.paidAt,
    })),
    facturas: facturas.map((fila) => {
      const perfil = fila.payment.subscription.profile

      return {
        id: fila.id,
        profesional: perfil.companyName ?? perfil.name,
        email: perfil.user.email,
        estado: fila.status,
        intentos: fila.attempts,
        ultimoError: fila.lastError,
        proximoIntento: fila.nextAttemptAt,
        fecha: fila.fecha,
      }
    }),
  }
}
