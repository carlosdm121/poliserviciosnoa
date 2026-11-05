'use server'

import { revalidatePath } from 'next/cache'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  crearServicio,
  editarServicio,
  eliminarServicio,
  listarServiciosAdmin,
  reordenarServicios,
  type ServicioPublico,
} from '@/services/servicio'
import { crearServicioSchema, type ServicioInput } from '@/schemas/servicio'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Lista todos los servicios del espacio del cliente logueado,
 * incluidos los inactivos, para el panel de edición.
 */
export async function espacioListarServicios(): Promise<
  Resultado<{ id: string; nombre: string; descripcion: string | null; precio: number; moneda: string; cuotasMax: number; interesCuota: number; activo: boolean; sortOrder: number }[]>
> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const servicios = await listarServiciosAdmin(perfil.id)

  return ok(servicios)
}

/**
 * Crea un servicio para el espacio del cliente logueado.
 */
export async function espacioCrearServicio(
  entrada: ServicioInput,
): Promise<Resultado<ServicioPublico>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const parseado = crearServicioSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(
      primero?.message ?? 'Revisá los datos del servicio.',
      ERROR_CODES.VALIDACION,
    )
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const descripcion = parseado.data.descripcion || undefined

  const datosServicio = {
    nombre: parseado.data.nombre,
    precio: parseado.data.precio,
    cuotasMax: parseado.data.cuotasMax,
    interesCuota: parseado.data.interesCuota,
    activo: parseado.data.activo,
    ...(descripcion ? { descripcion } : {}),
  }

  const resultado = await crearServicio(perfil.id, datosServicio)

  if (resultado.ok) {
    revalidatePath('/panel/espacio/servicios')
  }

  return resultado
}

/**
 * Edita un servicio del espacio del cliente logueado.
 */
export async function espacioEditarServicio(
  servicioId: string,
  entrada: ServicioInput,
): Promise<Resultado<ServicioPublico>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const parseado = crearServicioSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(
      primero?.message ?? 'Revisá los datos del servicio.',
      ERROR_CODES.VALIDACION,
    )
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const descripcion = parseado.data.descripcion || undefined

  const datosServicio = {
    nombre: parseado.data.nombre,
    precio: parseado.data.precio,
    cuotasMax: parseado.data.cuotasMax,
    interesCuota: parseado.data.interesCuota,
    activo: parseado.data.activo,
    ...(descripcion ? { descripcion } : {}),
  }

  const resultado = await editarServicio(perfil.id, servicioId, datosServicio)

  if (resultado.ok) {
    revalidatePath('/panel/espacio/servicios')
  }

  return resultado
}

/**
 * Elimina (desactiva) un servicio del espacio del cliente logueado.
 */
export async function espacioEliminarServicio(servicioId: string): Promise<Resultado<null>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const resultado = await eliminarServicio(perfil.id, servicioId)

  if (resultado.ok) {
    revalidatePath('/panel/espacio/servicios')
  }

  return resultado
}

/**
 * Reordena los servicios del espacio del cliente logueado.
 */
export async function espacioReordenarServicios(ids: string[]): Promise<Resultado<null>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const resultado = await reordenarServicios(perfil.id, ids)

  if (resultado.ok) {
    revalidatePath('/panel/espacio/servicios')
  }

  return resultado
}
