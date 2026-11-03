/**
 * Verificación de baja, arrepentimiento y cron diario (módulos 2.6 y 2.7).
 *
 * Corre contra la base real y los proveedores **mock**: no toca Mercado Pago,
 * ARCA ni manda emails de verdad. Lo que se verifica es lo nuestro:
 *
 * - el arrepentimiento devuelve el pago, cancela, despublica y deja constancia;
 * - un segundo arrepentimiento se bloquea contra el pago ya reembolsado;
 * - la baja no devuelve dinero, deja el perfil visible y reutiliza el trámite;
 * - el cron vence, despublica y no duplica emails si corre dos veces;
 * - un job que falla no impide que corran los demás;
 * - la limpieza expira verificaciones y borra señales de IP viejas.
 *
 * Uso: npx tsx scripts/verificar-cancelaciones.ts
 */

import { Prisma, PrismaClient, SubscriptionStatus } from '@prisma/client'

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

const DIA = 24 * 60 * 60 * 1000

async function crearProfesional(nombre: string): Promise<PerfilDePrueba> {
  const sufijo = Math.random().toString(36).slice(2, 8)
  const email = `baja-${nombre}-${sufijo}@example.com`

  const user = await prisma.user.create({
    data: { email, emailVerified: new Date(), name: nombre },
    select: { id: true },
  })

  const rubro = await prisma.category.findFirst({ select: { id: true } })
  const ciudad = await prisma.city.findFirst({ select: { id: true } })

  if (!rubro || !ciudad) {
    throw new Error('El seed no dejó catálogo. Corré el seed antes de este script.')
  }

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      type: 'PERSON',
      name: nombre,
      slug: `baja-${nombre}-${sufijo}`,
      description: 'Prueba de baja y arrepentimiento en la base del proyecto.',
      baseCityId: ciudad.id,
      whatsappE164: `549383${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      isPublished: true,
      categories: { create: { categoryId: rubro.id, isPrimary: true } },
      images: {
        create: {
          publicId: `baja/${sufijo}`,
          url: `https://res.cloudinary.com/demo/image/upload/baja-${sufijo}.jpg`,
          width: 1200,
          height: 900,
        },
      },
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
      mpPreapprovalId: `preapproval-baja-${sufijo}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * DIA),
    },
    select: { id: true },
  })

  return { userId: user.id, profileId: profile.id, subscriptionId: suscripcion.id, email }
}

async function borrar(perfiles: PerfilDePrueba[]): Promise<void> {
  if (perfiles.length === 0) return

  await prisma.complaint.deleteMany({ where: { email: { in: perfiles.map((p) => p.email) } } })
  await prisma.user.deleteMany({ where: { id: { in: perfiles.map((p) => p.userId) } } })
}

async function main(): Promise<void> {
  const { crearPagoMock, estadoPagoMock, limpiarMockMercadoPago } = await import('../src/lib/mp')
  const { evaluarArrepentimiento, solicitarArrepentimiento, solicitarBaja } = await import(
    '../src/services/cancelaciones'
  )
  const { ejecutarTodos, registrarJob } = await import('../src/server/jobs/registry')
  const { jobAvisos } = await import('../src/server/jobs/avisos')
  const { jobVencidas } = await import('../src/server/jobs/vencidas')
  const { jobLimpieza } = await import('../src/server/jobs/limpieza')
  const { registrarReclamo } = await import('../src/services/reclamos')

  limpiarMockMercadoPago()

  registrarJob(jobAvisos)
  registrarJob(jobVencidas)
  registrarJob(jobLimpieza)

  const creados: PerfilDePrueba[] = []

  try {
    // -----------------------------------------------------------------------
    titulo('Arrepentimiento: reembolso, baja y constancia')

    const arrepentido = await crearProfesional('arrepentido')
    creados.push(arrepentido)

    const mpPago = crearPagoMock({ monto: 10000, estado: 'approved' })

    await prisma.payment.create({
      data: {
        subscriptionId: arrepentido.subscriptionId,
        mpPaymentId: mpPago,
        amount: new Prisma.Decimal(10000),
        status: 'APPROVED',
        paidAt: new Date(),
      },
    })

    const evaluacion = await evaluarArrepentimiento(arrepentido.profileId)

    comprobar('el pago reciente es elegible', evaluacion.ok && evaluacion.data.elegible)
    comprobar(
      'la evaluación muestra el monto',
      evaluacion.ok && evaluacion.data.monto === 10000,
      evaluacion.ok ? String(evaluacion.data.monto) : evaluacion.error,
    )
    comprobar(
      'la evaluación da días restantes',
      evaluacion.ok && evaluacion.data.diasRestantes > 0,
      evaluacion.ok ? String(evaluacion.data.diasRestantes) : evaluacion.error,
    )

    const arrepentimiento = await solicitarArrepentimiento(arrepentido.profileId, 'no me sirvió')

    comprobar('el arrepentimiento se completa', arrepentimiento.ok, arrepentimiento.ok ? '' : arrepentimiento.error)
    comprobar(
      'el trámite empieza con AR',
      arrepentimiento.ok && arrepentimiento.data.tramite.startsWith('AR-'),
      arrepentimiento.ok ? arrepentimiento.data.tramite : '',
    )
    comprobar(
      'el pago queda reembolsado en la base',
      (await prisma.payment.findUnique({ where: { mpPaymentId: mpPago } }))?.status === 'REFUNDED',
    )
    comprobar('el pago queda reembolsado en Mercado Pago', estadoPagoMock(mpPago) === 'refunded')
    comprobar(
      'la suscripción queda cancelada',
      (await prisma.subscription.findUnique({ where: { id: arrepentido.subscriptionId } }))?.status ===
        SubscriptionStatus.CANCELLED,
    )
    comprobar(
      'el perfil se despublica',
      (await prisma.profile.findUnique({ where: { id: arrepentido.profileId } }))?.isPublished === false,
    )

    const constancia = await prisma.cancellationRequest.findFirst({
      where: { profileId: arrepentido.profileId },
    })

    comprobar('queda la constancia completada', constancia?.status === 'COMPLETADA')
    comprobar('la constancia guarda el pago devuelto', Boolean(constancia?.refundedPaymentId))
    comprobar('la constancia guarda el motivo', constancia?.reason === 'no me sirvió')

    const segundo = await solicitarArrepentimiento(arrepentido.profileId)

    comprobar('el segundo arrepentimiento se rechaza', !segundo.ok)
    comprobar(
      'no se crea un segundo trámite',
      (await prisma.cancellationRequest.count({ where: { profileId: arrepentido.profileId } })) === 1,
    )

    // -----------------------------------------------------------------------
    titulo('Baja: corta la renovación y deja el perfil visible')

    const dadoDeBaja = await crearProfesional('baja')
    creados.push(dadoDeBaja)

    const baja = await solicitarBaja(dadoDeBaja.profileId, 'me mudé')

    comprobar('la baja se registra', baja.ok, baja.ok ? '' : baja.error)
    comprobar(
      'el trámite empieza con BA',
      baja.ok && baja.data.tramite.startsWith('BA-'),
      baja.ok ? baja.data.tramite : '',
    )

    const suscripcionBaja = await prisma.subscription.findUnique({
      where: { id: dadoDeBaja.subscriptionId },
    })

    comprobar('la suscripción sigue activa hasta el fin del período', suscripcionBaja?.status === 'ACTIVE')
    comprobar('la renovación queda cancelada', suscripcionBaja?.cancelAtPeriodEnd === true)
    comprobar(
      'el perfil sigue publicado',
      (await prisma.profile.findUnique({ where: { id: dadoDeBaja.profileId } }))?.isPublished === true,
    )

    const bajaRepetida = await solicitarBaja(dadoDeBaja.profileId)

    comprobar('repetir la baja devuelve el mismo trámite', bajaRepetida.ok && bajaRepetida.data.tramite === (baja.ok ? baja.data.tramite : ''))
    comprobar(
      'no se duplica el trámite de baja',
      (await prisma.cancellationRequest.count({ where: { profileId: dadoDeBaja.profileId } })) === 1,
    )

    // -----------------------------------------------------------------------
    titulo('Cron: avisos, vencimiento y limpieza')

    const ahora = new Date()

    await prisma.subscription.update({
      where: { id: dadoDeBaja.subscriptionId },
      data: { currentPeriodEnd: new Date(ahora.getTime() - DIA) },
    })

    const porVencer = await crearProfesional('porvencer')
    creados.push(porVencer)

    await prisma.subscription.update({
      where: { id: porVencer.subscriptionId },
      data: { currentPeriodEnd: new Date(ahora.getTime() + 4 * DIA) },
    })

    // Verificación de WhatsApp vieja y señal de IP vieja para el job de limpieza.
    await prisma.whatsAppVerification.create({
      data: {
        profileId: porVencer.profileId,
        phoneE164: '+5493830000000',
        codeHash: 'hash-de-prueba',
        expiresAt: new Date(ahora.getTime() - DIA),
      },
    })

    await prisma.riskSignal.create({
      data: {
        profileId: porVencer.profileId,
        type: 'MULTIPLES_ALTAS_MISMA_IP',
        createdAt: new Date(ahora.getTime() - 31 * DIA),
      },
    })

    const primera = await ejecutarTodos(ahora)

    comprobar('el cron termina completo', primera.ok, JSON.stringify(primera.jobs))
    comprobar(
      'la suscripción vencida pasa a EXPIRED',
      (await prisma.subscription.findUnique({ where: { id: dadoDeBaja.subscriptionId } }))?.status ===
        SubscriptionStatus.EXPIRED,
    )
    comprobar(
      'el perfil vencido se despublica',
      (await prisma.profile.findUnique({ where: { id: dadoDeBaja.profileId } }))?.isPublished === false,
    )

    const aviso = await prisma.emailLog.count({
      where: { profileId: porVencer.profileId, template: 'aviso_5d' },
    })

    comprobar('se envía un aviso de 5 días', aviso === 1, String(aviso))

    const despublicado = await prisma.emailLog.count({
      where: { profileId: dadoDeBaja.profileId, template: 'perfil_despublicado' },
    })

    comprobar('se avisa que el perfil fue despublicado', despublicado === 1, String(despublicado))
    comprobar(
      'la verificación vencida se marca EXPIRED',
      (await prisma.whatsAppVerification.findFirst({ where: { profileId: porVencer.profileId } }))?.status ===
        'EXPIRED',
    )
    comprobar(
      'la señal de IP vieja se borra',
      (await prisma.riskSignal.count({
        where: { profileId: porVencer.profileId, type: 'MULTIPLES_ALTAS_MISMA_IP' },
      })) === 0,
    )

    const segunda = await ejecutarTodos(ahora)

    comprobar('la segunda corrida también termina', segunda.ok, JSON.stringify(segunda.jobs))
    comprobar(
      'no se duplica el aviso de 5 días',
      (await prisma.emailLog.count({
        where: { profileId: porVencer.profileId, template: 'aviso_5d' },
      })) === 1,
    )
    comprobar(
      'no se duplica el aviso de despublicado',
      (await prisma.emailLog.count({
        where: { profileId: dadoDeBaja.profileId, template: 'perfil_despublicado' },
      })) === 1,
    )

    // -----------------------------------------------------------------------
    titulo('Aislamiento de errores entre jobs')

    registrarJob({
      name: 'job-que-falla',
      run: async () => {
        throw new Error('falla a propósito')
      },
    })

    const conFallo = await ejecutarTodos(ahora)
    const fallido = conFallo.jobs.find((job) => job.job === 'job-que-falla')

    comprobar('el cron reporta el fallo', conFallo.ok === false && fallido?.ok === false)
    comprobar(
      'los demás jobs corren igual',
      conFallo.jobs.filter((job) => job.job !== 'job-que-falla').every((job) => job.ok),
      JSON.stringify(conFallo.jobs),
    )

    // -----------------------------------------------------------------------
    titulo('Libro de quejas')

    const reclamo = await registrarReclamo({
      nombre: 'Cliente Prueba',
      email: 'reclamo@example.com',
      mensaje: 'Pagué la suscripción y no aparece el comprobante en el panel.',
      referencia: 'AR-20261027-PRUEBA',
    })

    comprobar('el reclamo se registra', reclamo.ok, reclamo.ok ? '' : reclamo.error)
    comprobar(
      'el número empieza con LQ',
      reclamo.ok && reclamo.data.numero.startsWith('LQ-'),
      reclamo.ok ? reclamo.data.numero : '',
    )

    const guardado = await prisma.complaint.findFirst({ where: { email: 'reclamo@example.com' } })

    comprobar('el reclamo queda en la base', Boolean(guardado))
    comprobar('el reclamo nace abierto', guardado?.status === 'ABIERTO')

    await prisma.complaint.deleteMany({ where: { email: 'reclamo@example.com' } })
  } finally {
    await borrar(creados)
    await prisma.$disconnect()
    limpiarMockMercadoPago()
  }

  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

  if (fallos > 0) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
