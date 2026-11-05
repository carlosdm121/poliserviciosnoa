import { UserRole, type Profile, type Subscription } from '@prisma/client'

import {
  evolucionSemanal,
  maximoSemanal,
  sumaCampoReciente,
  sumaCampoTotal,
} from '@/lib/panel-metricas'
import { getCurrentPlan } from '@/services/planes'
import {
  CONDICION_PERFIL_PUBLICO,
  MOTIVOS_BLOQUEO,
  evaluarPublicacion,
  type MotivoBloqueo,
} from '@/services/publicacion'
import { prisma } from '@/lib/prisma'
import { exigeAprobacionManual } from '@/services/ajustes'

/**
 * Estado del panel: qué falta para que el perfil se vea.
 *
 * Es lo primero que ve el profesional al entrar. Un panel vacío sin explicar
 * qué falta genera el mensaje "no me aparece nadie" y una llamada a soporte
 * que no hacía falta.
 *
 * La información sale de `evaluarPublicacion`, la misma función que decide la
 * publicación: si acá se mostrara "todo listo" y el perfil no aparece, el
 * profesional pierde la confianza en la plataforma.
 */
export async function obtenerEstadoPanel(userId: string): Promise<EstadoPanel> {
  const perfil = await prisma.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      whatsappE164: true,
      whatsappVerifiedAt: true,
      description: true,
      baseCityId: true,
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

  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  })

  // Un usuario sin perfil es un registro a medio hacer. No es un error: se
  // muestra el panel con un aviso para que se_contactado soporte.
  if (!perfil || !usuario) {
    return {
      existePerfil: false,
      emailVerificado: false,
      email: usuario?.email ?? '',
      pasos: [],
      perfil: null,
    }
  }

  const evaluacion = evaluarPublicacion(perfil, usuario.emailVerified !== null, await exigeAprobacionManual())

  // Traducir cada bloqueo al nombre de la sección donde se resuelve. El
  // profesional tiene que poder llegar al problema con un clic, no leer una
  // lista de comprobaciones y quedarse sin saber qué hacer.
  const pasos = evaluacion.motivos.map((motivo) => ({
    motivo,
    texto: MOTIVOS_BLOQUEO[motivo],
    href: RUTA_POR_MOTIVO[motivo],
    /**
     * Si el profesional puede resolverlo con un clic o no.
     *
     * Una revisión pendiente, una suspensión y un rechazo no se resuelven desde
     * el panel: Offering un botón que lleva a una pantalla donde no puede pasar
     * nada es peor que no ofrecerlo, porque el profesional hace el recorrido y
     * vuelve a estar igual.
     */
    resoluble: MOTIVOS_RESOLUBLES.has(motivo),
  }))

  return {
    existePerfil: true,
    emailVerificado: usuario.emailVerified !== null,
    email: usuario.email,
    pasos,
    perfil: {
      id: perfil.id,
      nombre: perfil.name,
      slug: perfil.slug,
      whatsappVerificado: perfil.whatsappVerifiedAt !== null,
      cantidadImagenes: perfil.images.length,
      cantidadRubros: perfil.categories.length,
      publicada: perfil.isPublished,
    },
  }
}

export type EstadoPanel = {
  existePerfil: boolean
  emailVerificado: boolean
  email: string
  pasos: Paso[]
  perfil: {
    id: string
    nombre: string
    slug: string
    whatsappVerificado: boolean
    cantidadImagenes: number
    cantidadRubros: number
    publicada: boolean
  } | null
}

export type Paso = {
  motivo: MotivoBloqueo
  texto: string
  href: string
  resoluble: boolean
}

/**
 * Motivos que el profesional puede resolver sin esperar a nadie.
 *
 * Los otros tres (`APROBACION_PENDIENTE`, `SUSPENDIDO`, `RECHAZADO`) dependen
 * de una decisión del administrador. Mostrarlos con un enlace "Resolver" sería
 * una promesa falsa.
 */
const MOTIVOS_RESOLUBLES: ReadonlySet<MotivoBloqueo> = new Set<MotivoBloqueo>([
  'EMAIL_SIN_VERIFICAR',
  'SIN_SUSCRIPCION',
  'SUSCRIPCION_VENCIDA',
  'SIN_IMAGENES',
  'SIN_RUBRO_PRINCIPAL',
  'PERFIL_INCOMPLETO',
])

/**
 * Sección donde se resuelve cada bloqueo.
 *
 * El tipo es `Record<MotivoBloqueo, string>` y no `Record<string, string>` a
 * propósito: si se agrega un motivo nuevo y se olvida la ruta, TypeScript lo
 * marca acá en vez de dejar un enlace `undefined` en el panel.
 */
const RUTA_POR_MOTIVO: Record<MotivoBloqueo, string> = {
  EMAIL_SIN_VERIFICAR: '/panel/cuenta',
  SIN_SUSCRIPCION: '/panel/suscripcion',
  SUSCRIPCION_VENCIDA: '/panel/suscripcion',
  SIN_IMAGENES: '/panel/galeria',
  SIN_RUBRO_PRINCIPAL: '/panel/perfil',
  PERFIL_INCOMPLETO: '/panel/perfil',
  // La revisión manual no la resuelve el profesional: no hay pantalla donde
  // arreglarla. Va a soporte, que es donde le dicen que espere.
  APROBACION_PENDIENTE: '/panel/soporte',
  SUSPENDIDO: '/panel/soporte',
  RECHAZADO: '/panel/soporte',
}

/**
 * Métricas del dashboard del profesional.
 *
 * Todo es agregado: nunca se devuelven identificadores de clientes ni se
 * revela quién votó ni quién contactó (privacidad del módulo 3.1). Las
 * estadísticas diarias no guardan IP ni datos del visitante (D35 y D38).
 *
 * `ahora` se inyecta para poder testear la ventana de 30 días sin depender
 * del reloj de la máquina.
 */
export type MetricasPanel = {
  corazones: number
  clicsWhatsapp30d: number
  visitas30d: number
  visitasTotal: number
  evolucion: {
    fecha: string
    visitas: number
    clics: number
  }[]
  maximoEvolucion: number
  /** Suscripción del perfil, o `null` si no hay una. */
  suscripcion: {
    status: string
    planAmount: number | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  } | null
  /** Precio mensual vigente del plan, formateado para mostrar. `null` si no hay plan. */
  precioVigente: string | null
}

export async function obtenerMetricasPanel(
  profileId: string,
  ahora: Date = new Date(),
): Promise<MetricasPanel> {
  const [perfil, stats, suscripcion] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: profileId },
      select: { heartsCount: true },
    }),
    prisma.profileDailyStat.findMany({
      where: { profileId },
      select: { date: true, views: true, whatsappClicks: true },
      orderBy: { date: 'asc' },
    }),
    prisma.subscription.findUnique({
      where: { profileId },
      select: {
        status: true,
        planAmount: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
  ])

  const plan = await getCurrentPlan(ahora)

  const clicsWhatsapp30d = sumaCampoReciente(stats, ahora, VENTANA_RECIENTE_DIAS, 'whatsappClicks')
  const visitas30d = sumaCampoReciente(stats, ahora, VENTANA_RECIENTE_DIAS, 'views')
  const visitasTotal = sumaCampoTotal(stats, 'views')
  const evolucion = evolucionSemanal(stats, ahora)
  const maximoEvolucion = maximoSemanal(evolucion)

  return {
    corazones: perfil?.heartsCount ?? 0,
    clicsWhatsapp30d,
    visitas30d,
    visitasTotal,
    evolucion,
    maximoEvolucion,
    suscripcion: suscripcion
      ? {
          status: suscripcion.status,
          planAmount: suscripcion.planAmount ? Number(suscripcion.planAmount) : null,
          currentPeriodEnd: suscripcion.currentPeriodEnd,
          cancelAtPeriodEnd: suscripcion.cancelAtPeriodEnd,
        }
      : null,
    precioVigente: plan?.precio ?? null,
  }
}

/**
 * Ventana de días para las métricas recientes.
 *
 * Exportada para que los tests la usen sin duplicar el valor.
 */
export const VENTANA_RECIENTE_DIAS = 30

/** Reexportado para que la página no importe Prisma directamente. */
export { CONDICION_PERFIL_PUBLICO }
export type { Profile, Subscription, UserRole }
