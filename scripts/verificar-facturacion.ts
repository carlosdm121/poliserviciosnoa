/**
 * Verificación de la facturación electrónica (módulo 2.5).
 *
 * Corre contra la base real y el proveedor **mock**: no toca ARCA ni manda
 * emails. Lo que se verifica es lo nuestro, que es lo que se puede romper:
 *
 * - un pago aprobado genera exactamente una factura;
 * - repetir el encolado no emite un segundo comprobante;
 * - un reembolso emite la nota de crédito y deja la factura VOIDED;
 * - un fallo del proveedor deja la factura en FAILED con backoff;
 * - el cron levanta lo pendiente y lo emite;
 * - el PDF se genera y el CSV del contador sale completo.
 *
 * Uso: npx tsx scripts/verificar-facturacion.ts
 */

import { Prisma, PrismaClient, PaymentStatus, SubscriptionStatus } from '@prisma/client'

process.env.EMAIL_MOCK = '1'

const prisma = new PrismaClient()

let fallos = 0
let pruebas = 0

function comprobar(descripcion: string, condicion: boolean, detalle?: string): void {
  pruebas += 1

  if (condicion) {
    console.log(`  ok   ${descripcion}`)
    return
  }

  fallos += 1
  console.log(`  FALLA ${descripcion}${detalle ? ` — ${detalle}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n--- ${texto} ---`)
}

type PerfilDePrueba = {
  userId: string
  profileId: string
  subscriptionId: string
  email: string
}

async function crearProfesional(nombre: string): Promise<PerfilDePrueba> {
  const sufijo = Math.random().toString(36).slice(2, 8)
  const email = `factura-${nombre}-${sufijo}@example.com`

  const user = await prisma.user.create({
    data: { email, emailVerified: new Date(), name: nombre },
    select: { id: true },
  })

  const rubro = await prisma.category.findFirst({ select: { id: true } })
  const ciudad = await prisma.city.findFirst({ select: { id: true } })

  if (!rubro || !ciudad) {
    throw new Error('El seed no dejó catálogo. Corré el seed antes de este script.')
  }

  const slug = `factura-${nombre}-${sufijo}`

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      type: 'PERSON',
      name: nombre,
      slug,
      description: 'Prueba de facturación electrónica en la base del proyecto.',
      baseCityId: ciudad.id,
      whatsappE164: `549382${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      categories: { create: { categoryId: rubro.id, isPrimary: true } },
      fiscalData: {
        create: {
          tipoPersona: 'PERSONA_HUMANA',
          nombreORazonSocial: nombre,
          documento: '20304050607',
          condicionIva: 'RESPONSABLE_MONOTRIBUTO',
          domicilioFiscal: 'Calle Falsa 123, San Miguel de Tucumán, Tucumán',
        },
      },
    },
    select: { id: true },
  })

  const suscripcion = await prisma.subscription.create({
    data: {
      profileId: profile.id,
      planAmount: new Prisma.Decimal(10000),
      status: SubscriptionStatus.ACTIVE,
      mpPreapprovalId: `preapproval-${sufijo}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  })

  return {
    userId: user.id,
    profileId: profile.id,
    subscriptionId: suscripcion.id,
    email,
  }
}

async function crearPago(
  perfil: PerfilDePrueba,
  sufijo: string,
  monto = 10000,
): Promise<{ id: string; mpPaymentId: string }> {
  const mpPaymentId = `factura-pago-${sufijo}-${Math.random().toString(36).slice(2, 8)}`
  const pago = await prisma.payment.create({
    data: {
      subscriptionId: perfil.subscriptionId,
      mpPaymentId,
      amount: new Prisma.Decimal(monto),
      status: PaymentStatus.APPROVED,
      paidAt: new Date(),
      feeAmount: new Prisma.Decimal(Math.round(monto * 0.035 * 100) / 100),
      netAmount: new Prisma.Decimal(monto - Math.round(monto * 0.035 * 100) / 100),
    },
    select: { id: true },
  })
  return { id: pago.id, mpPaymentId }
}

async function borrar(perfiles: PerfilDePrueba[]): Promise<void> {
  if (perfiles.length === 0) return

  await prisma.user.deleteMany({ where: { id: { in: perfiles.map((p) => p.userId) } } })
}

async function main(): Promise<void> {
  const { resetMockArca, fallarEmisionMock, llamadasMock } = await import('../src/lib/arca')
  const {
    encolarFactura,
    generarPdfDeFactura,
    listarFacturasDelMes,
    procesarPendientes,
    reporteMensualCsv,
    solicitarNotaDeCredito,
  } = await import('../src/services/facturacion')

  resetMockArca()

  const creados: PerfilDePrueba[] = []
  const nuevo = async (nombre: string): Promise<PerfilDePrueba> => {
    const perfil = await crearProfesional(nombre)
    creados.push(perfil)
    return perfil
  }

  try {
    // -----------------------------------------------------------------------
    titulo('Un pago aprobado emite una factura')

    const perfil = await nuevo('principal')
    const pago = await crearPago(perfil, 'principal')

    const encolada = await encolarFactura(pago.mpPaymentId)

    comprobar('el encolado devuelve la factura', encolada.ok, encolada.ok ? '' : encolada.error)

    const factura = await prisma.invoice.findUniqueOrThrow({
      where: { paymentId: pago.id },
      select: {
        id: true,
        status: true,
        numero: true,
        cae: true,
        caeVence: true,
        neto: true,
        iva: true,
        total: true,
        pdfUrl: true,
        tipoComprobante: true,
      },
    })

    comprobar('queda ISSUED', factura.status === 'ISSUED', factura.status)
    comprobar('con número 1', factura.numero === 1, String(factura.numero))
    comprobar('con CAE', Boolean(factura.cae))
    comprobar('con vencimiento de CAE', factura.caeVence !== null)
    comprobar('con URL de PDF', factura.pdfUrl === `/api/facturas/${factura.id}/pdf`)
    comprobar(
      'factura C no discrimina IVA',
      factura.tipoComprobante === 'C' &&
        factura.neto.toNumber() === 10000 &&
        factura.iva.toNumber() === 0,
    )

    const archivo = await generarPdfDeFactura(factura.id)

    comprobar('el PDF se genera', archivo !== null)
    comprobar(
      'y es un PDF válido',
      archivo !== null && Buffer.from(archivo.pdf).toString('latin1').startsWith('%PDF-1.4'),
    )

    // -----------------------------------------------------------------------
    titulo('Reintentar el encolado no duplica')

    await encolarFactura(pago.mpPaymentId)

    comprobar(
      'sigue habiendo una sola factura para el pago',
      (await prisma.invoice.count({ where: { paymentId: pago.id } })) === 1,
    )
    comprobar('y una sola emisión en el proveedor', llamadasMock() === 1, String(llamadasMock()))

    // -----------------------------------------------------------------------
    titulo('Reembolso: nota de crédito y factura anulada')

    await prisma.payment.update({
      where: { id: pago.id },
      data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
    })

    await solicitarNotaDeCredito({ mpPaymentId: pago.mpPaymentId, motivo: 'reembolso' })

    const nota = await prisma.creditNote.findUniqueOrThrow({
      where: { invoiceId: factura.id },
      select: { id: true, status: true, numero: true, cae: true, motivo: true },
    })

    const facturaAnulada = await prisma.invoice.findUniqueOrThrow({
      where: { id: factura.id },
      select: { status: true, voidedAt: true },
    })

    comprobar('la nota queda ISSUED', nota.status === 'ISSUED', nota.status)
    comprobar('con número 1 propio', nota.numero === 1, String(nota.numero))
    comprobar('con CAE', Boolean(nota.cae))
    comprobar('y motivo', nota.motivo === 'Reembolso', nota.motivo)
    comprobar(
      'la factura queda VOIDED con fecha',
      facturaAnulada.status === 'VOIDED' && facturaAnulada.voidedAt !== null,
    )

    await solicitarNotaDeCredito({ mpPaymentId: pago.mpPaymentId, motivo: 'reembolso' })

    comprobar(
      'el reembolso repetido no emite una segunda nota',
      (await prisma.creditNote.count({ where: { invoiceId: factura.id } })) === 1,
    )

    // -----------------------------------------------------------------------
    titulo('Fallo del proveedor y reintento por cron')

    const perfilFallo = await nuevo('fallo')
    const pagoFallo = await crearPago(perfilFallo, 'fallo')

    fallarEmisionMock(true)
    await encolarFactura(pagoFallo.mpPaymentId)
    fallarEmisionMock(false)

    const fallida = await prisma.invoice.findUniqueOrThrow({
      where: { paymentId: pagoFallo.id },
      select: { id: true, status: true, attempts: true, nextAttemptAt: true, lastError: true },
    })

    comprobar('la factura queda FAILED', fallida.status === 'FAILED', fallida.status)
    comprobar('con un intento contado', fallida.attempts === 1, String(fallida.attempts))
    comprobar('con backoff programado', fallida.nextAttemptAt !== null)
    comprobar('y el error guardado', Boolean(fallida.lastError))

    await prisma.invoice.update({
      where: { id: fallida.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    })

    const lote = await procesarPendientes()

    comprobar('el cron procesa la pendiente', lote.facturas.procesadas >= 1)
    comprobar('y la emite', lote.facturas.emitidas >= 1)

    const recuperada = await prisma.invoice.findUniqueOrThrow({
      where: { id: fallida.id },
      select: { status: true, attempts: true, cae: true },
    })

    comprobar('queda ISSUED', recuperada.status === 'ISSUED', recuperada.status)
    comprobar('con dos intentos', recuperada.attempts === 2, String(recuperada.attempts))
    comprobar('y CAE', Boolean(recuperada.cae))

    // -----------------------------------------------------------------------
    titulo('Reporte del contador')

    const ahora = new Date()
    const { facturas, resumen } = await listarFacturasDelMes(
      ahora.getFullYear(),
      ahora.getMonth() + 1,
    )

    comprobar('lista las facturas del mes', facturas.length === 2, String(facturas.length))
    comprobar('una está anulada', facturas.some((f) => f.estado === 'VOIDED'))
    comprobar('con la nota de crédito asociada', facturas.some((f) => f.notaCredito !== null))
    // El pago reembolsado ya no cuenta como ingreso: solo queda el segundo.
    comprobar('el resumen cuenta los pagos vigentes', resumen.cantidad === 1, String(resumen.cantidad))
    comprobar('suma el facturado vigente', resumen.facturado === 10000, String(resumen.facturado))
    comprobar('separa comisiones y neto', resumen.comisiones === 350 && resumen.neto === 9650)
    comprobar('y cuenta el reembolsado', resumen.reembolsado === 10000, String(resumen.reembolsado))

    const csv = await reporteMensualCsv(ahora.getFullYear(), ahora.getMonth() + 1)

    comprobar('el CSV lleva BOM para Excel', csv.startsWith('\uFEFF'))
    comprobar('con encabezado', csv.includes('Pago MP;Comprobante'))
    comprobar('con las dos facturas', csv.split('\r\n').filter((l) => l.includes('factura-pago-')).length === 2)
    comprobar('y con coma decimal', csv.includes(',00'))

    // -----------------------------------------------------------------------
    console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

    if (fallos > 0) {
      console.log(`${fallos} FALLAS`)
      process.exitCode = 1
    }
  } finally {
    resetMockArca()

    try {
      await borrar(creados)
    } catch (error: unknown) {
      console.warn(
        '\nAviso: no se pudieron borrar los perfiles de prueba.',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('\nError en la verificación de facturación:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
