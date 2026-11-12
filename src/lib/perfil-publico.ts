/**
 * Lógica pura del perfil público.
 *
 * Todo lo que se puede decidir sin base de datos ni red vive acá: cómo se llama
 * el perfil, qué zonas cubre, qué se publica en los metadatos y qué dice el
 * JSON-LD. Separarlo del servicio permite testear el dato estructurado sin
 * levantar Postgres, que es justo lo que Google va a leer.
 *
 * Dos reglas que no son de estilo:
 *
 * 1. **El teléfono no sale de acá.** El JSON-LD no lleva `telephone` y los
 *    metadatos tampoco. El número solo existe en la base y en la redirección de
 *    `/api/contacto/[slug]`; publicarlo en el HTML regala el contacto y rompe el
 *    negocio del portal.
 * 2. **Nada de `aggregateRating`.** Los corazones son una señal de confianza de
 *    quienes ya contactaron, no una puntuación de 1 a 5. Inventar una nota con
 *    ese dato viola las pautas de datos estructurados de Google.
 */

import type { Province, ProfileType, TeamSize } from '@prisma/client'
import type { Metadata } from 'next'

import { NOMBRE_PAGINA, PROVINCIAS } from '@/lib/constantes'

/**
 * Texto legal del aviso. Vive en una constante porque lo usan el perfil y los
 * tests: si cambia, tiene que cambiar en un solo lugar.
 */
export const AVISO_WHATSAPP =
  'WhatsApp verificado significa que el profesional controla ese número. ' +
  'No implica verificación de identidad ni antecedentes.'

/**
 * Forma mínima que necesitan los constructores.
 *
 * Es estructural y no el tipo de Prisma a propósito: el test arma un perfil a
 * mano sin importar la base, y el servicio puede seleccionar columnas de más
 * sin que esto se entere.
 */
export type PerfilParaPublicar = {
  slug: string
  type: ProfileType
  name: string
  tradeName: string | null
  logoUrl: string | null
  teamSize: TeamSize | null
  licenseNumber: string | null
  description: string | null
  shortBio: string | null
  companyVerifiedAt: Date | null
  coversWholeProvince: boolean
  coversOtherProvinces: Province[]
  baseCity: { name: string; province: Province } | null
  coverage: { city: { name: string; province: Province } }[]
  images: { url: string; width: number; height: number }[]
  categories: {
    isPrimary: boolean
    category: {
      name: string
      slug: string
      requiresLicense: boolean
      licenseLabel: string | null
      group: { name: string }
    }
  }[]
  subcategories: { subcategory: { name: string } }[]
}

/**
 * Nombre que ve el cliente.
 *
 * Una empresa se presenta con el nombre comercial; si no lo cargó, con la
 * razón social. Una persona siempre con su nombre.
 */
export function nombreMostrado(perfil: PerfilParaPublicar): string {
  return perfil.type === 'COMPANY' ? perfil.tradeName ?? perfil.name : perfil.name
}

export type RubroPrincipal = {
  name: string
  slug: string
  group: string
  licenseLabel: string | null
}

/** Rubro principal, con el segundo como respaldo si el dato quedó incompleto. */
export function rubroPrincipal(perfil: PerfilParaPublicar): RubroPrincipal | null {
  const elegido =
    perfil.categories.find((c) => c.isPrimary)?.category ?? perfil.categories[0]?.category

  if (!elegido) return null

  return {
    name: elegido.name,
    slug: elegido.slug,
    group: elegido.group.name,
    licenseLabel: elegido.licenseLabel,
  }
}

/**
 * Texto de la matrícula.
 *
 * La etiqueta la define el rubro (`licenseLabel`), porque "Matrícula" no
 * significa lo mismo para un gasista que para un abogado. Nunca se muestra
 * como verificada: el admin todavía no revisó el documento.
 */
export function etiquetaMatricula(perfil: PerfilParaPublicar): string | null {
  const numero = perfil.licenseNumber?.trim()

  if (!numero) return null

  const etiqueta = rubroPrincipal(perfil)?.licenseLabel ?? 'Matrícula'

  return `${etiqueta}: ${numero}`
}

/**
 * Ciudades que cubre, sin repetir la base.
 *
 * El esquema no guarda la ciudad base en `coverage`, pero un dato viejo puede
 * incluirla. Se deduplica acá para no mostrar "San Miguel de Tucumán" dos veces.
 */
export function ciudadesCubiertas(perfil: PerfilParaPublicar): string[] {
  const nombres = new Set<string>()

  if (perfil.baseCity) nombres.add(perfil.baseCity.name)
  for (const item of perfil.coverage) nombres.add(item.city.name)

  return [...nombres]
}

/**
 * Provincias que cubre además de la ciudad base.
 *
 * `coversWholeProvince` depende de la provincia de la ciudad base; si el perfil
 * no tiene ciudad base no hay provincia que cubrir entera.
 */
export function provinciasCubiertas(perfil: PerfilParaPublicar): Province[] {
  const provincias = new Set<Province>()

  if (perfil.coversWholeProvince && perfil.baseCity) {
    provincias.add(perfil.baseCity.province)
  }

  for (const provincia of perfil.coversOtherProvinces) provincias.add(provincia)

  return [...provincias]
}

/**
 * `areaServed` del JSON-LD.
 *
 * Ciudades como `City` y provincias como `AdministrativeArea`: Google usa el
 * tipo para entender si el servicio es local o regional. Un solo string suelto
 * funciona, pero no distingue una ciudad de una provincia y pierde precisión.
 */
export function areasParaJsonLd(
  perfil: PerfilParaPublicar,
): { '@type': 'City' | 'AdministrativeArea'; name: string }[] {
  const areas: { '@type': 'City' | 'AdministrativeArea'; name: string }[] = []

  for (const ciudad of ciudadesCubiertas(perfil)) {
    areas.push({ '@type': 'City', name: ciudad })
  }

  for (const provincia of provinciasCubiertas(perfil)) {
    areas.push({ '@type': 'AdministrativeArea', name: PROVINCIAS[provincia].nombre })
  }

  return areas
}

/** Descripción para metadatos: una línea, sin cortar palabras a la mitad. */
export function resumenPerfil(perfil: PerfilParaPublicar): string {
  const nombre = nombreMostrado(perfil)
  const rubro = rubroPrincipal(perfil)?.name
  const ciudad = perfil.baseCity?.name

  const crudo =
    perfil.description?.trim() ||
    perfil.shortBio?.trim() ||
    [nombre, rubro && `ofrece ${rubro}`, ciudad && `en ${ciudad}`, 'Contacto directo por WhatsApp.']
      .filter(Boolean)
      .join(' ')

  const plano = crudo.replace(/\s+/g, ' ')

  if (plano.length <= 160) return plano

  // Se corta en el último espacio antes del límite para no dejar una palabra
  // partida, que en el preview de WhatsApp se ve como un error.
  const corte = plano.lastIndexOf(' ', 160)

  return `${plano.slice(0, corte > 120 ? corte : 160).trimEnd()}…`
}

/** URL absoluta del perfil. */
export function urlPerfil(perfil: PerfilParaPublicar, urlBase: string): string {
  return `${urlBase.replace(/\/+$/, '')}/${perfil.slug}`
}

/**
 * Datos estructurados del perfil.
 *
 * `LocalBusiness` es el tipo que Google entiende para un prestador de servicios
 * con ubicación. Deliberadamente no incluye `telephone` ni `aggregateRating`.
 */
export function construirJsonLd(
  perfil: PerfilParaPublicar,
  urlBase: string,
): Record<string, unknown> {
  const nombre = nombreMostrado(perfil)
  const url = urlPerfil(perfil, urlBase)
  const areas = areasParaJsonLd(perfil)
  const rubro = rubroPrincipal(perfil)
  const descripcion = perfil.description?.trim() || perfil.shortBio?.trim()

  const datos: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url,
    name: nombre,
    url,
  }

  if (perfil.baseCity) {
    datos.address = {
      '@type': 'PostalAddress',
      addressLocality: perfil.baseCity.name,
      addressRegion: PROVINCIAS[perfil.baseCity.province].nombre,
      addressCountry: 'AR',
    }
  }

  if (areas.length > 0) datos.areaServed = areas

  const temas = [rubro?.name, ...perfil.subcategories.map((s) => s.subcategory.name)].filter(
    (valor): valor is string => Boolean(valor),
  )

  if (temas.length > 0) datos.knowsAbout = temas
  if (descripcion) datos.description = descripcion
  if (perfil.logoUrl) datos.logo = perfil.logoUrl
  if (perfil.images.length > 0) datos.image = perfil.images.map((imagen) => imagen.url)

  return datos
}

/**
 * Serializa el JSON-LD para meterlo en un `<script>`.
 *
 * Sin escapar `<`, una descripción con `</script>` cortaría el bloque y
 * permitiría inyectar HTML en el perfil. `JSON.stringify` no escapa esa
 * secuencia porque dentro de JSON es válida.
 */
export function jsonLdParaScript(datos: Record<string, unknown>): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c')
}

/**
 * Organización del sitio.
 *
 * Va en el perfil (y en la home) para que Google asocie las páginas a la
 * entidad que las publica. Sin `logo` porque no hay activo de marca definido;
 * poner una URL inexistente es peor que no ponerla.
 */
export function construirJsonLdOrganization(urlBase: string): Record<string, unknown> {
  const base = urlBase.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: NOMBRE_PAGINA,
    url: base,
  }
}

/**
 * Lista de navegación para el perfil.
 *
 * Inicio → Provincia → Rubro → Perfil. Cuando falta provincia o rubro se
 * omite ese nivel, pero nunca se inventa uno.
 */
export function construirJsonLdBreadcrumbList(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * Texto introductorio único por combinación provincia + rubro.
 *
 * Varía con el nombre del rubro, la provincia y su capital, así dos páginas
 * de resultados no comparten el mismo texto y no se ven como contenido
 * duplicado ante los buscadores.
 */
export function textoIntroRubroProvincia(
  rubro: string,
  provinciaNombre: string,
  ciudadCapital: string,
): string {
  return `Buscás ${rubro} en ${provinciaNombre}? En PoliserviciosNOA encontrás profesionales de ${rubro} en ${ciudadCapital} y el resto de ${provinciaNombre}, listos para atenderte. Contactalos directo por WhatsApp, sin comisiones ni intermediarios.`
}

/** Metadatos Open Graph y Twitter del perfil. */
export function construirMetadata(perfil: PerfilParaPublicar): Metadata {
  const nombre = nombreMostrado(perfil)
  const rubro = rubroPrincipal(perfil)?.name
  const ciudad = perfil.baseCity?.name

  const titulo = [nombre, rubro && `- ${rubro}`, ciudad && `en ${ciudad}`]
    .filter(Boolean)
    .join(' ')

  const descripcion = resumenPerfil(perfil)

  /**
   * La imagen del preview es la primera foto de la galería; el logo es el
   * respaldo. No se usa un placeholder porque, si no hay imagen, es mejor que
   * WhatsApp muestre solo el texto a que muestre un logo de relleno.
   */
  const primera = perfil.images[0]

  const imagen = primera
    ? {
        url: primera.url,
        width: primera.width,
        height: primera.height,
        alt: `Foto de ${nombre}`,
      }
    : perfil.logoUrl
      ? { url: perfil.logoUrl, alt: `Logo de ${nombre}` }
      : null

  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/${perfil.slug}` },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: NOMBRE_PAGINA,
      title: titulo,
      description: descripcion,
      url: `/${perfil.slug}`,
      ...(imagen ? { images: [imagen] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descripcion,
      ...(imagen ? { images: [imagen.url] } : {}),
    },
  }
}
