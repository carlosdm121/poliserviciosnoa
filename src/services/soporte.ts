import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client'

import { calcularPagina, normalizarPagina, POR_PAGINA } from '@/lib/admin'
import { logger } from '@/lib/logger'
import { generarNumeroTramiteTicket } from '@/lib/soporte'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, type ActorAuditoria } from '@/services/auditoria'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** SLA por defecto, en días hábiles. Se lee de SiteSetting si existe. */
const SLA_PRIMERA_RESPUESTA_DEFAULT = 1
const SLA_RESOLUCION_DEFAULT = 3

/** Longitud máxima del asunto y del mensaje. */
const LARGO_MAX_ASUNTO = 200
const LARGO_MAX_MENSAJE = 3000

export type TicketCreado = {
  id: string
  numeroTramite: string
  estado: TicketStatus
}

export type EntradaTicket = {
  categoria: TicketCategory
  asunto: string
  mensaje: string
  prioridad?: TicketPriority
  /** Usuario opcional: tickets abiertos sin sesión no lo tienen. */
  nombre?: string | null
  email?: string | null
}

export type FiltrosTickets = {
  estado?: TicketStatus | ''
  categoria?: TicketCategory | ''
  asignadoA?: string | ''
  q?: string
  pagina?: number
}

export type FilaTicket = {
  id: string
  numeroTramite: string
  categoria: TicketCategory
  asunto: string
  prioridad: TicketPriority
  estado: TicketStatus
  asignadoA: string | null
  asignadoEmail: string | null
  asignadoNombre: string | null
  userEmail: string | null
  nombre: string | null
  email: string | null
  respuestaEn: Date | null
  resueltoEn: Date | null
  creadoEn: Date
  resumenMensaje: string
}

/**
 * Crea un ticket de soporte.
 *
 * El usuario es opcional: un visitante sin sesión deja nombre y email para que
 * el equipo le responda. El número de trámite es el identificador público y se
 * informa por email de confirmación.
 */
export async function crearTicket(
  entrada: EntradaTicket,
  usuarioId: string | null,
): Promise<Resultado<TicketCreado>> {
  const asunto = entrada.asunto.trim()
  const mensaje = entrada.mensaje.trim()

  if (!asunto) {
    return err('El asunto es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (asunto.length > LARGO_MAX_ASUNTO) {
    return err(
      `El asunto no puede superar los ${LARGO_MAX_ASUNTO} caracteres.`,
      ERROR_CODES.VALIDACION,
    )
  }

  if (!mensaje) {
    return err('El mensaje es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (mensaje.length > LARGO_MAX_MENSAJE) {
    return err(
      `El mensaje no puede superar los ${LARGO_MAX_MENSAJE} caracteres.`,
      ERROR_CODES.VALIDACION,
    )
  }

  const ahora = new Date()
  const usuario =
    usuarioId !== null
      ? await prisma.user.findUnique({
          where: { id: usuarioId },
          select: { id: true, email: true, name: true },
        })
      : null

  // Si no hay sesión, el nombre y el email vienen del formulario.
  const nombre = entrada.nombre?.trim() ?? usuario?.name ?? null
  const email = entrada.email?.trim() ?? usuario?.email ?? null

  if (!email) {
    return err(
      'Decinos tu email para poder responderte el ticket.',
      ERROR_CODES.VALIDACION,
    )
  }

  const sufijo = `${usuarioId ?? email}${asunto.slice(-4)}`
  const numeroTramite = generarNumeroTramiteTicket(ahora, sufijo)

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: usuarioId ?? undefined,
        nombre,
        email,
        categoria: entrada.categoria,
        asunto,
        mensaje,
        prioridad: entrada.prioridad ?? 'MEDIA',
        numeroTramite,
        respuestas: {
          create: {
            autorId: usuarioId ?? 'sistema',
            mensaje,
            esDelEquipo: false,
          },
        },
      },
      select: { id: true, numeroTramite: true, estado: true },
    })

    await registrarAuditoria(
      {
        actor: { id: usuarioId ?? 'sistema', email: email ?? 'visitante' },
        accion: 'ticket.crear',
        entidad: 'SupportTicket',
        entidadId: ticket.id,
        despues: {
          categoria: entrada.categoria,
          prioridad: entrada.prioridad ?? 'MEDIA',
          numeroTramite,
        },
      },
    )

    // Confirmación por email con el número de trámite.
    await import('@/lib/email').then(({ enviarEmailConfirmacionTicket }) =>
      enviarEmailConfirmacionTicket({
        email,
        nombre: nombre ?? '',
        tramite: numeroTramite,
        categoria: entrada.categoria,
      }).catch((error: unknown) => {
        logger.warn('soporte: no se pudo enviar confirmación de ticket', {
          ticketId: ticket.id,
          numeroTramite,
          error: error instanceof Error ? error.message : String(error),
        })
      }),
    )

    return ok({
      id: ticket.id,
      numeroTramite,
      estado: ticket.estado as TicketStatus,
    })
  } catch (error: unknown) {
    logger.error('soporte: no se pudo crear el ticket', {
      email,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos registrar el ticket. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Listado paginado de tickets para la bandeja de soporte.
 */
export async function listarTickets(
  filtros: FiltrosTickets = {},
): Promise<{ filas: FilaTicket[]; pagina: ReturnType<typeof calcularPagina> }> {
  const where: Record<string, unknown> = {}

  if (filtros.estado) where.estado = filtros.estado
  if (filtros.categoria) where.categoria = filtros.categoria
  if (filtros.asignadoA) where.asignadoA = filtros.asignadoA

  if (filtros.q?.trim()) {
    const texto = filtros.q.trim()
    where.OR = [
      { numeroTramite: { contains: texto, mode: 'insensitive' } },
      { asunto: { contains: texto, mode: 'insensitive' } },
      { email: { contains: texto, mode: 'insensitive' } },
      { nombre: { contains: texto, mode: 'insensitive' } },
      { mensaje: { contains: texto, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.supportTicket.count({ where })
  const pagina = calcularPagina(
    total,
    normalizarPagina(filtros.pagina),
    POR_PAGINA,
  )

  const filas = await prisma.supportTicket.findMany({
    where,
    orderBy: [{ estado: 'asc' }, { updatedAt: 'desc' }],
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      numeroTramite: true,
      categoria: true,
      asunto: true,
      prioridad: true,
      estado: true,
      asignadoA: true,
      respuestaEn: true,
      resueltoEn: true,
      createdAt: true,
      user: { select: { email: true } },
      asignado: { select: { email: true, name: true } },
      nombre: true,
      email: true,
    },
  })

  return {
    filas: filas.map((fila) => ({
      id: fila.id,
      numeroTramite: fila.numeroTramite,
      categoria: fila.categoria as TicketCategory,
      asunto: fila.asunto,
      prioridad: fila.prioridad as TicketPriority,
      estado: fila.estado as TicketStatus,
      asignadoA: fila.asignadoA ?? null,
      asignadoEmail: fila.asignado?.email ?? null,
      asignadoNombre: fila.asignado?.name ?? null,
      userEmail: fila.user?.email ?? null,
      nombre: fila.nombre ?? null,
      email: fila.email ?? null,
      respuestaEn: fila.respuestaEn,
      resueltoEn: fila.resueltoEn,
      creadoEn: fila.createdAt,
      resumenMensaje: fila.asunto,
    })),
    pagina,
  }
}

/**
 * Agrega una respuesta a un ticket.
 *
 * Si el ticket estaba ABIERTO, pasa a EN_CURSO. Si es la primera respuesta del
 * equipo, registra `respuestaEn` (SLA de primera respuesta). El email de la
 * respuesta se envía al usuario que abrió el ticket.
 */
export async function responderTicket(params: {
  ticketId: string
  mensaje: string
  actor: ActorAuditoria
  /** Texto de una plantilla elegida, si se usó una. Se guarda en auditoría. */
  plantilla?: string | null
}): Promise<Resultado<{ id: string; primeraRespuesta: boolean }>> {
  const mensaje = params.mensaje.trim()

  if (!mensaje) {
    return err('Escribí la respuesta antes de enviarla.', ERROR_CODES.VALIDACION)
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: {
      id: true,
      estado: true,
      respuestaEn: true,
      email: true,
      nombre: true,
      numeroTramite: true,
      userId: true,
    },
  })

  if (!ticket) {
    return err('Ese ticket ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  const esPrimeraRespuestaDelEquipo =
    ticket.respuestaEn === null && ticket.estado === 'ABIERTO'

  const nuevoEstado: TicketStatus = ticket.estado === 'ABIERTO' ? 'EN_CURSO' : ticket.estado

  try {
    const respuesta = await prisma.$transaction(async (tx) => {
      const creada = await tx.ticketRespuesta.create({
        data: {
          ticketId: params.ticketId,
          autorId: params.actor.id,
          mensaje,
          esDelEquipo: true,
        },
      })

      await tx.supportTicket.update({
        where: { id: params.ticketId },
        data: {
          estado: nuevoEstado,
          respuestaEn: esPrimeraRespuestaDelEquipo ? new Date() : ticket.respuestaEn,
        },
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: params.plantilla
            ? 'ticket.responder.plantilla'
            : 'ticket.responder',
          entidad: 'SupportTicket',
          entidadId: params.ticketId,
          antes: {
            estado: ticket.estado,
            primeraRespuesta: ticket.respuestaEn !== null,
          },
          despues: {
            estado: nuevoEstado,
            primeraRespuesta: esPrimeraRespuestaDelEquipo,
            plantilla: params.plantilla ?? null,
          },
        },
        tx,
      )

      return creada
    })

    // Email al usuario con la respuesta del equipo.
    if (ticket.email) {
      await import('@/lib/email').then(({ enviarEmailRespuestaTicket }) =>
        enviarEmailRespuestaTicket({
          email: ticket.email!,
          nombre: ticket.nombre ?? '',
          tramite: ticket.numeroTramite,
          mensaje,
          autor: params.actor.email,
        }).catch((error: unknown) => {
          logger.warn('soporte: no se pudo enviar respuesta de ticket', {
            ticketId: params.ticketId,
            error: error instanceof Error ? error.message : String(error),
          })
        }),
      )
    }

    return ok({
      id: respuesta.id,
      primeraRespuesta: esPrimeraRespuestaDelEquipo,
    })
  } catch (error: unknown) {
    logger.error('soporte: no se pudo responder el ticket', {
      ticketId: params.ticketId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos enviar la respuesta. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Cierra un ticket. Solo un ticket ABIERTO o EN_CURSO puede cerrarse.
 */
export async function cerrarTicket(params: {
  ticketId: string
  motivo: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const motivo = params.motivo.trim()

  if (!motivo) {
    return err('Escribí por qué se cierra el ticket.', ERROR_CODES.VALIDACION)
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true, estado: true, email: true, nombre: true, numeroTramite: true },
  })

  if (!ticket) {
    return err('Ese ticket ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (ticket.estado === 'RESUELTO') {
    return err('Este ticket ya fue resuelto.', ERROR_CODES.ESTADO_INVALIDO)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: params.ticketId },
        data: { estado: 'RESUELTO', resueltoEn: new Date() },
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'ticket.cerrar',
          entidad: 'SupportTicket',
          entidadId: params.ticketId,
          antes: { estado: ticket.estado },
          despues: { estado: 'RESUELTO', motivo },
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    logger.error('soporte: no se pudo cerrar el ticket', {
      ticketId: params.ticketId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos cerrar el ticket. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Asigna un ticket a un integrante del equipo.
 */
export async function asignarTicket(params: {
  ticketId: string
  asignadoA: string | null
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true, estado: true, asignadoA: true },
  })

  if (!ticket) {
    return err('Ese ticket ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: params.ticketId },
        data: { asignadoA: params.asignadoA },
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'ticket.asignar',
          entidad: 'SupportTicket',
          entidadId: params.ticketId,
          antes: { asignadoA: ticket.asignadoA },
          despues: { asignadoA: params.asignadoA },
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    logger.error('soporte: no se pudo asignar el ticket', {
      ticketId: params.ticketId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos asignar el ticket. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Cambia el estado de un ticket (ABIERTO / EN_CURSO / RESUELTO).
 */
export async function cambiarEstado(params: {
  ticketId: string
  estado: TicketStatus
  motivo: string
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const validos = ['ABIERTO', 'EN_CURSO', 'RESUELTO']

  if (!validos.includes(params.estado)) {
    return err('Estado de ticket inválido.', ERROR_CODES.VALIDACION)
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.ticketId },
    select: { id: true, estado: true, resueltoEn: true },
  })

  if (!ticket) {
    return err('Ese ticket ya no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (ticket.estado === params.estado) {
    return ok(null)
  }

  try {
    await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = { estado: params.estado }

      if (params.estado === 'RESUELTO') {
        data.resueltoEn = new Date()
      } else if (ticket.estado === 'RESUELTO') {
        data.resueltoEn = null
      }

      await tx.supportTicket.update({
        where: { id: params.ticketId },
        data,
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: `ticket.estado.${params.estado.toLowerCase()}`,
          entidad: 'SupportTicket',
          entidadId: params.ticketId,
          antes: { estado: ticket.estado },
          despues: { estado: params.estado, motivo: params.motivo.trim() || null },
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    logger.error('soporte: no se pudo cambiar el estado del ticket', {
      ticketId: params.ticketId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos cambiar el estado del ticket. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Plantillas de respuesta predefinida.
 * Las primeras tres se crean si no existen, para que la bandeja tenga algo
 * desde el primer día sin que el admin tenga que escribir plantillas.
 */
export async function plantillasPredeterminadas(): Promise<
  Array<{ codigo: string; nombre: string; asunto: string; mensaje: string }>
> {
  const predeterminadas = [
    {
      codigo: 'VERIFICACION_PASOS',
      nombre: 'Verificar WhatsApp (pasos)',
      asunto: 'Cómo verificar tu número de WhatsApp',
      mensaje: `Hola {{nombre}},

Para verificar tu número:
1. Desde el panel, sección WhatsApp, pedí el código de 6 caracteres.
2. Enviá ese código desde tu número al número de PoliserviciosNOA por WhatsApp.
3. Esperá el mensaje de confirmación de Meta.

Si no recibís el código, probá de nuevo en 15 minutos. Si el problema sigue, escribí acá con tu número de trámite.

Saludos,
Equipo PoliserviciosNOA`,
    },
    {
      codigo: 'PAGO_NO_ACREDITADO',
      nombre: 'Pago no acreditado',
      asunto: 'Tu pago aún no se acreditó',
      mensaje: `Hola {{nombre}},

Revisamos tu pago y aún no figura acreditado. Los pagos con tarjeta suelen acreditarse en minutos, pero algunos bancos demoran hasta 48 horas.

Si pasaron más de 48 horas, respondé este email con el número de trámite y el comprobante del cobro, y lo revisamos.

Saludos,
Equipo PoliserviciosNOA`,
    },
    {
      codigo: 'PERFIL_NO_APARECE',
      nombre: 'Perfil no aparece en búsqueda',
      asunto: '¿Por qué no aparece tu perfil?',
      mensaje: `Hola {{nombre}},

Un perfil aparece en la búsqueda solo si cumple todo esto:
- Email verificado.
- Número de WhatsApp verificado.
- Suscripción activa.
- Al menos una foto en la galería.
- Rubro principal, ciudad y descripción completos.

Revisá cuál falta en tu panel y avisanos si seguís sin aparecer.

Saludos,
Equipo PoliserviciosNOA`,
    },
  ]

  const existentes = await prisma.ticketPlantilla.findMany({
    select: { codigo: true },
  })
  const codigosExistentes = new Set(existentes.map((p) => p.codigo))

  const aCrear = predeterminadas.filter((p) => !codigosExistentes.has(p.codigo))

  if (aCrear.length > 0) {
    await prisma.ticketPlantilla.createMany({
      data: aCrear.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        asunto: p.asunto,
        mensaje: p.mensaje,
      })),
    })
  }

  return predeterminadas
}

/**
 * Lista las plantillas disponibles.
 */
export async function listarPlantillas(): Promise<
  Array<{
    id: string
    codigo: string
    nombre: string
    asunto: string
    mensaje: string
  }>
> {
  await plantillasPredeterminadas()

  return prisma.ticketPlantilla.findMany({
    orderBy: { nombre: 'asc' },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      asunto: true,
      mensaje: true,
    },
  })
}

/**
 * Tickets que superaron el SLA de primera respuesta o de resolución, para
 * que el job del cron avise al equipo.
 */
export async function ticketsFueraDeSLA(
  ahora: Date,
): Promise<{
  sinPrimeraRespuesta: Array<{
    id: string
    numeroTramite: string
    email: string | null
    nombre: string | null
    diasHabiles: number
    creadoEn: Date
  }>
  sinResolver: Array<{
    id: string
    numeroTramite: string
    email: string | null
    nombre: string | null
    diasHabiles: number
    creadoEn: Date
  }>
}> {
  const sla = await leerSLA()

  const tickets = await prisma.supportTicket.findMany({
    where: {
      estado: { in: ['ABIERTO', 'EN_CURSO'] },
    },
    select: {
      id: true,
      numeroTramite: true,
      email: true,
      nombre: true,
      createdAt: true,
      respuestaEn: true,
      estado: true,
    },
  })

  const sinPrimeraRespuesta: Array<{
    id: string
    numeroTramite: string
    email: string | null
    nombre: string | null
    diasHabiles: number
    creadoEn: Date
  }> = []

  const sinResolver: Array<{
    id: string
    numeroTramite: string
    email: string | null
    nombre: string | null
    diasHabiles: number
    creadoEn: Date
  }> = []

  for (const ticket of tickets) {
    const creadoEn = ticket.createdAt
    const habiles = Math.max(diasHabiles(creadoEn, ahora), 0)

    if (
      ticket.respuestaEn === null &&
      habiles >= sla.primeraRespuestaDias &&
      ticket.email
    ) {
      sinPrimeraRespuesta.push({
        id: ticket.id,
        numeroTramite: ticket.numeroTramite,
        email: ticket.email,
        nombre: ticket.nombre ?? null,
        diasHabiles: habiles,
        creadoEn,
      })
    }

    if (ticket.estado !== 'RESUELTO' && habiles >= sla.resolucionDias) {
      sinResolver.push({
        id: ticket.id,
        numeroTramite: ticket.numeroTramite,
        email: ticket.email,
        nombre: ticket.nombre ?? null,
        diasHabiles: habiles,
        creadoEn,
      })
    }
  }

  return { sinPrimeraRespuesta, sinResolver }
}

/**
 * Lee el SLA configurado en SiteSetting, con valores por defecto.
 */
async function leerSLA(): Promise<{
  primeraRespuestaDias: number
  resolucionDias: number
}> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: 'soporte_sla' },
    select: { value: true },
  })

  if (!setting?.value) {
    return {
      primeraRespuestaDias: SLA_PRIMERA_RESPUESTA_DEFAULT,
      resolucionDias: SLA_RESOLUCION_DEFAULT,
    }
  }

  const valor = setting.value as Record<string, unknown>

  return {
    primeraRespuestaDias:
      typeof valor.primeraRespuestaDias === 'number'
        ? valor.primeraRespuestaDias
        : SLA_PRIMERA_RESPUESTA_DEFAULT,
    resolucionDias:
      typeof valor.resolucionDias === 'number'
        ? valor.resolucionDias
        : SLA_RESOLUCION_DEFAULT,
  }
}

function diasHabiles(desde: Date, hasta: Date): number {
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
