import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  SECCIONES_ADMIN,
  calcularPagina,
  esRolDeAdmin,
  normalizarDominios,
  normalizarPagina,
  puedeVerSeccion,
  seccionesVisibles,
} from '@/lib/admin'

const ACCIONES = readFileSync(new URL('../src/app/actions/admin.ts', import.meta.url), 'utf8')

function cuerpoDe(nombre: string): string {
  const inicio = ACCIONES.indexOf(`export async function ${nombre}`)
  const siguiente = ACCIONES.indexOf('\nexport async function', inicio + 1)

  return ACCIONES.slice(inicio, siguiente === -1 ? undefined : siguiente)
}

describe('permisos del panel', () => {
  it('solo ADMIN y MODERADOR entran al panel', () => {
    expect(esRolDeAdmin('ADMIN')).toBe(true)
    expect(esRolDeAdmin('MODERADOR')).toBe(true)
    expect(esRolDeAdmin('PROFESSIONAL')).toBe(false)
    expect(esRolDeAdmin('CLIENT')).toBe(false)
    expect(esRolDeAdmin(null)).toBe(false)
    expect(esRolDeAdmin(undefined)).toBe(false)
  })

  it('el admin ve todas las secciones', () => {
    expect(seccionesVisibles('ADMIN')).toHaveLength(SECCIONES_ADMIN.length)
  })

  it('el moderador no ve dinero, catálogo, configuración ni auditoría', () => {
    const prohibidas = ['catalogo', 'finanzas', 'configuracion', 'auditoria'] as const

    for (const seccion of prohibidas) {
      expect(puedeVerSeccion('MODERADOR', seccion)).toBe(false)
    }
  })

  it('el moderador ve perfiles, moderación y bandejas de soporte', () => {
    const permitidas = [
      'inicio',
      'perfiles',
      'aprobaciones',
      'riesgos',
      'empresas',
      'matriculas',
      'moderacion',
    ] as const

    for (const seccion of permitidas) {
      expect(puedeVerSeccion('MODERADOR', seccion)).toBe(true)
    }
  })

  it('los roles que no son de panel no ven nada', () => {
    for (const seccion of SECCIONES_ADMIN) {
      expect(puedeVerSeccion('PROFESSIONAL', seccion.key)).toBe(false)
      expect(puedeVerSeccion('CLIENT', seccion.key)).toBe(false)
    }
  })

  it('cada sección tiene una ruta bajo /admin', () => {
    for (const seccion of SECCIONES_ADMIN) {
      expect(seccion.href.startsWith('/admin')).toBe(true)
    }
  })
})

describe('paginación del panel', () => {
  it('normaliza valores raros a la página 1', () => {
    expect(normalizarPagina(undefined)).toBe(1)
    expect(normalizarPagina('')).toBe(1)
    expect(normalizarPagina('abc')).toBe(1)
    expect(normalizarPagina('-4')).toBe(1)
    expect(normalizarPagina('2.9')).toBe(2)
  })

  it('calcula los extremos de la página', () => {
    const pagina = calcularPagina(60, 2, 25)

    expect(pagina).toMatchObject({
      pagina: 2,
      totalPaginas: 3,
      total: 60,
      desde: 26,
      hasta: 50,
    })
  })

  it('recorta la página pedida al total real', () => {
    expect(calcularPagina(10, 99, 25).pagina).toBe(1)
  })

  it('con cero resultados devuelve una página vacía coherente', () => {
    const pagina = calcularPagina(0, 3, 25)

    expect(pagina.totalPaginas).toBe(1)
    expect(pagina.desde).toBe(1)
    expect(pagina.hasta).toBe(0)
  })
})

describe('normalización de dominios desechables', () => {
  it('acepta saltos de línea, comas y el arroba', () => {
    expect(normalizarDominios('@Mailinator.com\ntempmail.com, yopmail.com')).toEqual([
      'mailinator.com',
      'tempmail.com',
      'yopmail.com',
    ])
  })

  it('descarta lo que no tiene forma de dominio', () => {
    expect(normalizarDominios('no-es-un-dominio\nbien.com')).toEqual(['bien.com'])
  })

  it('ordena y quita repetidos', () => {
    expect(normalizarDominios('b.com\na.com\nb.com')).toEqual(['a.com', 'b.com'])
  })
})

describe('acciones del panel', () => {
  it('el módulo está marcado como server actions', () => {
    expect(ACCIONES.startsWith("'use server'")).toBe(true)
  })

  it('todas las acciones autorizan en el servidor antes de escribir', () => {
    const nombres = [...ACCIONES.matchAll(/export async function (\w+)/g)]
      .map((m) => m[1])
      .filter((nombre): nombre is string => Boolean(nombre))

    expect(nombres.length).toBeGreaterThan(10)

    for (const nombre of nombres) {
      const cuerpo = cuerpoDe(nombre)

      expect(
        cuerpo.includes('exigirAdmin(') ||
          cuerpo.includes('exigirSuperAdmin(') ||
          cuerpo.includes('adminResolverRiesgo('),
        `${nombre} no revalida el rol`,
      ).toBe(true)
    }
  })

  it('las acciones de dinero y configuración exigen ADMIN', () => {
    for (const nombre of [
      'adminGuardarConfiguracion',
      'adminCrearRubro',
      'adminEditarRubro',
      'adminCrearCiudad',
      'adminEditarCiudad',
      'adminReasignarLocalidad',
      'adminReintentarFactura',
    ]) {
      expect(cuerpoDe(nombre)).toContain('exigirSuperAdmin(')
    }
  })
})


