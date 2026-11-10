'use server'

import type { TicketPriority, TicketStatus } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { exigirAdmin } from '@/lib/admin-auth'
import { ipHasheada } from '@/lib/peticion'
import { rateLimit } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import { authOptions } from '@/lib/auth'
import {
  cerrarTicket,
  crearTicket,
  listarPlantillas,
  responderTicket,
  asignarTicket,
  cambiarEstado,
} from '@/services/soporte'
import { esCategoriaValida, esEstadoValido } from '@/lib/soporte'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave)

  return typeof valor === 'string' ? valor.trim() : ''
}

/** Actor de la sesión actual, o null si no hay sesión. */
async function actorSesion(): Promise<{ id: string; email: string } | null> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) return null

  return { id: sesion.user.id, email: sesion.user.email ?? '' }
}

/** Vuelve a la pantalla de origen con un mensaje legible. */
function volver(datos: FormData, correcto: boolean, mensaje: string): never {
  const ruta = texto(datos, 'ruta')
  const destino = ruta.startsWith('/') ? ruta : '/soporte'
  const separador = destino.includes('?') ? '&' : '?'

  redirect(`${destino}${separador}${correcto ? 'ok' : 'error'}=${encodeURIComponent(mensaje)}`)
}

/**
 * Abre un ticket de soporte desde el formulario público.
 * Cualquier visitante puede hacerlo: si hay sesión se asocia al usuario, si no
 * se pide nombre y email para responderle.
 */
export async function soporteCrearTicket(datos: FormData): Promise<void> {
  const categoria = texto(datos, 'categoria')
  const asunto = texto(datos, 'asunto')
  const mensaje = texto(datos, 'mensaje')
  const nombre = texto(datos, 'nombre')
  const email = texto(datos, 'email')
  const prioridadRaw = texto(datos, 'prioridad')
  const ruta = texto(datos, 'ruta')

  // Límite por IP para evitar que un visitante inunde el formulario de soporte.
  const ipHash = await ipHasheada()
  const limiteTicket = await rateLimit(`soporte:ip:${ipHash}`, 10, 3600)

  if (limiteTicket.limitado) {
    return volver(
      datos,
      false,
      'Demasiados tickets desde esta conexión. Probá en una hora.',
    )
  }

  if (!esCategoriaValida(categoria)) {
    return volver(datos, false, 'Categoría inválida.')
  }

  const prioridad: TicketPriority | undefined =
    prioridadRaw && Object.values(['BAJA', 'MEDIA', 'ALTA']).includes(prioridadRaw)
      ? (prioridadRaw as TicketPriority)
      : undefined

  const actor = await actorSesion()

  const resultado = await crearTicket(
    {
      categoria,
      asunto,
      mensaje,
      prioridad,
      nombre: nombre || undefined,
      email: email || undefined,
    },
    actor?.id ?? null,
  )

  if (!resultado.ok) {
    return volver(datos, false, resultado.error)
  }

  volver(
    datos,
    true,
    `Ticket creado. Tu número de trámite es ${resultado.data.numeroTramite}. Te avisamos por email cuando respondamos.`,
  )
}

/**
 * Responde un ticket desde la bandeja de administración.
 * Solo ADMIN y MODERADOR.
 */
export async function soporteResponderTicket(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const ticketId = texto(datos, 'ticketId')
  const mensaje = texto(datos, 'mensaje')
  const plantillaId = texto(datos, 'plantillaId')

  if (!ticketId) {
    return volver(datos, false, 'Falta el ticket.')
  }

  let textoMensaje = mensaje

  // Si se eligió una plantilla, se carga su mensaje y asunto.
  if (plantillaId && !textoMensaje) {
    const plantillas = await listarPlantillas()
    const plantilla = plantillas.find((p) => p.id === plantillaId)

    if (plantilla) {
      textoMensaje = plantilla.mensaje.replaceAll('{{nombre}}', texto(datos, 'nombreCliente') ?? 'cliente')
    }
  }

  const resultado = await responderTicket({
    ticketId,
    mensaje: textoMensaje,
    actor: admin.data,
    plantilla: textoMensaje ? plantillaId ?? undefined : undefined,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/soporte'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Respuesta enviada.' : resultado.error)
}

/**
 * Cierra un ticket desde la bandeja de administración.
 */
export async function soporteCerrarTicket(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const ticketId = texto(datos, 'ticketId')
  const motivo = texto(datos, 'motivo')

  if (!ticketId) {
    return volver(datos, false, 'Falta el ticket.')
  }

  const resultado = await cerrarTicket({
    ticketId,
    motivo,
    actor: admin.data,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/soporte'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Ticket cerrado.' : resultado.error)
}

/**
 * Asigna un ticket a un integrante del equipo.
 */
export async function soporteAsignarTicket(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const ticketId = texto(datos, 'ticketId')
  const asignadoA = texto(datos, 'asignadoA') || null

  if (!ticketId) {
    return volver(datos, false, 'Falta el ticket.')
  }

  const resultado = await asignarTicket({
    ticketId,
    asignadoA,
    actor: admin.data,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/soporte'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Ticket asignado.' : resultado.error)
}

/**
 * Cambia el estado de un ticket.
 */
export async function soporteCambiarEstado(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const ticketId = texto(datos, 'ticketId')
  const estadoRaw = texto(datos, 'estado')
  const motivo = texto(datos, 'motivo')

  if (!ticketId) {
    return volver(datos, false, 'Falta el ticket.')
  }

  if (!esEstadoValido(estadoRaw)) {
    return volver(datos, false, 'Estado inválido.')
  }

  const resultado = await cambiarEstado({
    ticketId,
    estado: estadoRaw,
    motivo,
    actor: admin.data,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/soporte'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Estado actualizado.' : resultado.error)
}

