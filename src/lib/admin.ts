import type { UserRole } from '@prisma/client'

/**
 * Matriz de permisos del panel de administración.
 *
 * Vive en `lib/` y no en las páginas porque la misma respuesta la necesitan
 * el menú, cada página y cada server action. Si la regla estuviera escrita
 * tres veces, el día que cambie una las otras dos siguen autorizando de más.
 *
 * `soloAdmin` es la única excepción a la regla "el admin puede todo": las
 * secciones que el moderador NO ve son justamente las que tocan dinero,
 * precios o configuración del sitio.
 */

export type SeccionAdmin =
  | 'inicio'
  | 'perfiles'
  | 'espacios'
  | 'aprobaciones'
  | 'riesgos'
  | 'empresas'
  | 'matriculas'
  | 'moderacion'
  | 'soporte'
  | 'precios'
  | 'catalogo'
  | 'finanzas'
  | 'configuracion'
  | 'auditoria'
  | 'monitoreo'
  | 'lanzamiento'

export type Seccion = {
  key: SeccionAdmin
  href: string
  label: string
  descripcion: string
  soloAdmin: boolean
}

export const SECCIONES_ADMIN: readonly Seccion[] = [
  {
    key: 'inicio',
    href: '/admin',
    label: 'Resumen',
    descripcion: 'Lo que espera una decisión hoy.',
    soloAdmin: false,
  },
  {
    key: 'perfiles',
    href: '/admin/perfiles',
    label: 'Perfiles',
    descripcion: 'Buscar, revisar y suspender perfiles.',
    soloAdmin: false,
  },
  {
    key: 'espacios',
    href: '/admin/espacios',
    label: 'Crear espacio',
    descripcion: 'Alta de un profesional que ya pagó.',
    soloAdmin: true,
  },
  {
    key: 'aprobaciones',
    href: '/admin/aprobaciones',
    label: 'Aprobaciones',
    descripcion: 'Altas esperando revisión manual.',
    soloAdmin: false,
  },
  {
    key: 'riesgos',
    href: '/admin/riesgos',
    label: 'Riesgo y bloqueos',
    descripcion: 'Señales, números observados y lista de bloqueo.',
    soloAdmin: false,
  },
  {
    key: 'empresas',
    href: '/admin/empresas',
    label: 'Empresas',
    descripcion: 'Constancias de inscripción pendientes.',
    soloAdmin: false,
  },
  {
    key: 'matriculas',
    href: '/admin/matriculas',
    label: 'Matrículas',
    descripcion: 'Matrículas informadas por revisar.',
    soloAdmin: false,
  },
  {
    key: 'precios',
    href: '/admin/precios',
    label: 'Precios',
    descripcion: 'Aumentos de precio con aviso previo.',
    soloAdmin: true,
  },
  {
    key: 'soporte',
    href: '/admin/soporte',
    label: 'Soporte',
    descripcion: 'Tickets de clientes, respuestas y SLA.',
    soloAdmin: false,
  },
  {
    key: 'moderacion',
    href: '/admin/moderacion',
    label: 'Moderación',
    descripcion: 'Reportes, reclamos, fotos y votos.',
    soloAdmin: false,
  },
  {
    key: 'catalogo',
    href: '/admin/catalogo',
    label: 'Rubros y ciudades',
    descripcion: 'Crear, ordenar y desactivar el catálogo.',
    soloAdmin: true,
  },
  {
    key: 'finanzas',
    href: '/admin/finanzas',
    label: 'Finanzas',
    descripcion: 'Cobros, neto y facturas con problemas.',
    soloAdmin: true,
  },
  {
    key: 'configuracion',
    href: '/admin/configuracion',
    label: 'Configuración',
    descripcion: 'Aprobación, gracia, rubros y dominios.',
    soloAdmin: true,
  },
  {
    key: 'auditoria',
    href: '/admin/auditoria',
    label: 'Auditoría',
    descripcion: 'Quién hizo qué y cuándo.',
    soloAdmin: true,
  },
  {
    key: 'monitoreo',
    href: '/admin/monitoreo',
    label: 'Monitoreo',
    descripcion: 'Errores de webhooks y corridas del cron.',
    soloAdmin: true,
  },
  {
    key: 'lanzamiento',
    href: '/admin/lanzamiento',
    label: 'Lanzamiento',
    descripcion: 'Cupones, socios fundadores y referidos.',
    soloAdmin: true,
  },
] as const

/** ¿El rol entra al panel? */
export function esRolDeAdmin(rol: UserRole | null | undefined): boolean {
  return rol === 'ADMIN' || rol === 'MODERADOR'
}

/** ¿El rol puede abrir esta sección? */
export function puedeVerSeccion(
  rol: UserRole | null | undefined,
  seccion: SeccionAdmin,
): boolean {
  if (!esRolDeAdmin(rol)) return false
  if (rol === 'ADMIN') return true

  const encontrada = SECCIONES_ADMIN.find((item) => item.key === seccion)

  return encontrada !== undefined && !encontrada.soloAdmin
}

/** Secciones que ve el rol, para armar el menú. */
export function seccionesVisibles(rol: UserRole | null | undefined): Seccion[] {
  return SECCIONES_ADMIN.filter((seccion) => puedeVerSeccion(rol, seccion.key))
}

/** Nombre legible del rol, para la barra superior. */
export function textoRol(rol: UserRole): string {
  switch (rol) {
    case 'ADMIN':
      return 'Administración'
    case 'MODERADOR':
      return 'Moderación'
    case 'PROFESSIONAL':
      return 'Profesional'
    case 'CLIENT':
      return 'Cliente'
    default:
      return rol
  }
}

export const POR_PAGINA = 25

/**
 * Normaliza el número de página que llega por query string.
 *
 * `Number('')` es 0 y `Number('abc')` es `NaN`; los dos casos tienen que caer
 * en la página 1 en vez de romper la consulta.
 */
export function normalizarPagina(valor: unknown): number {
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string'
        ? Number(valor)
        : Number.NaN

  if (!Number.isFinite(numero) || numero < 1) return 1

  return Math.min(Math.floor(numero), 10_000)
}

export type Pagina = {
  pagina: number
  porPagina: number
  total: number
  totalPaginas: number
  desde: number
  hasta: number
}

/** Cuenta las páginas y recorta la página pedida al rango real. */
export function calcularPagina(
  total: number,
  paginaPedida: unknown,
  porPagina = POR_PAGINA,
): Pagina {
  const totalSeguro = Math.max(0, Math.floor(total))
  const tamano = Math.max(1, Math.floor(porPagina))
  const totalPaginas = Math.max(1, Math.ceil(totalSeguro / tamano))
  const pagina = Math.min(normalizarPagina(paginaPedida), totalPaginas)

  return {
    pagina,
    porPagina: tamano,
    total: totalSeguro,
    totalPaginas,
    desde: (pagina - 1) * tamano + 1,
    hasta: Math.min(pagina * tamano, totalSeguro),
  }
}

/**
 * Normaliza la lista de dominios desechables que escribe el administrador.
 *
 * Acepta uno por línea o separados por coma, tolera el `@` del email y
 * descarta lo que no tiene forma de dominio. Devuelve la lista ordenada y sin
 * repetidos para que el valor guardado no dependa del orden en que se escribió.
 */
export function normalizarDominios(texto: string): string[] {
  const partes = texto
    .split(/[\s,;]+/)
    .map((parte) => parte.trim().toLowerCase().replace(/^@/, ''))
    .filter((parte) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(parte))

  return [...new Set(partes)].sort()
}

/** Formato de fecha corta del panel: `29/10/2026`. */
export function fechaCorta(valor: Date | null | undefined): string {
  if (!valor) return '-'

  const dia = String(valor.getUTCDate()).padStart(2, '0')
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getUTCFullYear()}`
}

/** Fecha y hora, para auditoría. */
export function fechaHora(valor: Date): string {
  const hora = String(valor.getUTCHours()).padStart(2, '0')
  const minuto = String(valor.getUTCMinutes()).padStart(2, '0')

  return `${fechaCorta(valor)} ${hora}:${minuto}`
}
