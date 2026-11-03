import { normalizarDominios } from '@/lib/admin'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { BANDERA_APROBACION_MANUAL, exigeAprobacionManual } from '@/services/ajustes'

/**
 * Lectura de la configuración del sitio.
 *
 * Separada de la escritura (`admin-config.ts`) para que el webhook, el cron y
 * el voto puedan leer una bandera sin arrastrar el módulo de administración
 * entero. Los valores por defecto están acá, no en cada consumidor.
 */

export const CLAVES_CONFIG = {
  aprobacionManual: BANDERA_APROBACION_MANUAL,
  minPerfiles: 'minProfilesToOpenCategory',
  diasGracia: 'paymentGraceDays',
  dominios: 'disposableEmailDomains',
} as const

export const MIN_PERFILES_POR_DEFECTO = 3
export const DIAS_GRACIA_POR_DEFECTO = env.payment.graceDays

export type ConfiguracionAdmin = {
  aprobacionManual: boolean
  minPerfiles: number
  diasGracia: number
  dominios: string[]
}

export async function obtenerConfiguracion(): Promise<ConfiguracionAdmin> {
  const filas = await prisma.siteSetting.findMany({
    where: { key: { in: Object.values(CLAVES_CONFIG) } },
    select: { key: true, value: true },
  })

  const valores = new Map(filas.map((fila) => [fila.key, fila.value]))

  return {
    aprobacionManual:
      valores.get(CLAVES_CONFIG.aprobacionManual) === true ||
      valores.get(CLAVES_CONFIG.aprobacionManual) === 'true',
    minPerfiles: enteroEnRango(
      valores.get(CLAVES_CONFIG.minPerfiles),
      0,
      100,
      MIN_PERFILES_POR_DEFECTO,
    ),
    diasGracia: enteroEnRango(
      valores.get(CLAVES_CONFIG.diasGracia),
      0,
      365,
      DIAS_GRACIA_POR_DEFECTO,
    ),
    dominios: listaDeDominios(valores.get(CLAVES_CONFIG.dominios)),
  }
}

/** Días de gracia vigentes, para el webhook y el cron. */
export async function diasDeGracia(): Promise<number> {
  try {
    const ajuste = await prisma.siteSetting.findUnique({
      where: { key: CLAVES_CONFIG.diasGracia },
      select: { value: true },
    })

    return enteroEnRango(ajuste?.value, 0, 365, DIAS_GRACIA_POR_DEFECTO)
  } catch {
    return DIAS_GRACIA_POR_DEFECTO
  }
}

/** Dominios extra que el administrador agregó a la lista de desechables. */
export async function dominiosDesechablesExtra(): Promise<string[]> {
  try {
    const ajuste = await prisma.siteSetting.findUnique({
      where: { key: CLAVES_CONFIG.dominios },
      select: { value: true },
    })

    return listaDeDominios(ajuste?.value)
  } catch {
    return []
  }
}

export { exigeAprobacionManual }

function enteroEnRango(
  valor: unknown,
  minimo: number,
  maximo: number,
  porDefecto: number,
): number {
  const numero = typeof valor === 'number' ? valor : Number(valor)

  if (!Number.isFinite(numero)) return porDefecto

  const entero = Math.floor(numero)

  return entero < minimo || entero > maximo ? porDefecto : entero
}

function listaDeDominios(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []

  return normalizarDominios(
    valor.filter((item): item is string => typeof item === 'string').join('\n'),
  )
}

