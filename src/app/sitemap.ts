import { MetadataRoute } from 'next'
import type { Province } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'

const URL_BASE = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Siempre en runtime: el sitemap depende de la base de datos y no se puede
 * prerenderizar en el build (no hay Postgres en el entorno de build). */
export const dynamic = 'force-dynamic'

const PROVINCIA_SLUG: Record<string, string> = {}
for (const provincia of PROVINCIAS_LISTA) {
  PROVINCIA_SLUG[provincia] = PROVINCIAS[provincia].slug
}

/**
 * Sitemap dinámico.
 *
 * Solo se indexan URLs que tienen contenido real: rubros, combinaciones
 * provincia/rubro y provincia/ciudad/rubro con al menos un perfil que cumpla
 * `CONDICION_PERFIL_PUBLICO`, y los propios perfiles publicados. Así no se
 * publican páginas vacías que Google interpretaría como contenido fino.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entradas: MetadataRoute.Sitemap = []

  entradas.push({ url: URL_BASE, changeFrequency: 'daily', priority: 1 })

  const perfiles = await prisma.profile.findMany({
    where: CONDICION_PERFIL_PUBLICO,
    select: {
      slug: true,
      updatedAt: true,
      coversWholeProvince: true,
      coversOtherProvinces: true,
      baseCity: { select: { slug: true, province: true } },
      coverage: { select: { city: { select: { slug: true, province: true } } } },
      categories: { select: { category: { select: { slug: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 45000,
  })

  // Perfiles publicados.
  for (const perfil of perfiles) {
    entradas.push({
      url: `${URL_BASE}/${perfil.slug}`,
      lastModified: perfil.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  // Combina en memoria para una sola consulta: provincias donde aparece el
  // perfil, sus rubros y sus ciudades por provincia.
  const rubrosConPerfiles = new Set<string>()
  const provinciaRubro = new Set<string>()
  const provinciaCiudadRubro = new Set<string>()

  for (const perfil of perfiles) {
    const provincias = new Set<Province>()
    if (perfil.baseCity) provincias.add(perfil.baseCity.province)
    for (const cobertura of perfil.coverage) provincias.add(cobertura.city.province)
    for (const provincia of perfil.coversOtherProvinces) provincias.add(provincia)
    if (perfil.coversWholeProvince && perfil.baseCity) {
      provincias.add(perfil.baseCity.province)
    }

    const rubros = perfil.categories.map((c) => c.category.slug)
    rubros.forEach((rubro) => rubrosConPerfiles.add(rubro))

    const ciudadesPorProvincia = new Map<Province, Set<string>>()
    if (perfil.baseCity) {
      const ciudades =
        ciudadesPorProvincia.get(perfil.baseCity.province) ?? new Set<string>()
      ciudades.add(perfil.baseCity.slug)
      ciudadesPorProvincia.set(perfil.baseCity.province, ciudades)
    }
    for (const cobertura of perfil.coverage) {
      const ciudades =
        ciudadesPorProvincia.get(cobertura.city.province) ?? new Set<string>()
      ciudades.add(cobertura.city.slug)
      ciudadesPorProvincia.set(cobertura.city.province, ciudades)
    }

    for (const provincia of provincias) {
      const provinciaSlug = PROVINCIA_SLUG[provincia]
      if (!provinciaSlug) continue
      for (const rubro of rubros) {
        provinciaRubro.add(`${provinciaSlug}/${rubro}`)
        const ciudades = ciudadesPorProvincia.get(provincia)
        if (ciudades) {
          for (const ciudad of ciudades) {
            provinciaCiudadRubro.add(`${provinciaSlug}/${ciudad}/${rubro}`)
          }
        }
      }
    }
  }

  // Rubros con al menos un perfil publicado (listado general de búsqueda).
  for (const rubro of rubrosConPerfiles) {
    entradas.push({
      url: `${URL_BASE}/buscar?rubro=${rubro}`,
      changeFrequency: 'daily',
      priority: 0.6,
    })
  }

  // Provincia + rubro.
  for (const combinacion of provinciaRubro) {
    entradas.push({
      url: `${URL_BASE}/${combinacion}`,
      changeFrequency: 'daily',
      priority: 0.7,
    })
  }

  // Provincia + ciudad + rubro.
  for (const combinacion of provinciaCiudadRubro) {
    entradas.push({
      url: `${URL_BASE}/${combinacion}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
  }

  return entradas
}
