/**
 * Script de CI: escanea `.next/static` buscando secretos que no deberían estar
 * en el bundle del cliente.
 *
 * Uso: `npm run build && tsx scripts/check-client-bundle.ts`
 *
 * Sale con código 1 si encuentra alguno de los patrones, para que el CI falle.
 * Se ejecuta después del build porque es en `.next/` donde Next.js emite los
 * archivos estáticos del cliente.
 */

import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { join } from 'path'

/** Patrones que indican un secreto expuesto al cliente. */
const PATRONES_SECRETOS = [
  { nombre: 'MP_ACCESS_TOKEN', regex: /MP_ACCESS_TOKEN/i },
  { nombre: 'RESEND_API_KEY', regex: /RESEND_API_KEY/i },
  { nombre: 'CLOUDINARY_API_SECRET', regex: /CLOUDINARY_API_SECRET/i },
  { nombre: 'WHATSAPP_ACCESS_TOKEN', regex: /WHATSAPP_ACCESS_TOKEN/i },
  { nombre: 'WHATSAPP_APP_SECRET', regex: /WHATSAPP_APP_SECRET/i },
  { nombre: 'UPSTASH_REDIS_REST_TOKEN', regex: /UPSTASH_REDIS_REST_TOKEN/i },
  { nombre: 'PHONE_HASH_PEPPER', regex: /PHONE_HASH_PEPPER/i },
  { nombre: 'DATABASE_URL', regex: /DATABASE_URL/i },
  { nombre: 'NEXTAUTH_SECRET', regex: /NEXTAUTH_SECRET/i },
  { nombre: 'ARCA_ACCESS_TOKEN', regex: /ARCA_ACCESS_TOKEN/i },
  { nombre: 'Mercado Pago access token', regex: /APP_USR-[0-9]+-[0-9a-fA-F]+/ },
  { nombre: 'Resend API key', regex: /re_[A-Za-z0-9]{32,}/ },
  { nombre: 'Cloudinary secret', regex: /cloudinary_secret/i },
  { nombre: 'JWT / access token genérico', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
]

const RAIZ_BUILD = join(process.cwd(), '.next', 'static')

let hallazgos = 0

async function escanearDirectorio(dir: string): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const rutaCompleta = join(dir, entry.name)

    if (entry.isDirectory()) {
      await escanearDirectorio(rutaCompleta)
      continue
    }

    if (!entry.isFile()) continue

    // Solo archivos de texto: JS, CSS, JSON, HTML, map
    if (!/\.(js|mjs|cjs|css|json|html|map)$/i.test(entry.name)) continue

    let contenido: string
    try {
      contenido = await fs.readFile(rutaCompleta, 'utf8')
    } catch {
      continue
    }

    for (const patron of PATRONES_SECRETOS) {
      if (patron.regex.test(contenido)) {
        const linea = contenido
          .split('\n')
          .find((l) => patron.regex.test(l))
        console.error(
          `SECRETO ENCONTRADO en ${rutaCompleta}: "${patron.nombre}"` +
            (linea ? `\n  ${linea.trim().slice(0, 200)}` : ''),
        )
        hallazgos += 1
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(`Escaneando ${RAIZ_BUILD} en busca de secretos...`)

  await escanearDirectorio(RAIZ_BUILD)

  if (hallazgos > 0) {
    console.error(`\n${hallazgos} secreto(s) encontrado(s) en el bundle del cliente.`)
    process.exit(1)
  }

  console.log('\nSin secretos en el bundle del cliente.')
}

main().catch((error) => {
  console.error('Error ejecutando el escaneo:', error)
  process.exit(1)
})
