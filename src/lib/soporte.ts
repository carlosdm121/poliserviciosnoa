/**
 * Reglas puras de tickets de soporte.
 *
 * Todo lo que se puede decidir sin base vive acá: el número de trámite, las
 * etiquetas legibles de categoría y prioridad, y el cálculo de si un ticket
 * está dentro del SLA. El servicio (`services/soporte.ts`) solo lee y escribe.
 */

import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client'
import { z } from 'zod'

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Texto de cada categoría, para mostrar en el formulario y la bandeja. */
export const ETIQUETA_CATEGORIA: Record<TicketCategory, string> = {
  VERIFICACION_WHATSAPP: 'No puedo verificar mi número de WhatsApp',
  PAGO: 'Pago, suscripción o factura',
  PERFIL: 'Mi perfil, datos o matrícula',
  PUBLICACION: 'Mi perfil no aparece en la búsqueda',
  OTRO: 'Otro motivo',
}

/** Texto de cada prioridad. */
export const ETIQUETA_PRIORIDAD: Record<TicketPriority, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
}

/** Texto de cada estado. */
export const ETIQUETA_ESTADO_TICKET: Record<TicketStatus, string> = {
  ABIERTO: 'Abierto',
  EN_CURSO: 'En curso',
  RESUELTO: 'Resuelto',
}

/**
 * Número de trámite visible para el cliente.
 *
 * Formato: `ST-20261028-AB12CD`. Lleva fecha y sufijo corto alfanumérico para
 * que se pueda dictar por teléfono.
 */
export function generarNumeroTramiteTicket(ahora: Date, sufijo: string): string {
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const limpio = sufijo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  return `ST-${anio}${mes}${dia}-${limpio || '000000'}`
}

/**
 * Días hábiles transcurridos desde `desde` hasta `hasta`.
 *
 * Cuenta de lunes a viernes, sin feriados. Es una aproximación suficiente para
 * el SLA de soporte: 24 h hábiles y 72 h hábiles son los plazos del módulo.
 * Si el negocio necesita feriados exactos, se agregan aquí como un array de
 * fechas.
 */
export function diasHabiles(desde: Date, hasta: Date): number {
  let dias = 0
  const cursor = new Date(desde)

  while (cursor < hasta) {
    const dia = cursor.getUTCDay()
    // 0 = domingo, 6 = sábado: no cuentan como hábiles.
    if (dia !== 0 && dia !== 6) dias += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dias
}

/**
 * Días hábiles restantes antes de que se venza el SLA de primera respuesta.
 * Negativo si ya se venció.
 */
export function diasRestantesPrimeraRespuesta(
  creadoEn: Date,
  ahora: Date,
  diasSla: number,
): number {
  return diasSla - diasHabiles(creadoEn, ahora)
}

/**
 * Días hábiles restantes antes de que se venza el SLA de resolución.
 * Negativo si ya se venció.
 */
export function diasRestantesResolucion(
  creadoEn: Date,
  ahora: Date,
  diasSla: number,
): number {
  return diasSla - diasHabiles(creadoEn, ahora)
}

/**
 * Verifica que una cadena sea una categoría válida del enum.
 */
export function esCategoriaValida(categoria: string): categoria is TicketCategory {
  return Object.values(TicketCategory).includes(categoria as TicketCategory)
}

/**
 * Verifica que una cadena sea un estado válido del enum.
 */
export function esEstadoValido(estado: string): estado is TicketStatus {
  return Object.values(TicketStatus).includes(estado as TicketStatus)
}

/**
 * Esquema de validación compartido para el formulario público de soporte.
 */
export const EsquemaSoporte = z.object({
  categoria: z.enum([
    'VERIFICACION_WHATSAPP',
    'PAGO',
    'PERFIL',
    'PUBLICACION',
    'OTRO',
  ]),
  asunto: z.string().min(1, 'El asunto es obligatorio.').max(200),
  mensaje: z.string().min(1, 'El mensaje es obligatorio.').max(3000),
  nombre: z.string().optional(),
  email: z.string().email('Email inválido.').optional(),
  prioridad: z.enum(['BAJA', 'MEDIA', 'ALTA']).optional(),
})

/** Opciones de categoría para el select del formulario. */
export const OPCIONES_CATEGORIA: Array<{
  valor: TicketCategory
  etiqueta: string
}> = Object.entries(ETIQUETA_CATEGORIA).map(([valor, etiqueta]) => ({
  valor: valor as TicketCategory,
  etiqueta,
}))

/** Opciones de prioridad para el select del formulario. */
export const OPCIONES_PRIORIDAD: Array<{
  valor: TicketPriority
  etiqueta: string
}> = Object.entries(ETIQUETA_PRIORIDAD).map(([valor, etiqueta]) => ({
  valor: valor as TicketPriority,
  etiqueta,
}))

/** Opciones de estado para el select de la bandeja. */
export const OPCIONES_ESTADO: Array<{
  valor: TicketStatus
  etiqueta: string
}> = Object.entries(ETIQUETA_ESTADO_TICKET).map(([valor, etiqueta]) => ({
  valor: valor as TicketStatus,
  etiqueta,
}))
