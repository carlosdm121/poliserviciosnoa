/**
 * Script de CI: verifica que no haya uso de `$queryRawUnsafe` ni
 * `$executeRawUnsafe` en el código fuente.
 *
 * Uso: `tsx scripts/check-no-unsafe-queries.ts`
 *
 * Sale con código 1 si encuentra alguno, para que el CI falle.
 */

import { promises as fs } from 'fs'

const RAIZ = 'src'
const PATRONES = ['$queryRawUnsafe', '$executeRawUnsafe']

async function main(): Promise<void> {
  const archivos = await listarArchivosTs(RAIZ)

  let hallazgos = 0

  for (const archivo of archivos) {
    const contenido = await fs.readFile(archivo, 'utf8')
    const lineas = contenido.split('\n')

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i] ?? ''
      for (const patron of PATRONES) {
        if (linea.includes(patron)) {
          console.error(
            `USO DE QUERY NO SEGURA en ${archivo}:${i + 1}: "${patron}"\n  ${linea.trim().slice(0, 200)}`,
          )
          hallazgos += 1
        }
      }
    }
  }

  if (hallazgos > 0) {
    console.error(`\n${hallazgos} uso(s) de query no segura encontrado(s).`)
    process.exit(1)
  }

  console.log('\nSin uso de queries no seguras.')
}

async function listarArchivosTs(dir: string): Promise<string[]> {
  const resultado: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const ruta = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      resultado.push(...(await listarArchivosTs(ruta)))
    } else if (entry.isFile() && (ruta.endsWith('.ts') || ruta.endsWith('.tsx'))) {
      // Ignorar archivos de tipos generados y node_modules
      if (!ruta.includes('node_modules') && !ruta.includes('.next')) {
        resultado.push(ruta)
      }
    }
  }

  return resultado
}

main().catch((error) => {
  console.error('Error ejecutando el chequeo:', error)
  process.exit(1)
})
