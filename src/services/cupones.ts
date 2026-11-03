import { Prisma, TipoCupon } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  calcularMontoConDescuento,
  montoParaPasarela,
  type CuponParaValidar,
  type EntradaValidacionCupon,
  type ValidacionCupon,
  validarCupon,
} from '@/lib/cupones'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Cupones de lanzamiento.
 *
 * Un cupón se puede usar al crear una suscripción. La validación es en dos
 * pasos:
 * 1. `validarCupon` (pura) decide si aplica, contra los datos que trae el
 *    cliente y los que lee de la base.
 * 2. `canjearCupon` escribe la redención e incrementa el cupo, dentro de una
 *    transacción para que dos usos simultáneos no se pasen del cupo.
 */

/**
 * Busca un cupón por su código, sin importar si está activo o vencido.
 *
 * Lo usa la pantalla de aplicación de cupón para decir "ese cupón no existe" o
 * "ese cupón ya venció" en vez de un error genérico.
 */
export async function obtenerCuponPorCodigo(codigo: string) {
  return prisma.cupon.findUnique({
    where: { codigo: codigo.trim().toUpperCase() },
    select: {
      id: true,
      codigo: true,
      tipo: true,
      valor: true,
      cupoMaximoUsos: true,
      usosActuales: true,
      vigenteDesde: true,
      vigenteHasta: true,
      rubrosHabilitados: true,
      provinciasHabilitados: true,
      activo: true,
    },
  })
}

/**
 * Valida si un cupón se puede aplicar a un perfil y devuelve el monto final.
 *
 * No escribe nada: solo lee. Se llama antes de mostrar el precio con descuento
 * en la pantalla de suscripción.
 */
export async function validarCuponParaPerfil(params: {
  profileId: string
  codigo: string
  rubroSlug: string | null
  provincia: string | null
  whatsappHash: string | null
  cuitHash: string | null
  ahora?: Date
}): Promise<Resultado<{ cupo: CuponParaValidar; montoFinal: number }>> {
  const cupo = await obtenerCuponPorCodigo(params.codigo)

  if (!cupo) {
    return err('Ese cupón no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  const yaUsadoPorEstePerfil = await prisma.cuponRedencion.count({
    where: { cuponId: cupo.id, profileId: params.profileId },
  })

  const yaUsadoPorWhatsapp = params.whatsappHash
    ? Number(
        await prisma.cuponRedencion.count({
          where: { cuponId: cupo.id, whatsappHash: params.whatsappHash },
        }),
      )
    : 0

  const yaUsadoPorCuit = params.cuitHash
    ? Number(
        await prisma.cuponRedencion.count({
          where: { cuponId: cupo.id, cuitHash: params.cuitHash },
        }),
      )
    : 0

  const entrada: EntradaValidacionCupon = {
    rubroSlug: params.rubroSlug,
    provincia: params.provincia,
    whatsappHash: params.whatsappHash,
    cuitHash: params.cuitHash,
    yaUsadoPorEstePerfil: yaUsadoPorEstePerfil > 0,
    yaUsadoPorEsteWhatsapp: yaUsadoPorWhatsapp > 0,
    yaUsadoPorEsteCuit: yaUsadoPorCuit > 0,
  }

  const validacion = validarCupon(
    {
      id: cupo.id,
      codigo: cupo.codigo,
      tipo: cupo.tipo,
      valor: cupo.valor ? Number(cupo.valor) : null,
      cupoMaximoUsos: cupo.cupoMaximoUsos,
      usosActuales: cupo.usosActuales,
      vigenteDesde: cupo.vigenteDesde,
      vigenteHasta: cupo.vigenteHasta,
      rubrosHabilitados: (cupo.rubrosHabilitados as string[] | null) ?? null,
      provinciasHabilitados: (cupo.provinciasHabilitados as string[] | null) ?? null,
      activo: cupo.activo,
    },
    entrada,
    undefined,
    params.ahora,
  )

  if (!validacion.valido || validacion.montoFinal === null) {
    return err(validacion.motivo ?? 'Ese cupón no se puede usar.', ERROR_CODES.ESTADO_INVALIDO)
  }

  return ok({
    cupo: {
      id: cupo.id,
      codigo: cupo.codigo,
      tipo: cupo.tipo,
      valor: cupo.valor ? Number(cupo.valor) : null,
      cupoMaximoUsos: cupo.cupoMaximoUsos,
      usosActuales: cupo.usosActuales,
      vigenteDesde: cupo.vigenteDesde,
      vigenteHasta: cupo.vigenteHasta,
      rubrosHabilitados: (cupo.rubrosHabilitados as string[] | null) ?? null,
      provinciasHabilitados: (cupo.provinciasHabilitados as string[] | null) ?? null,
      activo: cupo.activo,
    },
    montoFinal: validacion.montoFinal,
  })
}

/**
 * Canjea un cupón para un perfil al crear una suscripción.
 *
 * Va dentro de la transacción de `crearSuscripcion` (ver ese archivo). Aquí
 * solo se encarga de:
 * 1. Volver a validar (con los datos de este momento, dentro de la tx).
 * 2. Crear la redención (`CuponRedencion`).
 * 3. Incrementar `usosActuales` del cupón.
 *
 * Devuelve el monto final con descuento, para que el llamador lo use como
 * `planAmount` de la suscripción.
 */
export async function canjearCupon(params: {
  tx: Prisma.TransactionClient
  profileId: string
  codigo: string
  rubroSlug: string | null
  provincia: string | null
  whatsappHash: string | null
  cuitHash: string | null
  ahora: Date
  montoDelPlan: number
}): Promise<Resultado<{ montoFinal: number; cupoId: string }>> {
  const cupo = await params.tx.cupon.findUnique({
    where: { codigo: params.codigo.trim().toUpperCase() },
  })

  if (!cupo) {
    return err('Ese cupón no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  const yaUsadoPorEstePerfil = await params.tx.cuponRedencion.findUnique({
    where: { profileId: params.profileId },
    select: { id: true, cuponId: true },
  })

  if (yaUsadoPorEstePerfil && yaUsadoPorEstePerfil.cuponId === cupo.id) {
    return err('Ya usaste este cupón con este perfil.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const yaUsadoPorWhatsapp = params.whatsappHash
    ? Number(
        await params.tx.cuponRedencion.count({
          where: { cuponId: cupo.id, whatsappHash: params.whatsappHash },
        }),
      )
    : 0

  if (yaUsadoPorWhatsapp > 0) {
    return err('Ya usaste este cupón con ese número de WhatsApp.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const yaUsadoPorCuit = params.cuitHash
    ? Number(
        await params.tx.cuponRedencion.count({
          where: { cuponId: cupo.id, cuitHash: params.cuitHash },
        }),
      )
    : 0

  if (yaUsadoPorCuit > 0) {
    return err('Ya usaste este cupón con ese CUIT.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const ahora = params.ahora

  if (!cupo.activo) {
    return err('Ese cupón ya no está activo.', ERROR_CODES.ESTADO_INVALIDO)
  }

  if (ahora.getTime() < cupo.vigenteDesde.getTime()) {
    return err('Ese cupón aún no está vigente.', ERROR_CODES.ESTADO_INVALIDO)
  }

  if (cupo.vigenteHasta && ahora.getTime() > cupo.vigenteHasta.getTime()) {
    return err('Ese cupón ya venció.', ERROR_CODES.ESTADO_INVALIDO)
  }

  if (cupo.usosActuales >= cupo.cupoMaximoUsos) {
    return err('Ese cupón ya no tiene cupos disponibles.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const rubros = (cupo.rubrosHabilitados as string[] | null) ?? null
  if (
    rubros &&
    rubros.length > 0 &&
    (!params.rubroSlug || !rubros.includes(params.rubroSlug))
  ) {
    return err('Este cupón no aplica a tu rubro.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const provincias = (cupo.provinciasHabilitados as string[] | null) ?? null
  if (
    provincias &&
    provincias.length > 0 &&
    (!params.provincia || !provincias.includes(params.provincia))
  ) {
    return err('Este cupón no aplica a tu provincia.', ERROR_CODES.ESTADO_INVALIDO)
  }

  const montoFinal = calcularMontoConDescuento(
    cupo.tipo,
    cupo.valor ? Number(cupo.valor) : null,
    params.montoDelPlan,
  )

  if (montoFinal === null) {
    return err('No se pudo calcular el descuento del cupón.', ERROR_CODES.DESCONOCIDO)
  }

  await params.tx.cuponRedencion.create({
    data: {
      cuponId: cupo.id,
      profileId: params.profileId,
      whatsappHash: params.whatsappHash ?? null,
      cuitHash: params.cuitHash ?? null,
    },
  })

  await params.tx.cupon.update({
    where: { id: cupo.id },
    data: { usosActuales: { increment: 1 } },
  })

  return ok({ montoFinal, cupoId: cupo.id })
}

/** Filtros para listar cupones (admin). */
export type FiltrosCupon = {
  activo?: boolean
  tipo?: TipoCupon
  pagina?: number
}

/** Fila de cupón para el panel de administración. */
export type FilaCupon = {
  id: string
  codigo: string
  tipo: string
  valor: number | null
  cupoMaximoUsos: number
  usosActuales: number
  usosRestantes: number
  vigenteDesde: Date
  vigenteHasta: Date | null
  activo: boolean
  createdAt: Date
}

export async function listarCupones(filtros: FiltrosCupon = {}): Promise<{
  filas: FilaCupon[]
  pagina: ReturnType<typeof import('@/lib/admin').calcularPagina>
}> {
  const { calcularPagina, normalizarPagina, POR_PAGINA } = await import('@/lib/admin')

  const where: Prisma.CuponWhereInput = {}

  if (filtros.activo !== undefined) where.activo = filtros.activo
  if (filtros.tipo) where.tipo = filtros.tipo

  const total = await prisma.cupon.count({ where })
  const pagina = calcularPagina(total, normalizarPagina(filtros.pagina), POR_PAGINA)

  const filas = await prisma.cupon.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (pagina.pagina - 1) * pagina.porPagina,
    take: pagina.porPagina,
    select: {
      id: true,
      codigo: true,
      tipo: true,
      valor: true,
      cupoMaximoUsos: true,
      usosActuales: true,
      vigenteDesde: true,
      vigenteHasta: true,
      activo: true,
      createdAt: true,
    },
  })

  return {
    filas: filas.map((f) => ({
      id: f.id,
      codigo: f.codigo,
      tipo: f.tipo,
      valor: f.valor ? Number(f.valor) : null,
      cupoMaximoUsos: f.cupoMaximoUsos,
      usosActuales: f.usosActuales,
      usosRestantes: f.cupoMaximoUsos - f.usosActuales,
      vigenteDesde: f.vigenteDesde,
      vigenteHasta: f.vigenteHasta,
      activo: f.activo,
      createdAt: f.createdAt,
    })),
    pagina,
  }
}

/** Datos para crear un cupón (admin). */
export type DatosCrearCupon = {
  codigo: string
  tipo: TipoCupon
  valor: number | null
  cupoMaximoUsos: number
  vigenteDesde: Date
  vigenteHasta: Date | null
  rubrosHabilitados: string[] | null
  provinciasHabilitados: string[] | null
  activo: boolean
}

export async function crearCupon(entrada: DatosCrearCupon): Promise<Resultado<{ id: string }>> {
  try {
    const cupo = await prisma.cupon.create({
      data: {
        codigo: entrada.codigo.trim().toUpperCase(),
        tipo: entrada.tipo,
        valor: entrada.valor ? new Prisma.Decimal(entrada.valor) : null,
        cupoMaximoUsos: entrada.cupoMaximoUsos,
        vigenteDesde: entrada.vigenteDesde,
        vigenteHasta: entrada.vigenteHasta,
        rubrosHabilitados: entrada.rubrosHabilitados as Prisma.InputJsonValue,
        provinciasHabilitados: entrada.provinciasHabilitados as Prisma.InputJsonValue,
        activo: entrada.activo,
      },
      select: { id: true },
    })

    return ok({ id: cupo.id })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err('Ya existe un cupón con ese código.', ERROR_CODES.DUPLICADO)
    }

    logger.error('cupones: no se pudo crear el cupón', { codigo: entrada.codigo, error })
    return err('No se pudo crear el cupón. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/** Datos para actualizar un cupón (admin). */
export type DatosActualizarCupon = {
  activo?: boolean
  cupoMaximoUsos?: number
  vigenteHasta?: Date | null
  rubrosHabilitados?: string[] | null
  provinciasHabilitados?: string[] | null
}

export async function actualizarCupon(
  cupoId: string,
  entrada: DatosActualizarCupon,
): Promise<Resultado<null>> {
  try {
    await prisma.cupon.update({
      where: { id: cupoId },
      data: {
        ...(entrada.activo !== undefined && { activo: entrada.activo }),
        ...(entrada.cupoMaximoUsos !== undefined && { cupoMaximoUsos: entrada.cupoMaximoUsos }),
        ...(entrada.vigenteHasta !== undefined && { vigenteHasta: entrada.vigenteHasta }),
        ...(entrada.rubrosHabilitados !== undefined && {
          rubrosHabilitados: entrada.rubrosHabilitados as Prisma.InputJsonValue,
        }),
        ...(entrada.provinciasHabilitados !== undefined && {
          provinciasHabilitados: entrada.provinciasHabilitados as Prisma.InputJsonValue,
        }),
      },
    })

    return ok(null)
  } catch (error: unknown) {
    logger.error('cupones: no se pudo actualizar el cupón', { cupoId, error })
    return err('No se pudo actualizar el cupón. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Cuántos socios fundadores quedan, si el cupón de lanzamiento es MES_GRATIS.
 *
 * Los socios fundadores son los primeros N perfiles que usaron un cupón
 * MES_GRATIS. El contador se deriva de las redenciones de ese tipo, no de un
 * campo aparte: así no hay dos fuentes de verdad.
 */
export async function contadorSociosFundadores(codigoCupoFundadores: string): Promise<{
  cupoMaximo: number
  usados: number
  restantes: number
}> {
  const cupo = await prisma.cupon.findUnique({
    where: { codigo: codigoCupoFundadores },
    select: {
      cupoMaximoUsos: true,
      usosActuales: true,
      tipo: true,
    },
  })

  if (!cupo) {
    return { cupoMaximo: 0, usados: 0, restantes: 0 }
  }

  return {
    cupoMaximo: cupo.cupoMaximoUsos,
    usados: cupo.usosActuales,
    restantes: Math.max(0, cupo.cupoMaximoUsos - cupo.usosActuales),
  }
}

/**
 * ¿El perfil es socio fundador?
 *
 * Se deriva de la existencia de una redención de un cupón MES_GRATIS para
 * este perfil. No hay un campo aparte en Profile: la insignia se gana al
 * canjear el cupón de lanzamiento.
 */
export async function esSocioFundador(profileId: string): Promise<boolean> {
  const redencion = await prisma.cuponRedencion.findFirst({
    where: {
      profileId,
      cupon: { tipo: TipoCupon.MES_GRATIS },
    },
    select: { id: true },
  })

  return redencion !== null
}
