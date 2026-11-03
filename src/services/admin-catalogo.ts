import { Prisma, type Province } from '@prisma/client'

import { slugificar } from '@/lib/constantes'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, type ActorAuditoria } from '@/services/auditoria'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Catálogo de rubros y ciudades.
 *
 * Un rubro o una ciudad no se borran: se desactivan. Borrarlos se lleva
 * puestos los perfiles asociados, y un profesional que pagó el mes no puede
 * desaparecer porque alguien limpió el catálogo.
 */

export type EntradaRubro = {
  groupId: string
  name: string
  icon: string
  requiresLicense?: boolean
  licenseLabel?: string | null
}

export async function listarCatalogo() {
  const [grupos, ciudades] = await Promise.all([
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        sortOrder: true,
        categories: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
            sortOrder: true,
            isActive: true,
            requiresLicense: true,
            licenseLabel: true,
            _count: { select: { profiles: true } },
          },
        },
      },
    }),
    prisma.city.findMany({
      orderBy: [{ province: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        province: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { profiles: true, coverage: true } },
      },
    }),
  ])

  return { grupos, ciudades }
}

export async function crearRubro(
  entrada: EntradaRubro,
  actor: ActorAuditoria,
): Promise<Resultado<{ id: string }>> {
  const nombre = entrada.name.trim()
  const icono = entrada.icon.trim()

  if (nombre.length < 2) {
    return err('El nombre del rubro es obligatorio.', ERROR_CODES.VALIDACION)
  }

  if (!icono) {
    return err('Falta el ícono del rubro.', ERROR_CODES.VALIDACION)
  }

  const grupo = await prisma.categoryGroup.findUnique({
    where: { id: entrada.groupId },
    select: { id: true },
  })

  if (!grupo) return err('Ese grupo ya no existe.', ERROR_CODES.NO_ENCONTRADO)

  const slug = slugificar(nombre)

  if (!slug) return err('El nombre no genera una URL válida.', ERROR_CODES.VALIDACION)

  const ultimo = await prisma.category.aggregate({
    where: { groupId: entrada.groupId },
    _max: { sortOrder: true },
  })

  try {
    const rubro = await prisma.$transaction(async (tx) => {
      const creado = await tx.category.create({
        data: {
          groupId: entrada.groupId,
          name: nombre,
          slug,
          icon: icono,
          sortOrder: (ultimo._max.sortOrder ?? 0) + 1,
          requiresLicense: entrada.requiresLicense ?? false,
          licenseLabel: entrada.licenseLabel?.trim() || null,
        },
        select: { id: true },
      })

      await registrarAuditoria(
        {
          actor,
          accion: 'catalogo.rubro_crear',
          entidad: 'Category',
          entidadId: creado.id,
          despues: { nombre, slug },
        },
        tx,
      )

      return creado
    })

    return ok({ id: rubro.id })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err('Ya existe un rubro con ese nombre.', ERROR_CODES.DUPLICADO)
    }

    throw error
  }
}

export async function actualizarRubro(params: {
  id: string
  name?: string
  isActive?: boolean
  sortOrder?: number
  requiresLicense?: boolean
  licenseLabel?: string | null
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const anterior = await prisma.category.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      sortOrder: true,
      requiresLicense: true,
      licenseLabel: true,
    },
  })

  if (!anterior) return err('Ese rubro ya no existe.', ERROR_CODES.NO_ENCONTRADO)

  const nombre = params.name?.trim()
  const data: Prisma.CategoryUpdateInput = {}

  if (nombre !== undefined) {
    if (nombre.length < 2) {
      return err('El nombre del rubro es obligatorio.', ERROR_CODES.VALIDACION)
    }

    data.name = nombre
    data.slug = slugificar(nombre)
  }

  if (params.isActive !== undefined) data.isActive = params.isActive
  if (params.sortOrder !== undefined) data.sortOrder = Math.floor(params.sortOrder)
  if (params.requiresLicense !== undefined) data.requiresLicense = params.requiresLicense
  if (params.licenseLabel !== undefined) data.licenseLabel = params.licenseLabel?.trim() || null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id: anterior.id }, data })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'catalogo.rubro_editar',
          entidad: 'Category',
          entidadId: anterior.id,
          antes: {
            nombre: anterior.name,
            activo: anterior.isActive,
            orden: anterior.sortOrder,
            requiereMatricula: anterior.requiresLicense,
          },
          despues: data as Prisma.InputJsonValue,
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err('Ya existe un rubro con ese nombre.', ERROR_CODES.DUPLICADO)
    }

    throw error
  }
}

export async function crearCiudad(params: {
  province: Province
  name: string
  actor: ActorAuditoria
}): Promise<Resultado<{ id: string }>> {
  const nombre = params.name.trim()

  if (nombre.length < 2) {
    return err('El nombre de la ciudad es obligatorio.', ERROR_CODES.VALIDACION)
  }

  const slug = slugificar(nombre)

  if (!slug) return err('El nombre no genera una URL válida.', ERROR_CODES.VALIDACION)

  const ultima = await prisma.city.aggregate({
    where: { province: params.province },
    _max: { sortOrder: true },
  })

  try {
    const ciudad = await prisma.$transaction(async (tx) => {
      const creada = await tx.city.create({
        data: {
          province: params.province,
          name: nombre,
          slug,
          sortOrder: (ultima._max.sortOrder ?? 0) + 1,
        },
        select: { id: true },
      })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'catalogo.ciudad_crear',
          entidad: 'City',
          entidadId: creada.id,
          despues: { nombre, provincia: params.province },
        },
        tx,
      )

      return creada
    })

    return ok({ id: ciudad.id })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err('Esa ciudad ya existe en la provincia.', ERROR_CODES.DUPLICADO)
    }

    throw error
  }
}

export async function actualizarCiudad(params: {
  id: string
  name?: string
  isActive?: boolean
  sortOrder?: number
  actor: ActorAuditoria
}): Promise<Resultado<null>> {
  const anterior = await prisma.city.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, isActive: true, sortOrder: true, province: true },
  })

  if (!anterior) return err('Esa ciudad ya no existe.', ERROR_CODES.NO_ENCONTRADO)

  const data: Prisma.CityUpdateInput = {}
  const nombre = params.name?.trim()

  if (nombre !== undefined) {
    if (nombre.length < 2) {
      return err('El nombre de la ciudad es obligatorio.', ERROR_CODES.VALIDACION)
    }

    data.name = nombre
    data.slug = slugificar(nombre)
  }

  if (params.isActive !== undefined) data.isActive = params.isActive
  if (params.sortOrder !== undefined) data.sortOrder = Math.floor(params.sortOrder)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.city.update({ where: { id: anterior.id }, data })

      await registrarAuditoria(
        {
          actor: params.actor,
          accion: 'catalogo.ciudad_editar',
          entidad: 'City',
          entidadId: anterior.id,
          antes: { nombre: anterior.name, activo: anterior.isActive, orden: anterior.sortOrder },
          despues: data as Prisma.InputJsonValue,
        },
        tx,
      )
    })

    return ok(null)
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err('Esa ciudad ya existe en la provincia.', ERROR_CODES.DUPLICADO)
    }

    throw error
  }
}

/**
 * Mueve los perfiles de una localidad a otra.
 *
 * Es la operación de limpieza de "Otra localidad": los perfiles cargados a
 * mano quedan en una ciudad real y la localidad vieja se desactiva. Se mueve
 * también la cobertura, no solo la ciudad base, porque un perfil que decía
 * "atiendo en Otra localidad" tiene que seguir apareciendo donde atendía.
 */
export async function reasignarLocalidad(params: {
  origenId: string
  destinoId: string
  actor: ActorAuditoria
}): Promise<Resultado<{ movidos: number }>> {
  if (params.origenId === params.destinoId) {
    return err('Elegí una ciudad distinta.', ERROR_CODES.VALIDACION)
  }

  const [origen, destino] = await Promise.all([
    prisma.city.findUnique({
      where: { id: params.origenId },
      select: { id: true, name: true, province: true },
    }),
    prisma.city.findUnique({
      where: { id: params.destinoId },
      select: { id: true, name: true, province: true },
    }),
  ])

  if (!origen || !destino) return err('Alguna de las ciudades no existe.', ERROR_CODES.NO_ENCONTRADO)

  if (origen.province !== destino.province) {
    return err('Las dos ciudades tienen que ser de la misma provincia.', ERROR_CODES.VALIDACION)
  }

  const movidos = await prisma.$transaction(async (tx) => {
    const bases = await tx.profile.findMany({
      where: { baseCityId: origen.id },
      select: { id: true },
    })

    const coberturas = await tx.profileCoverage.findMany({
      where: { cityId: origen.id },
      select: { profileId: true },
    })

    await tx.profile.updateMany({
      where: { baseCityId: origen.id },
      data: { baseCityId: destino.id },
    })

    if (coberturas.length > 0) {
      await tx.profileCoverage.createMany({
        data: coberturas.map((fila) => ({ profileId: fila.profileId, cityId: destino.id })),
        skipDuplicates: true,
      })
    }

    await tx.profileCoverage.deleteMany({ where: { cityId: origen.id } })
    await tx.city.update({ where: { id: origen.id }, data: { isActive: false } })

    await registrarAuditoria(
      {
        actor: params.actor,
        accion: 'catalogo.localidad_reasignar',
        entidad: 'City',
        entidadId: origen.id,
        antes: { origen: origen.name, destino: destino.name },
        despues: { perfilesMovidos: bases.length },
      },
      tx,
    )

    return bases.length
  })

  return ok({ movidos })
}
