import { Province, ProfileType, TeamSize, UserRole } from '@prisma/client'

/** Etiquetas legibles de las provincias, para URLs y textos de la interfaz. */
export const PROVINCIAS = {
  [Province.TUCUMAN]: {
    nombre: 'Tucumán',
    // Slug de URL: sin tilde, minúscula, sin espacios. Se usa en
    // /tucuman/plomeria y en el sitemap.
    slug: 'tucuman',
    capital: 'San Miguel de Tucumán',
  },
  [Province.SALTA]: {
    nombre: 'Salta',
    slug: 'salta',
    capital: 'Salta',
  },
  [Province.SANTIAGO_DEL_ESTERO]: {
    nombre: 'Santiago del Estero',
    slug: 'santiago-del-estero',
    capital: 'Santiago del Estero',
  },
  [Province.CATAMARCA]: {
    nombre: 'Catamarca',
    slug: 'catamarca',
    capital: 'San Fernando del Valle de Catamarca',
  },
  [Province.JUJUY]: {
    nombre: 'Jujuy',
    slug: 'jujuy',
    capital: 'San Salvador de Jujuy',
  },
} as const satisfies Record<Province, { nombre: string; slug: string; capital: string }>

export type ProvinceSlug = (typeof PROVINCIAS)[Province]['slug']

/** Todas las provincias, en el orden en que se muestran al usuario. */
export const PROVINCIAS_LISTA = [
  Province.TUCUMAN,
  Province.SALTA,
  Province.SANTIAGO_DEL_ESTERO,
  Province.CATAMARCA,
  Province.JUJUY,
] as const satisfies readonly Province[]

/** Convierte el slug de URL al enum de Prisma. `undefined` si no existe. */
export function provinceDesdeSlug(slug: string): Province | undefined {
  return PROVINCIAS_LISTA.find((p) => PROVINCIAS[p].slug === slug.toLowerCase())
}

/**
 * Genera un slug para URLs y nombres únicos.
 *
 * Se usa `normalize('NFD')` para separar los acentos y luego se quita el
 * diacrítico con el rango de marcas combinantes. Sin esto, "Peluquería" y
 * "Peluqueria" serían dos registros distintos y dos URLs distintas.
 *
 * @param texto Texto libre del usuario.
 * @returns Slug en minúsculas, sin acentos ni caracteres especiales.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Convierte un nombre propio en el nombre legible que va en la URL pública.
 *
 * Ejemplo: "Carlos Ramírez" -> "carlos-ramirez-3821"
 *
 * Se agrega un sufijo corto porque dos profesionales pueden llamarse igual.
 * Sin el sufijo, el segundo que se registra no encuentra su perfil y el
 * primero se queda con la URL. El sufijo es aleatorio justamente para que no
 * haya que adivinarlo ni recorrer IDs en orden.
 */
export function generarSlugPerfil(nombre: string): string {
  const base = slugificar(nombre) || 'profesional'
  const sufijo = Math.random().toString(36).slice(2, 6)
  return `${base}-${sufijo}`
}

export const TIPOS_PERFIL = {
  [ProfileType.PERSON]: {
    etiqueta: 'Persona',
    descripcion: 'Trabajás vos',
  },
  [ProfileType.COMPANY]: {
    etiqueta: 'Empresa',
    descripcion: 'Tenés un equipo o local',
  },
} as const satisfies Record<ProfileType, { etiqueta: string; descripcion: string }>

/** Rango de personas que trabaja en una empresa, para mostrar en la card. */
export const EQUIPOS = {
  [TeamSize.T1_5]: '1 a 5 personas',
  [TeamSize.T6_20]: '6 a 20 personas',
  [TeamSize.T21_50]: '21 a 50 personas',
  [TeamSize.T50_PLUS]: '+50 personas',
} as const satisfies Record<TeamSize, string>

export const ROLES = {
  [UserRole.PROFESSIONAL]: 'Profesional',
  [UserRole.CLIENT]: 'Cliente',
  [UserRole.MODERADOR]: 'Moderación',
  [UserRole.ADMIN]: 'Administraci.n',
} as const satisfies Record<UserRole, string>

/**
 * Mensaje de WhatsApp predefinido que se envía al contactar.
 *
 * Va en una constante compartida porque el cliente lo necesita para armar el
 * enlace y el servidor lo necesita para registrar el contacto: si vivieran en
 * dos lugares distintos, con el tiempo divergirían y medio mundo recibiría
 * mensajes con el nombre viejo de la página.
 */
export const NOMBRE_PAGINA = 'PoliserviciosNOA'

export const MENSAJE_CONTACTO =
  'Hola, te vi en la pagina de PoliserviciosNOA y me gustaria contratar tus servicios, necesito mas informacion'

/** Construye el enlace de WhatsApp con el mensaje ya codificado. */
export function enlaceWhatsApp(numero: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(MENSAJE_CONTACTO)}`
}
