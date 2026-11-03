/**
 * Script de CI: recorre todas las rutas (route handlers) y Server Actions
 * y FALLA si alguna no tiene un guard de autenticación declarado o una marca
 * explícita de "pública" (punto 6 del módulo 6.1).
 *
 * Uso: tsx scripts/check-routes-auth.ts
 *
 * Sale con código 1 si encuentra una ruta/acción sin guard.
 */

import { promises as fs } from 'fs'
import { join } from 'path'

const RAIZ_SRC = join(process.cwd(), 'src')

// Marcas que indican que una acción/route es pública (no necesita autenticación).
const MARCAS_PUBLICA = [
  '// @public',
  '/* @public */',
  'export const public = true',
  'marca-publica',
]

// Imports que indican guard de autenticación.
const GUARDS = [
  'requireUser',
  'requireRole',
  'obtenerRolActual',
  'obtenerUsuarioActual',
]

let hallazgos = 0

async function recorrer(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const ruta = join(dir, entry.name)

    if (entry.isDirectory()) {
      await recorrer(ruta)
      continue
    }

    if (!entry.isFile()) continue
    if (!ruta.endsWith('.ts') && !ruta.endsWith('.tsx')) continue

    const contenido = await fs.readFile(ruta, 'utf8')

    // Solo inspeccionar route handlers y server actions.
    const esRouteHandler = ruta.includes('/api/') && ruta.endsWith('route.ts')
    const esServerAction = ruta.includes('/actions/') && ruta.endsWith('.ts')

    if (!esRouteHandler && !esServerAction) continue

    // Verificar si tiene una marca explícita de pública.
    const esPublica = MARCAS_PUBLICA.some((m) => contenido.includes(m))

    if (esPublica) continue

    // Verificar si tiene algún guard de autenticación.
    const tieneGuard = GUARDS.some((g) => contenido.includes(g))

    if (!tieneGuard) {
      console.error(
        `SIN GUARD DE AUTENTICACIÓN en ${ruta}: ` +
          'falta requireUser/requireRole o marca explícita de pública.',
      )
      hallazgos += 1
    }
  }
}

async function main(): Promise<void> {
  console.log('Verificando guards de autenticación en rutas y acciones...')

  await recorrer(RAIZ_SRC)

  if (hallazgos > 0) {
    console.error(`\n${hallazgos} ruta(s) o acción(es) sin guard de autenticación.`)
    process.exit(1)
  }

  console.log('\nTodas las rutas y acciones tienen guard de autenticación o marca pública.')
}

main().catch((error) => {
  console.error('Error ejecutando el chequeo:', error)
  process.exit(1)
})
