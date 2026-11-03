'use server'

import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import {
  crearReclamo,
  type EntradaReclamo,
  listarReclamosDelCliente,
  listarReclamosDelProfesional,
  puedeVerEvidencias,
  resolverReclamo,
} from '@/services/reclamo'
import { rateLimit } from '@/lib/ratelimit'
import { ERROR_CODES, err, ok, type Resultado } from '@/types/resultado'

/** Máximo de reclamos por cliente y hora. Evita spam de reclamos. */
const RECLAMOS_POR_CLIENTE_Y_HORA = 5

const idSchema = z.string().min(10).max(40)
const motivoSchema = z.enum([
  'NO_SE_PRESENTO',
  'MALA_CALIDAD',
  'COBRO_EXCESIVO',
  'TRATO_INADECUADO',
  'FRAUDE',
  'OTRO',
])
const descripcionSchema = z.string().min(1).max(1000)
const urlSchema = z.string().url().min(1)
const evidenciasSchema = z.array(urlSchema).max(3)

const crearReclamoSchema = z.object({
  profileId: idSchema,
  motivo: motivoSchema,
  descripcion: descripcionSchema,
  evidencias: evidenciasSchema,
})

const resolverReclamoSchema = z.object({
  reclamoId: idSchema,
  estado: z.enum(['VALIDADO', 'DESESTIMADO']),
  resolucion: z.string().min(5),
})

/**
 * Crea un reclamo desde la UI del cliente.
 *
 * El clientId sale de la sesión, nunca del cliente.
 */
export async function crearReclamoAction(
  entrada: unknown,
): Promise<Resultado<{ id: string; tramiteNumber: string; estado: string }>> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return err('Ingresá para presentar un reclamo.', ERROR_CODES.NO_AUTENTICADO)
  }

  const limiteReclamo = await rateLimit(
    `reclamo:cliente:${session.user.id}`,
    RECLAMOS_POR_CLIENTE_Y_HORA,
    3600,
  )

  if (limiteReclamo.limitado) {
    return err(
      'Presentaste muchos reclamos en poco tiempo. Probá más tarde.',
      ERROR_CODES.RATE_LIMIT,
    )
  }

  const parseado = crearReclamoSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos del reclamo.', ERROR_CODES.VALIDACION)
  }

  const datos: EntradaReclamo = {
    profileId: parseado.data.profileId,
    motivo: parseado.data.motivo,
    descripcion: parseado.data.descripcion,
    evidencias: parseado.data.evidencias,
  }

  const resultado = await crearReclamo(session.user.id, datos)

  if (resultado.ok) {
    return ok({
      id: resultado.data.id,
      tramiteNumber: resultado.data.tramiteNumber,
      estado: resultado.data.estado,
    })
  }

  return err(resultado.error, resultado.code ?? ERROR_CODES.DESCONOCIDO)
}

/**
 * Lista los reclamos del cliente autenticado.
 */
export async function listarReclamosClienteAction(): Promise<
  Resultado<Awaited<ReturnType<typeof listarReclamosDelCliente>>>
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return err('Ingresá para ver tus reclamos.', ERROR_CODES.NO_AUTENTICADO)
  }

  const resultado = await listarReclamosDelCliente(session.user.id)

  return ok(resultado)
}

/**
 * Lista los reclamos recibidos por el profesional autenticado.
 */
export async function listarReclamosProfesionalAction(profileId: string): Promise<
  Resultado<Awaited<ReturnType<typeof listarReclamosDelProfesional>>>
> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return err('Ingresá para ver los reclamos de tu perfil.', ERROR_CODES.NO_AUTENTICADO)
  }

  const usuario = await (await import('@/lib/prisma')).prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  })

  if (!usuario || (usuario.role !== 'PROFESSIONAL' && usuario.role !== 'ADMIN')) {
    return err('Solo un profesional o administrador puede ver estos reclamos.', ERROR_CODES.SIN_PERMISOS)
  }

  // Un profesional solo ve los reclamos de su propio perfil. El admin ve cualquiera.
  if (usuario.role === 'PROFESSIONAL') {
    const perfil = await (await import('@/lib/prisma')).prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    })

    if (!perfil || perfil.userId !== session.user.id) {
      return err('No podés ver los reclamos de otro perfil.', ERROR_CODES.SIN_PERMISOS)
    }
  }

  const resultado = await listarReclamosDelProfesional(profileId)

  return ok(resultado)
}

/**
 * Resuelve un reclamo desde administración.
 */
export async function resolverReclamoAction(
  entrada: unknown,
): Promise<Resultado<{ estado: string }>> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return err('Ingresá para resolver un reclamo.', ERROR_CODES.NO_AUTENTICADO)
  }

  const parseado = resolverReclamoSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos.', ERROR_CODES.VALIDACION)
  }

  const usuario = await (await import('@/lib/prisma')).prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true },
  })

  if (!usuario || usuario.role !== 'ADMIN') {
    return err('Solo un administrador puede resolver reclamos.', ERROR_CODES.SIN_PERMISOS)
  }

  const resultado = await resolverReclamo({
    reclamoId: parseado.data.reclamoId,
    estado: parseado.data.estado,
    resolucion: parseado.data.resolucion,
    actor: { id: usuario.id, email: usuario.email },
  })

  if (resultado.ok) {
    return ok({ estado: resultado.data.estado })
  }

  return err(resultado.error, resultado.code ?? ERROR_CODES.DESCONOCIDO)
}

/**
 * Verifica si el usuario autenticado puede ver las evidencias de un reclamo.
 */
export async function puedeVerEvidenciasAction(
  reclamoId: string,
): Promise<Resultado<{ puedeVer: boolean }>> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return err('Ingresá para ver las evidencias.', ERROR_CODES.NO_AUTENTICADO)
  }

  const usuario = await (await import('@/lib/prisma')).prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  })

  if (!usuario) {
    return err('Usuario no encontrado.', ERROR_CODES.NO_ENCONTRADO)
  }

  const puedeVer = await puedeVerEvidencias(
    reclamoId,
    session.user.id,
    usuario.role,
  )

  return ok({ puedeVer })
}
