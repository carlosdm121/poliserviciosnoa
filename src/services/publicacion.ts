import { ModerationStatus, Prisma, SubscriptionStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { exigeAprobacionManual } from '@/services/ajustes'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Reglas de publicación.
 *
 * Este archivo es el ÚNICO lugar donde se decide si un perfil puede verse
 * públicamente. Lo usan la búsqueda, el sitemap, la card y el perfil público.
 *
 * Si alguien reimplementa la decisión en su propia consulta, aparece un
 * perfil vencido en los resultados y el cliente llama a un número que ya no
 * atiende. Ese es el bug más caro del portal, y la única forma de evitarlo es
 * que la regla tenga un solo dueño.
 */

/**
 * Perfil completo con todo lo necesario para decidir.
 *
 * `userId` y `unpublishedReason` están aunque la función no los use: obliga a
 * que quien llame traiga el perfil completo y no un recorte que después
 * invalida la decisión.
 */
type PerfilParaEvaluar = {
  userId: string
  baseCityId: string | null
  whatsappVerifiedAt: Date | null
  name: string
  description: string | null
  isPublished: boolean
  moderationStatus: ModerationStatus
  unpublishedReason: string | null
  images: { id: string }[]
  categories: { isPrimary: boolean }[]
  subscription: {
    status: SubscriptionStatus
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: Date | null
    graceUntil: Date | null
  } | null
}

export type MotivoBloqueo =
  | 'EMAIL_SIN_VERIFICAR'
  | 'WHATSAPP_SIN_VERIFICAR'
  | 'SIN_SUSCRIPCION'
  | 'SUSCRIPCION_VENCIDA'
  | 'SIN_IMAGENES'
  | 'SIN_RUBRO_PRINCIPAL'
  | 'PERFIL_INCOMPLETO'
  | 'APROBACION_PENDIENTE'
  | 'SUSPENDIDO'
  | 'RECHAZADO'

/**
 * Texto que se le muestra al profesional en el panel para cada bloqueo.
 *
 * Se escribe pensando en el profesional que está mirando su perfil y no lo ve:
 * "tu perfil no aparece" sin explicación lo hace pensar que hay un error, y
 * lo primero que hace es llamar a soporte.
 */
export const MOTIVOS_BLOQUEO: Record<MotivoBloqueo, string> = {
  EMAIL_SIN_VERIFICAR:
    'Verificá tu email. Te mandamos un enlace: revisá la carpeta de spam si no lo ves.',
  WHATSAPP_SIN_VERIFICAR:
    'Verificá tu número de WhatsApp. Sin eso nadie te puede contactar.',
  SIN_SUSCRIPCION: 'Activá tu suscripción para que tu perfil aparezca en las búsquedas.',
  SUSCRIPCION_VENCIDA: 'Tu suscripción venció. Renovala para volver a aparecer en las búsquedas.',
  SIN_IMAGENES: 'Subí al menos una foto de un trabajo tuyo. Sin fotos no te eligen.',
  SIN_RUBRO_PRINCIPAL: 'Elegí tu rubro principal para que te encuentren.',
  PERFIL_INCOMPLETO: 'Completá tu perfil: nombre, ciudad y descripción.',
  APROBACION_PENDIENTE: 'Estamos revisando tu perfil. Te avisamos por email apenas esté listo.',
  SUSPENDIDO: 'Tu perfil está suspendido. Escribinos para saber qué pasó.',
  RECHAZADO: 'No pudimos aprobar tu perfil. Escribinos para saber el motivo.',
}

/** Resultado de evaluar si un perfil puede publicarse. */
export type EvaluacionPublicacion = {
  publicable: boolean
  motivos: MotivoBloqueo[]
}

/**
 * Evalúa si un perfil cumple las condiciones para ser visible.
 *
 * Las cuatro de siempre: email verificado, WhatsApp verificado, suscripción
 * activa y perfil completo. Son las que sedefinieron al descartar el KYC: el
 * email y el pago los valida el sistema o la pasarela, y el WhatsApp prueba
 * que hay un teléfono real detrás.
 *
 * Se agrega una quinta: la moderación. Con la bandera `requireManualApproval`
 * apagada (el valor por defecto), `PENDING_REVIEW` no bloquea: el perfil se
 * publica normalmente. Con la bandera prendida, hace falta `APPROVED`.
 *
 * Esta función es pura: recibe el perfil ya cargado y decide. No consulta la
 * base, no lanza errores. Eso permite testearla exhaustivamente sin base de
 * datos y reutilizarla en jobs y cron.
 *
 * @param perfil Perfil con las relaciones necesarias.
 * @param emailVerificado Resultado de `User.emailVerified`. Va aparte porque
 *   vive en User y no en Profile.
 * @param exigeAprobacionManual Valor de la bandera `requireManualApproval`.
 * @param ahora Momento de la evaluación. Se inyecta para poder testear la
 *   ventana de gracia sin depender del reloj de la máquina.
 */
export function evaluarPublicacion(
  perfil: PerfilParaEvaluar,
  emailVerificado: boolean,
  exigeAprobacionManual = false,
  ahora: Date = new Date(),
): EvaluacionPublicacion {
  const motivos: MotivoBloqueo[] = []

  // Orden: primero los bloqueos duros (los que ningún ajuste del perfil
  // resuelve), después los de contenido. Así el panel muestra primero lo que
  // el profesional tiene que resolver sí o sí.
  if (perfil.moderationStatus === ModerationStatus.SUSPENDED) motivos.push('SUSPENDIDO')
  if (perfil.moderationStatus === ModerationStatus.REJECTED) motivos.push('RECHAZADO')

  // PENDING_REVIEW solo bloquea si el administrador pidió revisar todo. Si no,
  // el perfil se publica mientras tanto: un portal donde nadie aparece porque
  // todavía no semoderó a nadie no tiene clientes.
  if (exigeAprobacionManual && perfil.moderationStatus === ModerationStatus.PENDING_REVIEW) {
    motivos.push('APROBACION_PENDIENTE')
  }

  if (!emailVerificado) motivos.push('EMAIL_SIN_VERIFICAR')
  if (!perfil.whatsappVerifiedAt) motivos.push('WHATSAPP_SIN_VERIFICAR')

  /**
   * Una suscripción vencida sigue publicando durante la gracia.
   *
   * El webhook (2.4) pasa a `PAST_DUE` cuando un cobro se rechaza y calcula
   * `graceUntil` con `PAYMENT_GRACE_DAYS`. Despublicar en ese mismo instante
   * castigaría a un profesional cuyo banco rechazó una tarjeta que se renueva
   * mañana, y el cliente que lo busca no tiene nada que ver.
   *
   * La condición exige `currentPeriodEnd`: sin un período pagado no hay nada
   * que respetar. Es lo que impide que un primer pago rechazado deje el perfil
   * publicado gratis durante la gracia; el webhook, además, deja una
   * suscripción `PENDING` en `PENDING` por la misma razón.
   */
  const suscripcionVigente =
    perfil.subscription !== null &&
    (perfil.subscription.status === SubscriptionStatus.ACTIVE ||
      (perfil.subscription.status === SubscriptionStatus.PAST_DUE &&
        perfil.subscription.currentPeriodEnd !== null &&
        perfil.subscription.graceUntil !== null &&
        perfil.subscription.graceUntil > ahora))

  if (!suscripcionVigente) {
    motivos.push('SIN_SUSCRIPCION')
  }

  // Un perfil completo es lo mínimo que hace que un cliente pueda decidir.
  // Cada imagen cuenta como parte de eso: sin foto no hay confianza visual.
  const tieneRubroPrincipal = perfil.categories.some((c) => c.isPrimary)
  if (!tieneRubroPrincipal) motivos.push('SIN_RUBRO_PRINCIPAL')
  if (perfil.images.length === 0) motivos.push('SIN_IMAGENES')
  if (!perfil.baseCityId || !perfil.description || perfil.description.trim().length < 20) {
    motivos.push('PERFIL_INCOMPLETO')
  }

  return { publicable: motivos.length === 0, motivos }
}

/**
 * Recalcula `isPublished` a partir de las reglas y persiste el resultado.
 *
 * Se llama desde: alta de perfil, cambio de suscripción (webhook de Mercado
 * Pago), verificación de WhatsApp, y el cron diario. La fuente de verdad es
 * siempre `evaluarPublicacion`, nunca el flag guardado: el flag es una caché
 * que puede quedar desactualizada, y esa es exactamente la condición que hace
 * que un perfil vencido siga visible.
 *
 * @returns `true` si el perfil quedó publicado.
 */
export async function sincronizarPublicacion(profileId: string): Promise<Resultado<boolean>> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      userId: true,
      baseCityId: true,
      whatsappVerifiedAt: true,
      name: true,
      description: true,
      isPublished: true,
      moderationStatus: true,
      unpublishedReason: true,
      images: { select: { id: true } },
      categories: { select: { isPrimary: true } },
      subscription: {
        select: {
          status: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
          graceUntil: true,
        },
      },
    },
  })

  if (!perfil) {
    return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  const usuario = await prisma.user.findUnique({
    where: { id: perfil.userId },
    select: { emailVerified: true },
  })

  // La bandera se lee acá y no se pasa por parámetro de afuera: la regla de
  // publicación tiene que saber el estado del sitio en el momento de decidir,
  // no el que el llamador creyó antes.
  const exigeAprobacion = await exigeAprobacionManual()

  // La función espera un booleano. `emailVerified` es un Date: convertir con
  // `!== null` y no con truthiness, porque un Date vale `true` incluso siendo
  // la fecha epoch.
  const evaluacion = evaluarPublicacion(perfil, usuario?.emailVerified != null, exigeAprobacion)

  // Traza de por qué se despublicó. Sin esto, un perfil que aparece en la
  // búsqueda y se abre vacío no deja ningún rastro para debuggear.
  if (evaluacion.motivos.length > 0 && !evaluacion.publicable) {
    logger.info('publicación bloqueada', {
      profileId,
      motivos: evaluacion.motivos,
      moderacion: perfil.moderationStatus,
      requiereAprobacion: exigeAprobacion,
    })
  }

  // Solo escribir si cambió: `isPublished` está en el índice de búsqueda y
  // escribirlo sin necesidad invalida caché de páginas cada vez que el cron
  // corre, aunque nada haya cambiado.
  const razon = evaluacion.motivos[0] ?? null
  if (perfil.isPublished !== evaluacion.publicable || perfil.unpublishedReason !== razon) {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        isPublished: evaluacion.publicable,
        unpublishedReason: evaluacion.publicable ? null : razon,
      },
    })
  }

  return ok(evaluacion.publicable)
}

/**
 * Condición que deben cumplir TODOS los perfiles en listados públicos.
 *
 * Se usa en `where` de las consultas de búsqueda y sitemap. Es el gemelo en
 * SQL de `evaluarPublicacion`, y por eso vive al lado: si cambia la una y no
 * la otra, los perfiles aparecen en la búsqueda pero no se pueden abrir, que
 * es la peor forma de fallar.
 *
 * El enum `moderationStatus NOT IN (SUSPENDED, REJECTED)` no menciona
 * `PENDING_REVIEW` a propósito: sin la bandera de revisión manual, un perfil
 * pendiente se publica igual. Cuando esa bandera se prende, el sincronizador
 * deja `isPublished = false` y esta condición lo saca de los listados sin
 * necesidad de que cada consulta conozca la bandera.
 *
 * Nota: `unpublishedReason` se ignora a propósito. El perfil puede estar
 * publicado y aun así tener un motivo viejo sin limpiar; la condición real es
 * `isPublished`.
 */
export const CONDICION_PERFIL_PUBLICO = {
  isPublished: true,
  moderationStatus: { notIn: [ModerationStatus.SUSPENDED, ModerationStatus.REJECTED] },
} satisfies Prisma.ProfileWhereInput