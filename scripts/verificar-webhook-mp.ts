/**
 * Verificación del webhook de Mercado Pago (módulo 2.4).
 *
 * Lo que se prueba acá no se puede probar en memoria: que un pago aprobado
 * active la suscripción y publique el perfil, que el mismo evento repetido no
 * duplique el cobro ni el email, que un rechazo de renovación abra la ventana
 * de gracia y que la firma inválida se rechace antes de tocar la base.
 *
 * Corre contra el proveedor **mock**: el script no puede depender de la API de
 * Mercado Pago ni de credenciales. Lo que se verifica es lo nuestro: la
 * transición de estados, la idempotencia y la publicación.
 *
 * Uso: npx tsx scripts/verificar-webhook-mp.ts
 */

import { Prisma, PrismaClient, SubscriptionStatus } from '@prisma/client'

const prisma = new PrismaClient()

process.env.EMAIL_MOCK = '1'
process.env.MP_WEBHOOK_SECRET =
  process.env.MP_WEBHOOK_SECRET ?? 'secreto-webhook-de-prueba'

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
  email: string
}

/**
 * Crea un profesional publicable, con o sin foto.
 *
 * La foto se puede omitir para probar que un pago aprobado activa la
 * suscripción pero no publica un perfil que no cumple el resto de los
 * requisitos.
 */
async function crearProfesional(
  nombre: string,
  conImagen = true,
): Promise<PerfilDePrueba> {
  const sufijo = Math.random().toString(36).slice(2, 8)
  const email = `webhook-${nombre}-${sufijo}@example.com`

  const user = await prisma.user.create({
    data: {
      email,
      emailVerified: new Date(),
      name: nombre,
    },
    select: { id: true },
  })

  const rubro = await prisma.category.findFirst({ select: { id: true } })
  const ciudad = await prisma.city.findFirst({ select: { id: true } })

  if (!rubro || !ciudad) {
    throw new Error('El seed no dejó catálogo. Corré el seed antes de este script.')
  }

  const slug = `webhook-${nombre}-${sufijo}`

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      type: 'PERSON',
      name: nombre,
      slug,
      description: 'Prueba del webhook de Mercado Pago en la base real del proyecto.',
      baseCityId: ciudad.id,
      whatsappE164: `549382${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      categories: { create: { categoryId: rubro.id, isPrimary: true } },
      images: conImagen
        ? {
            create: {
              publicId: `perfiles/${slug}/trabajo`,
              url: `https://res.cloudinary.com/demo/image/upload/perfiles/${slug}/trabajo.jpg`,
              width: 1200,
              height: 800,
              sortOrder: 0,
            },
          }
        : undefined,
    },
    select: { id: true },
  })

  return { userId: user.id, profileId: profile.id, email }
}

type SuscripcionDePrueba = {
  suscripcionId: string
  preapprovalId: string
}

/**
 * Deja una suscripción PENDING con su preapproval en el mock.
 *
 * Se escribe directo en vez de pasar por `crearSuscripcion` para que este
 * script no dependa de datos fiscales ni del precio del plan: lo que se prueba
 * es el webhook, no el alta.
 */
async function crearSuscripcionPendiente(
  perfil: PerfilDePrueba,
): Promise<SuscripcionDePrueba> {
  const { getProveedor } = await import('../src/lib/mp')

  const preapproval = await getProveedor().crearPreapproval({
    motivo: 'Prueba webhook',
    externalReference: perfil.profileId,
    backUrl: 'https://example.com/panel',
    notificationUrl: 'https://example.com/api/webhooks/mercadopago',
    monto: '10000.00',
    moneda: 'ARS',
    emailPagador: perfil.email,
    nombrePagador: 'Prueba Webhook',
  })

  const suscripcion = await prisma.subscription.create({
    data: {
      profileId: perfil.profileId,
      planAmount: new Prisma.Decimal(10000),
      status: SubscriptionStatus.PENDING,
      mpPreapprovalId: preapproval.id,
    },
    select: { id: true },
  })

  return { suscripcionId: suscripcion.id, preapprovalId: preapproval.id }
}

async function estadoSuscripcion(suscripcionId: string) {
  return prisma.subscription.findUniqueOrThrow({
    where: { id: suscripcionId },
    select: {
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      pastDueSince: true,
      graceUntil: true,
      profileId: true,
    },
  })
}

async function estaPublicado(profileId: string): Promise<boolean> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { isPublished: true },
  })

  return perfil?.isPublished ?? false
}

async function borrarPerfiles(perfiles: PerfilDePrueba[]): Promise<void> {
  if (perfiles.length === 0) return

  const ids = perfiles.map((p) => p.profileId)

  await prisma.emailLog.deleteMany({ where: { profileId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: perfiles.map((p) => p.userId) } } })
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { env } = await import('../src/lib/env')
  const { firmarWebhook } = await import('../src/lib/mp/firma')
  const {
    crearPagoAutorizadoMock,
    crearPagoMock,
    limpiarMockMercadoPago,
    setearEstadoMock,
    setearEstadoPagoMock,
  } = await import('../src/lib/mp')
  const { procesarWebhookMercadoPago } = await import(
    '../src/services/webhook-mercadopago'
  )
  const { sincronizarPublicacion } = await import('../src/services/publicacion')
  const { POST } = await import('../src/app/api/webhooks/mercadopago/route')

  limpiarMockMercadoPago()
  await prisma.webhookEvent.deleteMany({ where: { provider: 'MERCADOPAGO' } })

  const creados: PerfilDePrueba[] = []
  const nuevo = async (nombre: string, conImagen = true): Promise<PerfilDePrueba> => {
    const perfil = await crearProfesional(nombre, conImagen)
    creados.push(perfil)
    return perfil
  }

  const eventoPago = (recursoId: string) => ({
    tipo: 'payment' as const,
    recursoId,
    notificacionId: null,
    accion: null,
  })

  const procesarPago = (recursoId: string) =>
    procesarWebhookMercadoPago({
      evento: eventoPago(recursoId),
      payloadHash: `hash-${recursoId}`,
    })

  try {
    // -----------------------------------------------------------------------
    titulo('La firma de la ruta')

    const perfilFirma = await nuevo('firma')
    const suscripcionFirma = await crearSuscripcionPendiente(perfilFirma)
    const pagoFirma = crearPagoMock({
      preapprovalId: suscripcionFirma.preapprovalId,
      externalReference: perfilFirma.profileId,
      monto: 10000,
      fee: 350,
    })

    const ts = String(Math.floor(Date.now() / 1000))
    const requestId = `req-${Math.random().toString(36).slice(2)}`
    const body = JSON.stringify({ type: 'payment', data: { id: pagoFirma } })
    const firma = firmarWebhook({
      dataId: pagoFirma,
      ts,
      requestId,
      secreto: env.MP_WEBHOOK_SECRET,
    })

    const llamarRuta = async (
      cuerpo: string,
      opciones: { firma?: string | null; requestId?: string | null } = {},
    ): Promise<{ status: number; body: unknown }> => {
      const headers = new Headers({ 'content-type': 'application/json' })

      if (opciones.firma !== null) headers.set('x-signature', opciones.firma ?? `ts=${ts},v1=${firma}`)
      if (opciones.requestId !== null) headers.set('x-request-id', opciones.requestId ?? requestId)

      const response = await POST(
        new Request('https://example.com/api/webhooks/mercadopago', {
          method: 'POST',
          headers,
          body: cuerpo,
        }),
      )

      const texto = await response.text()

      let parseado: unknown = null
      try {
        parseado = texto.length > 0 ? JSON.parse(texto) : null
      } catch {
        parseado = texto
      }

      return { status: response.status, body: parseado }
    }

    const firmaInvalida = await llamarRuta(body, {
      firma: `ts=${ts},v1=${'0'.repeat(64)}`,
    })
    comprobar('una firma que no coincide se rechaza con 401', firmaInvalida.status === 401)

    const sinFirma = await llamarRuta(body, { firma: null })
    comprobar('una notificación sin firma se rechaza con 401', sinFirma.status === 401)

    const bodyInvalido = await llamarRuta('{', { firma: null, requestId: null })
    comprobar('un body que no es JSON se rechaza con 400', bodyInvalido.status === 400)

    const tipoDesconocido = JSON.stringify({
      type: 'point_integration_wh',
      data: { id: 'point-1' },
    })
    const firmaPoint = firmarWebhook({
      dataId: 'point-1',
      ts,
      requestId,
      secreto: env.MP_WEBHOOK_SECRET,
    })
    const punto = await llamarRuta(tipoDesconocido, {
      firma: `ts=${ts},v1=${firmaPoint}`,
    })
    comprobar('un tipo de evento desconocido responde 200', punto.status === 200)
    comprobar(
      'y no se procesa',
      typeof punto.body === 'object' &&
        punto.body !== null &&
        (punto.body as { accion?: string }).accion === 'ignorado',
    )

    const procesado = await llamarRuta(body)
    comprobar('una firma válida procesa el pago', procesado.status === 200)
    comprobar(
      'y lo informa como procesado',
      typeof procesado.body === 'object' &&
        procesado.body !== null &&
        (procesado.body as { accion?: string }).accion === 'procesado',
    )

    const repetido = await llamarRuta(body)
    comprobar('el mismo evento repetido responde 200', repetido.status === 200)
    comprobar(
      'y se marca duplicado',
      typeof repetido.body === 'object' &&
        repetido.body !== null &&
        (repetido.body as { accion?: string }).accion === 'duplicado',
    )

    const suscripcionActiva = await estadoSuscripcion(suscripcionFirma.suscripcionId)

    comprobar(
      'el pago aprobado activa la suscripción',
      suscripcionActiva.status === SubscriptionStatus.ACTIVE,
      suscripcionActiva.status,
    )
    comprobar('con período pagado', suscripcionActiva.currentPeriodEnd !== null)
    comprobar('y publica el perfil', await estaPublicado(perfilFirma.profileId))

    const pagoGuardado = await prisma.payment.findUnique({
      where: { mpPaymentId: pagoFirma },
      select: { amount: true, feeAmount: true, netAmount: true, status: true },
    })

    comprobar('el pago queda guardado', pagoGuardado !== null)
    comprobar(
      'con el monto que cobró Mercado Pago',
      pagoGuardado?.amount.toNumber() === 10000,
      String(pagoGuardado?.amount),
    )
    comprobar(
      'y la comisión separada del neto',
      pagoGuardado?.feeAmount?.toNumber() === 350 &&
        pagoGuardado?.netAmount?.toNumber() === 9650,
    )
    comprobar(
      'un solo pago para el mismo evento',
      (await prisma.payment.count({ where: { mpPaymentId: pagoFirma } })) === 1,
    )

    const emails = await prisma.emailLog.count({
      where: { profileId: perfilFirma.profileId, template: 'pago_aprobado' },
    })
    comprobar('y un solo email de pago aprobado', emails === 1, String(emails))

    // -----------------------------------------------------------------------
    titulo('Rechazo de una renovación')

    const perfilRechazo = await nuevo('rechazo')
    const suscripcionRechazo = await crearSuscripcionPendiente(perfilRechazo)
    const pagoBueno = crearPagoMock({
      preapprovalId: suscripcionRechazo.preapprovalId,
      externalReference: perfilRechazo.profileId,
      monto: 10000,
    })

    await procesarPago(pagoBueno)

    const pagoMalo = crearPagoMock({
      preapprovalId: suscripcionRechazo.preapprovalId,
      externalReference: perfilRechazo.profileId,
      monto: 10000,
      estado: 'rejected',
    })

    await procesarPago(pagoMalo)

    const trasRechazo = await estadoSuscripcion(suscripcionRechazo.suscripcionId)

    comprobar(
      'la suscripción pasa a PAST_DUE',
      trasRechazo.status === SubscriptionStatus.PAST_DUE,
      trasRechazo.status,
    )
    comprobar('con una ventana de gracia', trasRechazo.graceUntil !== null)
    comprobar(
      'y el perfil sigue publicado durante la gracia',
      await estaPublicado(perfilRechazo.profileId),
    )

    await prisma.subscription.update({
      where: { id: suscripcionRechazo.suscripcionId },
      data: { graceUntil: new Date(Date.now() - 1000) },
    })
    await sincronizarPublicacion(perfilRechazo.profileId)

    comprobar(
      'cuando la gracia vence, el perfil se despublica',
      !(await estaPublicado(perfilRechazo.profileId)),
    )

    // -----------------------------------------------------------------------
    titulo('Reembolso')

    const perfilReembolso = await nuevo('reembolso')
    const suscripcionReembolso = await crearSuscripcionPendiente(perfilReembolso)
    const pagoReembolsable = crearPagoMock({
      preapprovalId: suscripcionReembolso.preapprovalId,
      externalReference: perfilReembolso.profileId,
      monto: 10000,
    })

    await procesarPago(pagoReembolsable)
    setearEstadoPagoMock(pagoReembolsable, 'refunded')
    await procesarPago(pagoReembolsable)

    const trasReembolso = await estadoSuscripcion(suscripcionReembolso.suscripcionId)
    const pagoReembolsado = await prisma.payment.findUnique({
      where: { mpPaymentId: pagoReembolsable },
      select: { status: true, refundedAt: true },
    })

    comprobar('el pago queda REFUNDED', pagoReembolsado?.status === 'REFUNDED')
    comprobar('con fecha de reembolso', pagoReembolsado?.refundedAt !== null)
    comprobar(
      'la suscripción pasa a PAST_DUE',
      trasReembolso.status === SubscriptionStatus.PAST_DUE,
      trasReembolso.status,
    )
    comprobar(
      'y el perfil sigue publicado mientras dure el período y la gracia',
      await estaPublicado(perfilReembolso.profileId),
    )

    // -----------------------------------------------------------------------
    titulo('Cancelación del preapproval')

    const perfilBaja = await nuevo('baja')
    const suscripcionBaja = await crearSuscripcionPendiente(perfilBaja)
    const pagoBaja = crearPagoMock({
      preapprovalId: suscripcionBaja.preapprovalId,
      externalReference: perfilBaja.profileId,
      monto: 10000,
    })

    await procesarPago(pagoBaja)
    setearEstadoMock(suscripcionBaja.preapprovalId, 'cancelled')

    await procesarWebhookMercadoPago({
      evento: {
        tipo: 'subscription_preapproval',
        recursoId: suscripcionBaja.preapprovalId,
        notificacionId: null,
        accion: null,
      },
      payloadHash: 'hash-preapproval',
    })

    const trasBaja = await estadoSuscripcion(suscripcionBaja.suscripcionId)

    comprobar('la baja queda programada al final del período', trasBaja.cancelAtPeriodEnd)
    comprobar('con fecha de cancelación', trasBaja.cancelledAt !== null)
    comprobar(
      'el estado no se adelanta',
      trasBaja.status === SubscriptionStatus.ACTIVE,
      trasBaja.status,
    )
    comprobar('y el perfil sigue publicado', await estaPublicado(perfilBaja.profileId))

    // -----------------------------------------------------------------------
    titulo('Primer pago rechazado')

    const perfilPrimerRechazo = await nuevo('primer-rechazo')
    const suscripcionPrimerRechazo = await crearSuscripcionPendiente(perfilPrimerRechazo)
    const pagoPrimerRechazo = crearPagoMock({
      preapprovalId: suscripcionPrimerRechazo.preapprovalId,
      externalReference: perfilPrimerRechazo.profileId,
      monto: 10000,
      estado: 'rejected',
    })

    await procesarPago(pagoPrimerRechazo)

    const trasPrimerRechazo = await estadoSuscripcion(
      suscripcionPrimerRechazo.suscripcionId,
    )

    comprobar(
      'la suscripción sigue PENDING',
      trasPrimerRechazo.status === SubscriptionStatus.PENDING,
      trasPrimerRechazo.status,
    )
    comprobar('sin ventana de gracia', trasPrimerRechazo.graceUntil === null)
    comprobar(
      'y el perfil no se publica',
      !(await estaPublicado(perfilPrimerRechazo.profileId)),
    )

    // -----------------------------------------------------------------------
    titulo('Pago aprobado sin foto')

    const perfilSinFoto = await nuevo('sin-foto', false)
    const suscripcionSinFoto = await crearSuscripcionPendiente(perfilSinFoto)
    const pagoSinFoto = crearPagoMock({
      preapprovalId: suscripcionSinFoto.preapprovalId,
      externalReference: perfilSinFoto.profileId,
      monto: 10000,
    })

    await procesarPago(pagoSinFoto)

    const trasSinFoto = await estadoSuscripcion(suscripcionSinFoto.suscripcionId)

    comprobar(
      'el pago activa la suscripción',
      trasSinFoto.status === SubscriptionStatus.ACTIVE,
      trasSinFoto.status,
    )
    comprobar(
      'pero el perfil no se publica sin foto',
      !(await estaPublicado(perfilSinFoto.profileId)),
    )

    // -----------------------------------------------------------------------
    titulo('Cobro autorizado de la suscripción')

    const perfilAutorizado = await nuevo('autorizado')
    const suscripcionAutorizada = await crearSuscripcionPendiente(perfilAutorizado)
    const pagoAutorizado = crearPagoMock({
      preapprovalId: suscripcionAutorizada.preapprovalId,
      externalReference: perfilAutorizado.profileId,
      monto: 10000,
    })
    const cobroAutorizado = crearPagoAutorizadoMock({
      pagoId: pagoAutorizado,
      preapprovalId: suscripcionAutorizada.preapprovalId,
      externalReference: perfilAutorizado.profileId,
    })

    await procesarWebhookMercadoPago({
      evento: {
        tipo: 'subscription_authorized_payment',
        recursoId: cobroAutorizado,
        notificacionId: null,
        accion: null,
      },
      payloadHash: 'hash-autorizado',
    })

    const trasAutorizado = await estadoSuscripcion(suscripcionAutorizada.suscripcionId)

    comprobar(
      'el cobro autorizado activa la suscripción',
      trasAutorizado.status === SubscriptionStatus.ACTIVE,
      trasAutorizado.status,
    )
    comprobar(
      'y guarda el pago real',
      (await prisma.payment.count({ where: { mpPaymentId: pagoAutorizado } })) === 1,
    )

    // -----------------------------------------------------------------------
    titulo('Pago que no existe')

    const inexistente = await procesarPago('mock-pago-inexistente')

    comprobar('se ignora sin error', inexistente.ok)
    comprobar(
      'con el motivo',
      inexistente.ok && inexistente.data.accion === 'ignorado',
    )
    comprobar(
      'y no deja evento reservado',
      (await prisma.webhookEvent.count({
        where: { id: { contains: 'mock-pago-inexistente' } },
      })) === 0,
    )

    // -----------------------------------------------------------------------
    console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

    if (fallos > 0) {
      console.log(`${fallos} FALLAS`)
      process.exitCode = 1
    }
  } finally {
    limpiarMockMercadoPago()
    await prisma.webhookEvent.deleteMany({ where: { provider: 'MERCADOPAGO' } })

    try {
      await borrarPerfiles(creados)
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
    console.error('\nError en la verificación del webhook:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
