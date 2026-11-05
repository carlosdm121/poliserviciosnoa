import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** Servicio o producto que ofrece el profesional. */
export type ServicioPublico = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  moneda: string
  cuotasMax: number
  interesCuota: number
  activo: boolean
  sortOrder: number
}

/** Límite de servicios por perfil. */
export const LIMITE_SERVICIOS = 50

/**
 * Lista los servicios activos de un perfil, para mostrar en la página pública.
 */
export async function listarServiciosPublicos(profileId: string): Promise<ServicioPublico[]> {
  const servicios = await prisma.servicio.findMany({
    where: { profileId, activo: true },
    orderBy: [{ sortOrder: 'asc' }, { nombre: 'asc' }],
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      precio: true,
      moneda: true,
      cuotasMax: true,
      interesCuota: true,
      activo: true,
      sortOrder: true,
    },
  })

  return servicios.map((s) => ({
    ...s,
    precio: Number(s.precio),
    interesCuota: Number(s.interesCuota),
  }))
}

/** Datos de entrada para crear o editar un servicio. */
export type ServicioInput = {
  nombre: string
  descripcion?: string
  precio: number
  cuotasMax?: number
  interesCuota?: number
  activo?: boolean
}

/**
 * Crea un servicio para un perfil.
 * Valida que el perfil exista y que no se pase del límite.
 */
export async function crearServicio(
  profileId: string,
  entrada: ServicioInput,
): Promise<Resultado<ServicioPublico>> {
  const nombre = entrada.nombre.trim()
  if (!nombre) {
    return err('El nombre del servicio es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (entrada.precio < 0) {
    return err('El precio no puede ser negativo.', ERROR_CODES.VALIDACION)
  }

  const cuotasMax = entrada.cuotasMax ?? 0
  if (cuotasMax < 0 || cuotasMax > 36) {
    return err('Las cuotas máximas tienen que ser entre 0 y 36.', ERROR_CODES.VALIDACION)
  }

  const interesCuota = entrada.interesCuota ?? 0
  if (interesCuota < 0 || interesCuota > 100) {
    return err('El interés por cuota tiene que ser entre 0 y 100 %.', ERROR_CODES.VALIDACION)
  }

  try {
    const yaTiene = await prisma.servicio.count({ where: { profileId } })
    if (yaTiene >= LIMITE_SERVICIOS) {
      return err(
        `Ya llegaste al límite de ${LIMITE_SERVICIOS} servicios. Borrá alguno para agregar otro.`,
        ERROR_CODES.LIMITE_ALCANZADO,
      )
    }

    const creada = await prisma.servicio.create({
      data: {
        profileId,
        nombre,
        descripcion: entrada.descripcion ?? null,
        precio: entrada.precio,
        cuotasMax,
        interesCuota,
        activo: entrada.activo ?? true,
        sortOrder: yaTiene,
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precio: true,
        moneda: true,
        cuotasMax: true,
        interesCuota: true,
        activo: true,
        sortOrder: true,
      },
    })

    return ok({
      ...creada,
      precio: Number(creada.precio),
      interesCuota: Number(creada.interesCuota),
    })
  } catch (error: unknown) {
    logger.error('servicio: error al crear', { profileId, error })
    return err('No pudimos crear el servicio. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Edita un servicio existente. Solo el dueño del perfil puede tocarlo.
 */
export async function editarServicio(
  profileId: string,
  servicioId: string,
  entrada: ServicioInput,
): Promise<Resultado<ServicioPublico>> {
  const nombre = entrada.nombre.trim()
  if (!nombre) {
    return err('El nombre del servicio es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (entrada.precio < 0) {
    return err('El precio no puede ser negativo.', ERROR_CODES.VALIDACION)
  }

  const cuotasMax = entrada.cuotasMax ?? 0
  if (cuotasMax < 0 || cuotasMax > 36) {
    return err('Las cuotas máximas tienen que ser entre 0 y 36.', ERROR_CODES.VALIDACION)
  }

  const interesCuota = entrada.interesCuota ?? 0
  if (interesCuota < 0 || interesCuota > 100) {
    return err('El interés por cuota tiene que ser entre 0 y 100 %.', ERROR_CODES.VALIDACION)
  }

  const servicio = await prisma.servicio.findFirst({
    where: { id: servicioId, profileId },
  })

  if (!servicio) {
    return err('No encontramos ese servicio.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    const actualizada = await prisma.servicio.update({
      where: { id: servicioId },
      data: {
        nombre,
        descripcion: entrada.descripcion ?? null,
        precio: entrada.precio,
        cuotasMax,
        interesCuota,
        activo: entrada.activo ?? true,
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precio: true,
        moneda: true,
        cuotasMax: true,
        interesCuota: true,
        activo: true,
        sortOrder: true,
      },
    })

    return ok({
      ...actualizada,
      precio: Number(actualizada.precio),
      interesCuota: Number(actualizada.interesCuota),
    })
  } catch (error: unknown) {
    logger.error('servicio: error al editar', { profileId, servicioId, error })
    return err('No pudimos editar el servicio. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Elimina un servicio (lo marca como inactivo, no lo borra, para no romper
 * referencias históricas si las hubiera).
 */
export async function eliminarServicio(
  profileId: string,
  servicioId: string,
): Promise<Resultado<null>> {
  const servicio = await prisma.servicio.findFirst({
    where: { id: servicioId, profileId },
  })

  if (!servicio) {
    return err('No encontramos ese servicio.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    await prisma.servicio.update({
      where: { id: servicioId },
      data: { activo: false },
    })
  } catch (error: unknown) {
    logger.error('servicio: error al eliminar', { profileId, servicioId, error })
    return err('No pudimos eliminar el servicio. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  return ok(null)
}

/**
 * Reordena los servicios de un perfil.
 */
export async function reordenarServicios(
  profileId: string,
  ids: string[],
): Promise<Resultado<null>> {
  if (new Set(ids).size !== ids.length) {
    return err('Hay servicios repetidos en el orden.', ERROR_CODES.VALIDACION)
  }

  const propios = await prisma.servicio.findMany({
    where: { profileId, id: { in: ids } },
    select: { id: true },
  })

  if (propios.length !== ids.length) {
    return err('El orden incluye servicios que no son tuyos.', ERROR_CODES.SIN_PERMISOS)
  }

  try {
    await prisma.$transaction(
      ids.map((id, indice) =>
        prisma.servicio.update({ where: { id }, data: { sortOrder: indice } }),
      ),
    )
  } catch (error: unknown) {
    logger.error('servicio: error al reordenar', { profileId, error })
    return err('No pudimos guardar el orden. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  return ok(null)
}

/**
 * Obtiene todos los servicios de un perfil (incluidos inactivos), para el panel de edición.
 */
export async function listarServiciosAdmin(profileId: string): Promise<ServicioPublico[]> {
  const servicios = await prisma.servicio.findMany({
    where: { profileId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      precio: true,
      moneda: true,
      cuotasMax: true,
      interesCuota: true,
      activo: true,
      sortOrder: true,
    },
  })

  return servicios.map((s) => ({
    ...s,
    precio: Number(s.precio),
    interesCuota: Number(s.interesCuota),
  }))
}
