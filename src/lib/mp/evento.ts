import { PaymentStatus } from '@prisma/client'

/**
 * Lectura y traducción de las notificaciones de Mercado Pago.
 *
 * El body de un webhook es una pista, no una verdad: dice qué recurso cambió,
 * pero no cuál es su estado. El estado real se consulta a la API en
 * `services/webhook-mercadopago.ts`. Acá solo se extrae lo mínimo para saber
 * qué consultar.
 *
 * Este archivo es puro y por eso se puede testear con objetos: los tipos de
 * evento y los estados son la parte donde un `switch` incompleto deja un pago
 * aprobado sin acreditar y nadie se entera hasta que el profesional reclama.
 */

/** Tipos de notificación que este módulo sabe procesar. */
export const TIPOS_EVENTO_MP = [
  'payment',
  'subscription_preapproval',
  'subscription_authorized_payment',
] as const

export type TipoEventoMp = (typeof TIPOS_EVENTO_MP)[number]

/** Lo que se necesita de una notificación para empezar a trabajar. */
export type EventoMercadoPago = {
  tipo: TipoEventoMp
  /** Id del pago, del cobro autorizado o del preapproval, según el tipo. */
  recursoId: string
  /** Id de la notificación. Sirve para trazabilidad, no para idempotencia. */
  notificacionId: string | null
  /** Acción declarada (`payment.created`, `updated`, etc.). */
  accion: string | null
}

/** ¿Es uno de los tipos que procesamos? */
export function esTipoEventoMp(valor: unknown): valor is TipoEventoMp {
  return typeof valor === 'string' && (TIPOS_EVENTO_MP as readonly string[]).includes(valor)
}

/**
 * Extrae `data.id` del cuerpo.
 *
 * Mercado Pago manda el id como número o como string según el evento y la
 * versión del panel. Se normaliza a string porque la firma y las consultas
 * trabajan con texto, y un `123` comparado contra `"123"` falla en silencio.
 */
export function leerRecursoId(cuerpo: unknown): string | null {
  if (cuerpo === null || typeof cuerpo !== 'object') return null

  const data = (cuerpo as { data?: unknown }).data

  if (data === null || typeof data !== 'object') return null

  const id = (data as { id?: unknown }).id

  if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  if (typeof id === 'string' && id.trim().length > 0) return id.trim()

  return null
}

/**
 * Convierte el body en un evento utilizable, o `null` si no es de los nuestros.
 *
 * Devolver `null` no es un error: Mercado Pago manda por la misma URL eventos
 * que este módulo no atiende (`point_integration_wh`, por ejemplo). La ruta
 * responde 200 y sigue.
 */
export function leerEvento(cuerpo: unknown): EventoMercadoPago | null {
  if (cuerpo === null || typeof cuerpo !== 'object') return null

  const objeto = cuerpo as {
    type?: unknown
    action?: unknown
    id?: unknown
  }

  if (!esTipoEventoMp(objeto.type)) return null

  const recursoId = leerRecursoId(cuerpo)

  if (!recursoId) return null

  const notificacionId =
    typeof objeto.id === 'number' && Number.isFinite(objeto.id)
      ? String(objeto.id)
      : typeof objeto.id === 'string' && objeto.id.length > 0
        ? objeto.id
        : null

  const accion = typeof objeto.action === 'string' ? objeto.action : null

  return { tipo: objeto.type, recursoId, notificacionId, accion }
}

/**
 * Traduce el estado de un pago al enum de la base.
 *
 * Los estados de Mercado Pago son un string abierto y agregan valores. El
 * `default` cae en `PENDING` a propósito: un estado nuevo y desconocido no
 * puede activar una suscripción. Lo peor que pasa es que el pago quede como
 * pendiente y alguien lo revise; lo peor del otro default es publicar un perfil
 * sin haber cobrado.
 */
export function estadoPagoAStatus(estado: string): PaymentStatus {
  switch (estado.trim().toLowerCase()) {
    case 'approved':
      return PaymentStatus.APPROVED
    case 'rejected':
    case 'cancelled':
    case 'canceled':
      return PaymentStatus.REJECTED
    case 'refunded':
      return PaymentStatus.REFUNDED
    case 'charged_back':
      return PaymentStatus.CHARGED_BACK
    case 'pending':
    case 'in_process':
    case 'authorized':
    case 'in_mediation':
      return PaymentStatus.PENDING
    default:
      return PaymentStatus.PENDING
  }
}

/**
 * ¿El preapproval está cancelado?
 *
 * `paused` no cuenta: una suscripción pausada se puede reanudar y el perfil no
 * tiene por qué dejar de estar visible por eso. Solo `cancelled` corta la
 * renovación.
 */
export function preapprovalCancelado(estado: string): boolean {
  const normalizado = estado.trim().toLowerCase()

  return normalizado === 'cancelled' || normalizado === 'canceled'
}

/**
 * Clave de idempotencia del webhook.
 *
 * Lleva el estado real además del recurso: un mismo pago puede pasar de
 * `pending` a `approved`, y esos son dos eventos distintos que hay que procesar
 * los dos. Lo que no puede pasar dos veces es el mismo estado del mismo pago.
 */
export function claveEventoMp(
  tipo: TipoEventoMp,
  recursoId: string,
  estado: string,
): string {
  return `mp:${tipo}:${recursoId}:${estado.trim().toLowerCase()}`
}
