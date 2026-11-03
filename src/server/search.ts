import { Prisma, Province, ProfileType, TeamSize } from '@prisma/client'

import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'
import { prisma } from '@/lib/prisma'

export const RESULTADOS_POR_PAGINA = 12

export interface FiltrosBusqueda {
  rubro?: string
  subcategoria?: string
  provincia?: Province
  ciudad?: string
  tipo?: ProfileType
  q?: string
  pagina?: number
}

export type PerfilResultadoBusqueda = {
  id: string
  slug: string
  type: ProfileType
  name: string
  tradeName: string | null
  logoUrl: string | null
  teamSize: TeamSize | null
  shortBio: string | null
  licenseNumber: string | null
  companyVerified: boolean
  heartsCount: number
  image: { url: string; width: number; height: number } | null
  primaryCategory: string
  secondaryCategory: string | null
  baseCity: string | null
  province: Province | null
  coverage: string[]
  coversWholeProvince: boolean
}

/**
 * Construye el `where` de Prisma para la búsqueda de perfiles públicos.
 *
 * Vive acá y lo usan tanto `searchProfiles` como `contarPerfilesPublicos` para
 * que el conteo de "no hay resultados" use exactamente el mismo filtro que la
 * lista. Dos filtros distintos generan páginas vacías indexadas o resultados
 * que no coinciden con el conteo.
 */
export function construirDonde(filtros: FiltrosBusqueda): Prisma.ProfileWhereInput {
  const donde: Prisma.ProfileWhereInput = { ...CONDICION_PERFIL_PUBLICO }

  if (filtros.tipo) donde.type = filtros.tipo
  if (filtros.provincia) {
    donde.baseCity = { province: { equals: filtros.provincia } }
  }

  if (filtros.rubro || filtros.subcategoria) {
    const filters: Prisma.ProfileWhereInput = {}
    if (filtros.rubro) {
      filters.categories = {
        some: { category: { slug: { equals: filtros.rubro }, isActive: true } },
      }
    }
    if (filtros.subcategoria) {
      filters.subcategories = {
        some: { subcategory: { slug: { equals: filtros.subcategoria }, isActive: true } },
      }
    }
    const andArr = (donde.AND as Prisma.ProfileWhereInput[] | undefined) ?? []
    donde.AND = [...andArr, filters]
  }

  if (filtros.ciudad) {
    const ciudadWhere: Prisma.ProfileWhereInput = {
      OR: [
        { baseCity: { slug: { equals: filtros.ciudad } } },
        {
          coverage: {
            some: { city: { slug: { equals: filtros.ciudad } } },
          },
        },
      ],
    }
    if (filtros.provincia) {
      ciudadWhere.OR!.push({
        coversWholeProvince: true,
        baseCity: { province: { equals: filtros.provincia } },
      })
    }
    const base = donde.AND as Prisma.ProfileWhereInput[] | undefined
    donde.AND = [...(base ?? []), ciudadWhere]
  }

  return donde
}

export async function searchProfiles(
  filtros: FiltrosBusqueda,
): Promise<{ perfiles: PerfilResultadoBusqueda[]; total: number }> {
  const {
    rubro,
    subcategoria,
    provincia,
    ciudad,
    tipo,
    q,
    pagina = 1,
  } = filtros

  const skip = (Math.max(1, pagina) - 1) * RESULTADOS_POR_PAGINA

  const donde = construirDonde(filtros)

  const total = await prisma.profile.count({ where: donde })

  if (total === 0) {
    return { perfiles: [], total: 0 }
  }

  const perfilesRaw = await prisma.profile.findMany({
    where: donde,
    select: {
      id: true,
      slug: true,
      type: true,
      name: true,
      tradeName: true,
      logoUrl: true,
      teamSize: true,
      shortBio: true,
      licenseNumber: true,
      companyVerifiedAt: true,
      heartsCount: true,
      images: {
        where: { isHidden: false },
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { url: true, width: true, height: true },
      },
      categories: {
        orderBy: { isPrimary: 'desc' },
        take: 2,
        select: {
          category: { select: { name: true } },
        },
      },
      baseCity: { select: { name: true, province: true } },
      coverage: { select: { city: { select: { name: true } } } },
      coversWholeProvince: true,
    },
    orderBy: { heartsCount: 'desc' },
    skip,
    take: RESULTADOS_POR_PAGINA,
  })

  const perfiles: PerfilResultadoBusqueda[] = perfilesRaw.map((p) => {
    const catPrimaria = p.categories[0]?.category.name ?? ''
    const catSecundaria = p.categories[1]?.category.name ?? null
    const cobertura = p.coverage.map((c) => c.city.name)
    return {
      id: p.id,
      slug: p.slug,
      type: p.type,
      name: p.name,
      tradeName: p.tradeName,
      logoUrl: p.logoUrl,
      teamSize: p.teamSize,
      shortBio: p.shortBio,
      licenseNumber: p.licenseNumber,
      companyVerified: p.companyVerifiedAt !== null,
      heartsCount: p.heartsCount,
      image: p.images[0]
        ? { url: p.images[0].url, width: p.images[0].width, height: p.images[0].height }
        : null,
      primaryCategory: catPrimaria,
      secondaryCategory: catSecundaria,
      baseCity: p.baseCity?.name ?? null,
      province: p.baseCity?.province ?? null,
      coverage: cobertura,
      coversWholeProvince: p.coversWholeProvince,
    }
  })

  return { perfiles, total }
}

export async function rubrosConPerfilesSuficientes(
  provincia: Province,
  minimo: number,
): Promise<string[]> {
  const conteo = await prisma.profileCategory.groupBy({
    by: ['categoryId'],
    where: {
      category: { isActive: true },
      profile: {
        ...CONDICION_PERFIL_PUBLICO,
        baseCity: { province: { equals: provincia } },
      },
    },
    _count: { _all: true },
  })

  const categoriasConPerfiles = await prisma.category.findMany({
    where: { id: { in: conteo.filter((c) => c._count._all >= minimo).map((c) => c.categoryId) } },
    select: { slug: true },
  })

  return categoriasConPerfiles.map((c) => c.slug)
}

/**
 * Cuenta perfiles públicos con los mismos filtros de `searchProfiles`.
 *
 * Se usa para decidir `noindex` en páginas de resultados sin perfiles: el
 * conteo y la lista comparten `construirDonde`, así no pueden discrepar.
 */
export async function contarPerfilesPublicos(
  filtros: FiltrosBusqueda,
): Promise<number> {
  return prisma.profile.count({ where: construirDonde(filtros) })
}