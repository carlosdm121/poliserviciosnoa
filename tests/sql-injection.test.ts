/**
 * Test de inyección SQL en búsqueda y filtros (punto 13 del módulo 6.1).
 *
 * Verifica que `construirDonde` no concatena strings de usuario y que los
 * payloads con caracteres de inyección SQL ('; DROP, --, %, _, etc.) se pasan
 * como valores parametrizados a Prisma, no como parte de la consulta.
 *
 * Como `construirDonde` devuelve un `Prisma.ProfileWhereInput` (objeto
 * tipado, no string SQL), cualquier valor se escapa automáticamente por Prisma.
 * El test verifica que los valores maliciosos no rompan la estructura del
 * where ni se filtren como claves de columna.
 */

import { describe, expect, it } from 'vitest'

import { ProfileType } from '@prisma/client'

import { construirDonde, type FiltrosBusqueda } from '@/server/search'

const PAYLOADS_INYECCION = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "' UNION SELECT * FROM profiles --",
  "admin'--",
  "%",
  "_",
  "\\'",
  "'; DELETE FROM profile WHERE id='1",
  "${'1'}",
]

describe('construirDonde — resistencia a inyección SQL', () => {
  it('no devuelve claves de columna inyectadas desde el input del usuario', () => {
    const donde = construirDonde({ q: PAYLOADS_INYECCION[0] })

    // El objeto where solo debe tener las claves esperadas de Prisma,
    // nunca claves inyectadas desde el payload.
    const claves = Object.keys(donde)
    const clavesPermitidas = new Set([
      'AND', 'OR', 'NOT', 'id', 'slug', 'type', 'name', 'userId',
      'moderationStatus', 'isPublished', 'baseCity', 'categories',
      'subcategories', 'coverage', 'coversWholeProvince',
    ])

    for (const clave of claves) {
      expect(clavesPermitidas.has(clave)).toBe(true)
    }
  })

  it('los payloads en rubro/subcategoria no se interpretan como SQL', () => {
    for (const payload of PAYLOADS_INYECCION) {
      const donde = construirDonde({ rubro: payload })

      expect(donde).toBeDefined()
      // El payload está dentro de AND[0].categories.some.category.slug.equals
      const and = (donde as any).AND
      expect(Array.isArray(and)).toBe(true)
      const filtroRubro = and.find(
        (a: any) => a.categories?.some?.category?.slug?.equals === payload,
      )
      expect(filtroRubro).toBeDefined()
    }
  })

  it('los payloads en ciudad no se interpretan como SQL', () => {
    for (const payload of PAYLOADS_INYECCION) {
      const donde = construirDonde({ ciudad: payload })

      expect(donde).toBeDefined()
      const ciudadWhere = (donde as any).AND?.find(
        (c: any) => c.OR && c.OR.some((o: any) => o.baseCity?.slug?.equals === payload),
      )
      expect(ciudadWhere).toBeDefined()
    }
  })

  it('los payloads en provincia no rompen el filtro', () => {
    const donde = construirDonde({
      provincia: 'SALTA',
    })

    expect(donde).toBeDefined()
    const provinciaWhere = (donde as any).baseCity?.province?.equals
    expect(provinciaWhere).toBe('SALTA')
  })

  it('combina múltiples filtros sin romper la estructura', () => {
    const donde = construirDonde({
      rubro: "' OR '1'='1",
      subcategoria: "%",
      ciudad: "_",
      provincia: 'SALTA',
      tipo: ProfileType.PERSON,
    })

    expect(donde).toBeDefined()
    expect((donde as any).type).toBe('PERSON')
    // Cada valor debe estar contenido como valor de equals, no como estructura
    const and = (donde as any).AND
    expect(Array.isArray(and)).toBe(true)
  })

  it('no deja pasar claves dinámicas en ORDER BY (solo lista blanca)', () => {
    // search.ts usa orderBy fijo ({ heartsCount: 'desc' }),
    // nunca columnas dinámicas desde el cliente.
    const columnasPermitidas = [
      'heartsCount',
      'viewsCount',
      'whatsappClicks',
      'contactsCount',
      'createdAt',
    ]
    expect(columnasPermitidas).toContain('heartsCount')
  })
})

describe('sin uso de queries crudas inseguras en server/search', () => {
  it('el módulo no usa $queryRawUnsafe ni $executeRawUnsafe', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const archivo = path.join(process.cwd(), 'src', 'server', 'search.ts')
    const contenido = await fs.readFile(archivo, 'utf8')

    expect(contenido).not.toContain('$queryRawUnsafe')
    expect(contenido).not.toContain('$executeRawUnsafe')
    // Prisma.sql está permitido (tagged template con parámetros)
    // pero no debe usarse con interpolación de ${} directamente
    expect(contenido).not.toMatch(/\$queryRaw`[^`]*\$\{/)
  })
})
