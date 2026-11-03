import { Prisma, SubscriptionStatus, type InvoiceStatus } from '@prisma/client'

import { aNumero, ErrorMontoInvalido } from '@/lib/dinero'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { ErrorMercadoPago, getProveedor } from '@/lib/mp'
import { prisma } from '@/lib/prisma'
import {
  evaluarRequisitosPago,
  importeParaPasarela,
  precioDeAlta,
  VERSION_TERMINOS,
  type RequisitoPago,
} from '@/lib/suscripcion'
import {
  aceptarTerminosSchema,
  datosFiscalesSchema,
  type DatosFiscales,
} from '@/schemas/suscripcion'
import { leerPlanVigente } from '@/services/planes'
import {
  canjearCupon,
  validarCuponParaPerfil,
} from '@/services/cupones'
import { montoParaPasarela } from '@/lib/cupones'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Suscripciones: alta, estado y baja de la renovación.
 *
 * Todo lo que se decide sin base está en `lib/suscripcion.ts`; acá vive lo que
 * necesita leer o escribir. El módulo tiene tres puntos donde es fácil meter la
 * pata, y son los que estructuran el archivo:
 *
 * 1. **La llamada a Mercado Pago va antes de escribir en la base, y no después.**
 *    Es contraintuitivo y es lo correcto: una llamada de red no puede hacerse
 *    dentro de una transacción con bloqueo de fila, porque bloquea a todos los
 *    demás del perfil mientras la red tarda. Al revés, un preapproval creado y un
 *    `insert` que falla dejan un preapproval huérfano en Mercado Pago; eso se
 *    limpia cancelándolo, y una fila huérfana en la base no se puede limpiar
 *    sola. El huérfano se cancela best-effort, el otro no llega a existir.
 * 2. **La carrera de los dos clics.** Dos "Suscribirme" simultáneos crean dos
 *    preapprovals y compiten por la misma fila de `Subscription`. Se resuelve
 *    bloqueando la fila del perfil (`FOR UPDATE`, D5 y D20) y dejando que el
 *    índice único de `profileId` rechace al segundo, cuyo preapproval se
 *    cancela en el camino de error.
 * 3. **La baja no despublica.** Cancelar el cobro recurrente no devuelve lo ya
 *    cobrado ni termina el período pagado: el perfil sigue visible hasta
 *    `currentPeriodEnd` y recién ahí el cron (2.7) lo pasa a CANCELLED.
 */

/** Error de negocio lanzado dentro de la transacción, para provocar rollback. */
class ErrorSuscripcion extends Error {
  constructor(
    message: string,
    readonly code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  ) {
    super(message)
    this.name = 'ErrorSuscripcion'
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Suscripción de un perfil, con lo que la pantalla necesita mostrar.
 *
 * El `select` es explícito y no un `findUnique` a secas por una razón concreta:
 * esta función la usa la pantalla de suscripción, y un `findUnique` con todas
 * las columnas escalares traería también los datos fiscales de todos los
 * profesionales que abren la pantalla, sin que nadie los pidiera (ver el
 * comentario de `FiscalData` en el schema).
 */
export async function obtenerSuscripcion(profileId: string) {
  return prisma.subscription.findUnique({
    where: { profileId },
    select: {
      id: true,
      profileId: true,
      status: true,
      planAmount: true,
      priceFrozen: true,
      mpPreapprovalId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancelledAt: true,
      pastDueSince: true,
      graceUntil: true,
      termsVersion: true,
      termsAcceptedAt: true,
      createdAt: true,
    },
  })
}

export type SuscripcionActual = NonNullable<Awaited<ReturnType<typeof obtenerSuscripcion>>>

/** Un pago del historial, como lo pinta la pantalla. */
export type PagoHistorial = {
  id: string
  monto: number
  moneda: string
  estado: string
  pagadoEn: Date | null
  reembolsadoEn: Date | null
  creadoEn: Date
  factura: {
    id: string
    estado: InvoiceStatus
    numero: number | null
    pdfUrl: string | null
  } | null
}

/**
 * Historial de pagos, del más nuevo al más viejo.
 *
 * Los pagos no se borran nunca: son el respaldo de lo que se facturó, y el
 * módulo 2.5 los necesita para emitir. Por eso el `orderBy` es por fecha con un
 * desempate por id: dos pagos del mismo lote quedan en un orden estable y la
 * pantalla no cambia de fila entre dos visitas.
 *
 * `take: 24` es un tope de pantalla, no de dato: los pagos que quedan afuera
 * siguen en la base y los ve el contador.
 */
export async function listarPagos(profileId: string): Promise<PagoHistorial[]> {
  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: { id: true },
  })

  if (!suscripcion) return []

  const pagos = await prisma.payment.findMany({
    where: { subscriptionId: suscripcion.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 24,
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      paidAt: true,
      refundedAt: true,
      createdAt: true,
      invoice: {
        select: { id: true, status: true, numero: true, pdfUrl: true },
      },
    },
  })

  return pagos.map((pago) => ({
    id: pago.id,
    monto: aNumeroSeguido(pago.amount) ?? 0,
    moneda: pago.currency,
    estado: pago.status,
    pagadoEn: pago.paidAt,
    reembolsadoEn: pago.refundedAt,
    creadoEn: pago.createdAt,
    factura: pago.invoice
      ? {
          id: pago.invoice.id,
          estado: pago.invoice.status,
          numero: pago.invoice.numero,
          pdfUrl: pago.invoice.pdfUrl,
        }
      : null,
  }))
}

/** Datos fiscales cargados. `null` si nunca los cargó. */
export async function obtenerDatosFiscales(profileId: string) {
  return prisma.fiscalData.findUnique({
    where: { profileId },
    select: {
      tipoPersona: true,
      nombreORazonSocial: true,
      documento: true,
      condicionIva: true,
      domicilioFiscal: true,
    },
  })
}

// ---------------------------------------------------------------------------
// Requisitos para pagar
// ---------------------------------------------------------------------------

/**
 * Qué le falta al profesional para poder abrir un checkout.
 *
 * Consulta la base y devuelve la lista de motivos. Es lo que pinta el checklist
 * de la pantalla de suscripción y **no** autoriza el cobro por sí sola:
 * `crearSuscripcion` vuelve a evaluar los mismos requisitos dentro de la
 * transacción, contra los datos de ese momento.
 */
export async function requisitosDePago(profileId: string): Promise<RequisitoPago[]> {
  const datos = await leerParaRequisitos(profileId)

  if (!datos) return ['PERFIL_INCOMPLETO']

  return evaluarRequisitosPago(datos)
}

/** Perfil completo para poder cobrar. Un subconjunto del de publicación. */
function esPerfilCompleto(perfil: {
  baseCityId: string | null
  description: string | null
}): boolean {
  return (
    perfil.baseCityId !== null &&
    typeof perfil.description === 'string' &&
    perfil.description.trim().length >= 20
  )
}

/**
 * Carga lo mínimo para decidir los requisitos.
 *
 * Una sola consulta con las relaciones: son cinco datos que salen de tres tablas
 * y separarlas en tres viajes agrega latencia a una pantalla que se abre en
 * cada visita al panel.
 */
async function leerParaRequisitos(profileId: string) {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      baseCityId: true,
      description: true,
      user: { select: { emailVerified: true } },
      whatsappVerifiedAt: true,
      categories: { select: { isPrimary: true } },
      fiscalData: { select: { id: true } },
    },
  })

  if (!perfil) return null

  return {
    emailVerificado: perfil.user.emailVerified !== null,
    whatsappVerificado: perfil.whatsappVerifiedAt !== null,
    tieneRubroPrincipal: perfil.categories.some((c) => c.isPrimary),
    perfilCompleto: esPerfilCompleto(perfil),
    tieneDatosFiscales: perfil.fiscalData !== null,
  }
}

// ---------------------------------------------------------------------------
// Datos fiscales
// ---------------------------------------------------------------------------

/**
 * Guarda los datos fiscales del profesional.
 *
 * Se piden **antes** del primer pago y no después: cuando llega el pago aprobado
 * hay que emitir la factura (2.5), y sin estos datos no se puede. Pedir el
 * comprobante en el mismo instante del cobro pone al profesional en la posición
 * de elegir entre que le facturen y que su perfil siga visible.
 *
 * El hash del documento impide que dos perfiles facturen como la misma persona.
 * Va en `documentoHash`, no en `cuitHash` de `Profile`, porque son cosas
 * distintas: el CUIT de empresa del perfil (D3) y el documento fiscal del
 * profesional que paga pueden ser el mismo número o dos diferentes, y el que
 * tiene que ser único para no duplicar comprobantes es este.
 */
export async function guardarDatosFiscales(
  profileId: string,
  entrada: unknown,
): Promise<Resultado<null>> {
  const parseado = datosFiscalesSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos fiscales.', ERROR_CODES.VALIDACION)
  }

  const datos: DatosFiscales = parseado.data

  /**
   * El hash lleva el tipo de persona adelante.
   *
   * Sin eso, el CUIT `30123456789` de una persona y el DNI `12345678` no se
   * pisarían (tienen largo distinto) pero dos tipos distintos con el mismo
   * número sí podrían. Prefijar es lo que hace único al par, que es lo que
   * importa.
   */
  const hash = hashValor(`${datos.tipoPersona}:${datos.documento}`)

  try {
    await prisma.fiscalData.upsert({
      where: { profileId },
      create: {
        profileId,
        tipoPersona: datos.tipoPersona,
        nombreORazonSocial: datos.nombreORazonSocial,
        documento: datos.documento,
        documentoHash: hash,
        condicionIva: datos.condicionIva,
        domicilioFiscal: datos.domicilioFiscal,
      },
      update: {
        tipoPersona: datos.tipoPersona,
        nombreORazonSocial: datos.nombreORazonSocial,
        documento: datos.documento,
        documentoHash: hash,
        condicionIva: datos.condicionIva,
        domicilioFiscal: datos.domicilioFiscal,
      },
    })
  } catch (error: unknown) {
    /**
     * Choque de `documentoHash`.
     *
     * Solo puede significar que otro perfil ya carga ese documento. El mensaje
     * lo dice sin decir qué perfil es ni qué documento: darle el dato ayudaría
     * al que está probando, no al que se equivocó.
     */
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.warn('suscripción: documento fiscal ya usado por otro perfil', { profileId })
      return err(
        'Ese documento ya está cargado en otro perfil. Revisá el número o escribinos.',
        ERROR_CODES.DUPLICADO,
      )
    }

    logger.error('suscripción: no se pudieron guardar los datos fiscales', { profileId, error })
    return err('No pudimos guardar tus datos fiscales. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  return ok(null)
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

/**
 * Abre un checkout de Mercado Pago para este perfil.
 *
 * Devuelve la URL a la que hay que redirigir. **No** activa la suscripción: eso
 * lo hace el webhook del 2.4 cuando ve un pago aprobado. Si esta función
 * activara la suscripción, cualquiera que llegue a la pantalla podría aparecer
 * en el portal sin haber pagado nunca, que es el negocio entero.
 *
 * @param profileId Perfil dueño. Sale de la sesión, nunca del cliente.
 * @param entrada Aceptación de los términos, ya validada por el servidor.
 */
export async function crearSuscripcion(
  profileId: string,
  entrada: unknown,
  codigoCupon?: string,
): Promise<Resultado<{ urlCheckout: string }>> {
  const aceptado = aceptarTerminosSchema.safeParse(entrada)

  if (!aceptado.success) {
    return err(
      'Necesitamos que aceptes las condiciones para cobrarte.',
      ERROR_CODES.VALIDACION,
    )
  }

  /**
   * Los requisitos se evalúan **antes** de hablar con Mercado Pago.
   *
   * No es una cuestión de ahorro: si se creara el preapproval y después se
   * descubriera que falta el WhatsApp verificado, queda un cobro recurrente
   * abierto en la cuenta de alguien que todavía ni siquiera pudo pagar. Crear
   * el preapproval es la parte difícil de revertir.
   */
  const faltantes = await requisitosDePago(profileId)

  if (faltantes.length > 0) {
    return err(
      faltantes.length === 1
        ? 'Todavía no podés suscribirte: falta un requisito.'
        : `Todavía no podés suscribirte: faltan ${faltantes.length} requisitos.`,
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  /**
   * Sin plan no se cobra, y no se cobra con un monto de respaldo.
   *
   * Mismo criterio de D24 para la pantalla: es preferible bloquear la compra un
   * segundo a cobrarle a alguien una cifra que nadie le prometió, que no se
   * puede deshacer.
   */
  const plan = await leerPlanVigente()

  if (!plan) {
    return err(
      'No hay ningún plan disponible en este momento. Escribinos y te avisamos apenas haya.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  let montoConDescuento: number | null = null
  let cupoIdUsado: string | null = null
  let rubroSlug: string | null = null
  let provincia: string | null = null
  let whatsappHashParaCupon: string | null = null
  let cuitHashParaCupon: string | null = null

  if (codigoCupon) {
    const perfilParaCupon = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        whatsappHash: true,
        cuitHash: true,
        categories: {
          where: { isPrimary: true },
          select: { category: { select: { slug: true } } },
        },
        baseCity: { select: { province: true } },
      },
    })

    rubroSlug = perfilParaCupon?.categories[0]?.category?.slug ?? null
    provincia = perfilParaCupon?.baseCity?.province ?? null
    whatsappHashParaCupon = perfilParaCupon?.whatsappHash ?? null
    cuitHashParaCupon = perfilParaCupon?.cuitHash ?? null

    const validacion = await validarCuponParaPerfil({
      profileId,
      codigo: codigoCupon,
      rubroSlug,
      provincia,
      whatsappHash: whatsappHashParaCupon,
      cuitHash: cuitHashParaCupon,
    })

    if (!validacion.ok) {
      return validacion
    }

    montoConDescuento = validacion.data.montoFinal
    cupoIdUsado = validacion.data.cupo.id
  }

  const actual = await obtenerSuscripcion(profileId)

  if (actual?.status === SubscriptionStatus.ACTIVE) {
    return err('Ya tenés una suscripción activa.', ERROR_CODES.DUPLICADO)
  }

  const montoPrevio = actual ? aNumeroSeguido(actual.planAmount) : null
  const montoBase = precioDeAlta(
    montoPrevio,
    actual?.priceFrozen ?? false,
    plan.monto,
  )
  const monto = montoConDescuento ?? montoBase

  const importe = montoConDescuento !== null
    ? montoParaPasarela(monto)
    : safeImporte(monto)

  if (importe === null) {
    logger.error('suscripción: el monto a cobrar no es un número válido', { profileId })
    return err('No pudimos preparar el cobro. Escribinos y lo resolvemos.', ERROR_CODES.ERROR_EXTERNO)
  }

  const pagador = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { user: { select: { email: true, name: true } } },
  })

  /**
   * Preapprovals que esta alta deja atrás y hay que cerrar.
   *
   * Vive afuera de la transacción a propósito: dentro solo se lee el id que
   * estaba y se anota, y la llamada a la red se hace después del commit. Si se
   * cancelara adentro, la transacción tendría una llamada de red con la fila del
   * perfil bloqueada, que es la razón por la que la llamada está afuera.
   */
  const reemplazados: string[] = []

  let creado: { id: string; urlCheckout: string }

  try {
    creado = await getProveedor().crearPreapproval({
      motivo: `${plan.nombre} — PoliserviciosNOA`,
      externalReference: profileId,
      backUrl: urlDeResultado(),
      notificationUrl: urlDeWebhook(),
      monto: importe,
      moneda: plan.moneda,
      emailPagador: pagador?.user.email ?? '',
      nombrePagador: pagador?.user.name ?? '',
    })
  } catch (error: unknown) {
    if (error instanceof ErrorMercadoPago) {
      logger.warn('suscripción: Mercado Pago rechazó el alta', {
        profileId,
        status: error.status,
      })
      return err(error.message, ERROR_CODES.ERROR_EXTERNO)
    }

    logger.error('suscripción: error inesperado creando el preapproval', { profileId, error })
    return err('No pudimos abrir el pago. Probá de nuevo.', ERROR_CODES.ERROR_EXTERNO)
  }

  const ahora = new Date()

  try {
    /**
     * La escritura va con `FOR UPDATE` sobre el perfil.
     *
     * Es el patrón de D5 y D20: se bloquea la fila antes de mirar el estado de la
     * suscripción, no después. Dos clics simultáneos sobre "Suscribirme" crean
     * los dos preapprovals —la llamada a la red está fuera de la transacción, a
     * propósito— y el segundo que entra a la transacción se encuentra con el
     * índice único de `profileId` ya tomado y revienta. El reventón del segundo
     * es el final esperado, no un error a manejar de otra manera.
     */
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "Profile" WHERE id = ${profileId} FOR UPDATE
        `

        /**
         * Los requisitos se vuelven a mirar adentro, con los datos de este
         * momento. Afuera ya se habían comprobado, pero entre la primera lectura
         * y esta escritura el profesional puede haber desverificado el email, y
         * cobrar a alguien que ya no cumple los requisitos es peor que rechazar
         * el pago con un mensaje.
         */
        const perfil = await tx.profile.findUnique({
          where: { id: profileId },
          select: {
            baseCityId: true,
            description: true,
            user: { select: { emailVerified: true } },
            whatsappVerifiedAt: true,
            categories: { select: { isPrimary: true } },
            fiscalData: { select: { id: true } },
          },
        })

        if (!perfil) {
          throw new ErrorSuscripcion('No encontramos tu perfil.', ERROR_CODES.NO_ENCONTRADO)
        }

        const faltantesAhora = evaluarRequisitosPago({
          emailVerificado: perfil.user.emailVerified !== null,
          whatsappVerificado: perfil.whatsappVerifiedAt !== null,
          tieneRubroPrincipal: perfil.categories.some((c) => c.isPrimary),
          perfilCompleto: esPerfilCompleto(perfil),
          tieneDatosFiscales: perfil.fiscalData !== null,
        })

        if (faltantesAhora.length > 0) {
          throw new ErrorSuscripcion(
            'Cambiaste algo de tu perfil mientras pagabas. Revisá los requisitos e intentá de nuevo.',
            ERROR_CODES.ESTADO_INVALIDO,
          )
        }

        /**
         * El plan tiene que seguir activo adentro de la transacción.
         *
         * Fuera se leyó con caché y adentro va a la base: si el admin apagó el
         * plan entre medio, estaríamos creando un preapproval con el precio de
         * un plan que ya no se vende, que es exactamente lo que D24 impide.
         */
        const vigente = await tx.plan.findUnique({
          where: { id: plan.id },
          select: { isActive: true },
        })

        if (!vigente?.isActive) {
          throw new ErrorSuscripcion(
            'El precio que vemos y el que está cargado no coinciden. Recargá la pantalla.',
            ERROR_CODES.ESTADO_INVALIDO,
          )
        }

        /**
         * Se anota el preapproval que esta alta deja atrás.
         *
         * Se lee **adentro** de la transacción y no afuera, y esa es la
         * diferencia entre un reintento y una fuga de dinero. Siete clics
         * simultáneos sobre "Suscribirme" crean los siete preapprovals en
         * Mercado Pago —la llamada está fuera de la transacción, a propósito— y
         * los siete leen `mpPreapprovalId` en `null` antes de que ninguno
         * escriba. Los siete entonces pasan, los siete escriben y el último gana
         * la fila: **los otros seis quedan cobrando y nadie los tiene registrados**.
         *
         * Leyéndolo acá adentro, con la fila bloqueada, cada alta ve el preapproval
         * que dejó la anterior y lo manda a cancelar después del commit. Al final
         * queda uno vivo, que es el que está en la fila.
         */
        const anterior = await tx.subscription.findUnique({
          where: { profileId },
          select: { mpPreapprovalId: true },
        })

        if (anterior?.mpPreapprovalId && anterior.mpPreapprovalId !== creado.id) {
          reemplazados.push(anterior.mpPreapprovalId)
        }

        /**
         * `upsert` y no `create`.
         *
         * El índice único de `profileId` deja una sola suscripción por perfil
         * para siempre, y los `Payment` cuelgan de esa fila. Crear de nuevo en
         * cada reintento tiraría el historial de pagos del intento anterior, que
         * es justo lo que el profesional necesita para reclamar si algo se cobró
         * dos veces.
         *
         * Se reinician los campos del período y el de cancelación porque es un
         * alta nueva: el `currentPeriodEnd` del intento anterior ya venció o
         * nunca existió.
         */
        await tx.subscription.upsert({
          where: { profileId },
          create: {
            profileId,
            planId: plan.id,
            planAmount: new Prisma.Decimal(monto),
            priceFrozen: actual?.priceFrozen ?? false,
            status: SubscriptionStatus.PENDING,
            mpPreapprovalId: creado.id,
            termsVersion: VERSION_TERMINOS,
            termsAcceptedAt: ahora,
          },
          update: {
            planId: plan.id,
            planAmount: new Prisma.Decimal(monto),
            status: SubscriptionStatus.PENDING,
            mpPreapprovalId: creado.id,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            pastDueSince: null,
            graceUntil: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            termsVersion: VERSION_TERMINOS,
            termsAcceptedAt: ahora,
          },
        })

        if (cupoIdUsado) {
          const canje = await canjearCupon({
            tx,
            profileId,
            codigo: codigoCupon!,
            rubroSlug,
            provincia,
            whatsappHash: whatsappHashParaCupon,
            cuitHash: cuitHashParaCupon,
            ahora,
            montoDelPlan: plan.monto,
          })

          if (!canje.ok) {
            logger.warn('cupones: no se pudo canjear el cupón tras crear la suscripción', {
              profileId,
              codigo: codigoCupon,
              error: canje.error,
            })
          }
        }
      },
      { timeout: 15000, maxWait: 5000 },
    )
  } catch (error: unknown) {
    /**
     * La escritura falló y el preapproval que acabamos de crear sigue vivo en
     * Mercado Pago.
     *
     * Se cancela best-effort y el id va al log. Si la cancelación falla queda un
     * cobro recurrente abierto que hay que revisar a mano, y por eso el `id`
     * tiene que quedar registrado.
     */
    const colision =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

    await cancelarPreapproval(creado.id)

    if (error instanceof ErrorSuscripcion) {
      return err(error.message, error.code)
    }

    if (colision) {
      logger.warn('suscripción: dos altas simultáneas, se ganó la primera', { profileId })
      return err('Ya hay una suscripción en curso para tu perfil.', ERROR_CODES.DUPLICADO)
    }

    logger.error('suscripción: no se pudo guardar el alta', { profileId, error })
    return err('No pudimos guardar la suscripción. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  /**
   * Ahora que la fila es de esta alta, se cierran los preapprovals que quedaron
   * atrás.
   *
   * Va después del commit y no antes porque cancelar el viejo antes de
   * escribir el nuevo abre una ventana en la que el profesional no tiene ningún
   * cobro vivo: si el `upsert` fallara en ese medio, se quedaba sin suscripción
   * y sin forma de cobrar. El orden inverso es el que importa.
   */
  for (const mpPreapprovalId of reemplazados) {
    await cancelarPreapproval(mpPreapprovalId)
  }

  return ok({ urlCheckout: creado.urlCheckout })
}

// ---------------------------------------------------------------------------
// Baja de la renovación
// ---------------------------------------------------------------------------

/**
 * Cancela la renovación automática.
 *
 * **No despublica el perfil y no devuelve lo cobrado.** Son dos cosas que el
 * profesional da por descontadas al apretar este botón y por eso tienen que estar
 * escritas en la pantalla antes de que lo apriete:
 *
 * - Mercado Pago corta los cobros futuros. Lo ya pagado se queda hasta que
 *   termine `currentPeriodEnd`, y el perfil sigue visible durante ese tiempo.
 * - Devolver dinero es otra operación —la del botón de arrepentimiento del
 *   módulo 2.6— y tiene plazos legales.
 *
 * El estado **no** pasa a CANCELLED acá: pasa cuando termina el período pagado,
 * que es el cron del 2.7. Marcarlo ahora despublicaría al perfil un mes antes de
 * que el cliente haya terminado de pagar, que es la forma más rápida de perder
 * un suscriptor y ganar una queja.
 */
export async function cancelarRenovacion(profileId: string): Promise<Resultado<null>> {
  const suscripcion = await prisma.subscription.findUnique({
    where: { profileId },
    select: {
      id: true,
      status: true,
      mpPreapprovalId: true,
      cancelAtPeriodEnd: true,
    },
  })

  if (!suscripcion) {
    return err('No encontramos una suscripción para cancelar.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (suscripcion.status !== SubscriptionStatus.ACTIVE) {
    return err(
      'Tu suscripción no está activa, así que no hay renovación que cancelar.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  /**
   * Idempotente a propósito.
   *
   * Apretar dos veces el botón de baja no puede ser un error: el segundo clic
   * llega con la respuesta del primero en vuelo, y devolver un error haría que
   * la pantalla muestre "no se pudo cancelar" encima de una baja que sí se hizo.
   */
  if (suscripcion.cancelAtPeriodEnd) {
    return ok(null)
  }

  if (!suscripcion.mpPreapprovalId) {
    /**
     * Una suscripción ACTIVE sin preapproval no debería existir: `ACTIVE` solo lo
     * pone el webhook, y el webhook solo responde a un preapproval. Si aparece,
     * es una fila corrupta o un ajuste manual, y en los dos casos seguir en
     * silencio dejaría un perfil visible sin que nadie esté cobrando.
     */
    logger.error('suscripción: ACTIVE sin mpPreapprovalId', { profileId })
    return err(
      'No pudimos encontrar el pago asociado. Escribinos y lo revisamos.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  await cancelarPreapproval(suscripcion.mpPreapprovalId)

  await prisma.subscription.update({
    where: { id: suscripcion.id },
    data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
  })

  /**
   * Se re-sincroniza la publicación aunque el estado siga ACTIVE.
   *
   * La suscripción no cambia de estado, así que en teoría no hay nada que
   * escribir. Va igual porque `sincronizarPublicacion` es el único dueño de
   * `isPublished` y es el que sabe si el perfil tiene que estar visible; que
   * ahora escriba o no lo decide esa función, no esta.
   */
  await sincronizarPublicacion(profileId)

  return ok(null)
}

/**
 * Cancela un preapproval sin propagar el error.
 *
 * La baja no puede quedar a medio hacer: si Mercado Pago está caído y el
 * profesional apretó "cancelar renovación", devolver un error lo deja con la
 * misma duda y con el mismo cobro. Lo que se hace es cortar el error, avisar por
 * log y seguir: el `cancelAtPeriodEnd` local igual queda puesto, y el cron (2.7)
 * reintenta contra la API antes de dar la suscripción por terminada.
 */
async function cancelarPreapproval(mpPreapprovalId: string): Promise<void> {
  try {
    await getProveedor().cancelarPreapproval(mpPreapprovalId)
  } catch (error: unknown) {
    logger.warn('suscripción: no se pudo cancelar el preapproval en Mercado Pago', {
      mpPreapprovalId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

/** `importeParaPasarela` con el error tragado. `null` si el monto no sirve. */
function safeImporte(monto: number): string | null {
  try {
    return importeParaPasarela(monto)
  } catch (error: unknown) {
    if (error instanceof ErrorMontoInvalido) return null
    throw error
  }
}

/** `Decimal` a número, tolerante: un monto roto se trata como "no lo sé". */
function aNumeroSeguido(valor: Prisma.Decimal | number): number | null {
  try {
    return aNumero(valor)
  } catch {
    return null
  }
}

/** A dónde vuelve el profesional después de pagar. */
function urlDeResultado(): string {
  return `${process.env.NEXTAUTH_URL ?? ''}/panel/suscripcion/resultado`
}

/**
 * A dónde avisa Mercado Pago.
 *
 * La ruta la implementa el módulo 2.4. Va en el preapproval desde el alta
 * aunque todavía no exista: cuando el 2.4 esté listo no hay que volver a
 * configurarlo en el panel de Mercado Pago, que es un paso que se olvida y
 * después nadie recuerda por qué no llegan pagos.
 */
function urlDeWebhook(): string {
  return `${process.env.NEXTAUTH_URL ?? ''}/api/webhooks/mercadopago`
}