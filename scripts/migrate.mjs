/**
 * Corre `prisma migrate` contra el session pooler de Supabase (5432).
 *
 * shortcut: la app en runtime usa el transaction pooler (6543), que se cuelga
 * con migrate porque no soporta advisory locks. Si Supabase deja de ofrecer
 * session mode, reemplazar esto por `directUrl` en el schema + DIRECT_URL.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** En local DATABASE_URL vive en .env; en Vercel viene del ambiente. */
function urlDeBase() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    return /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)?.[1]
  } catch {
    return undefined
  }
}

const url = urlDeBase()
if (!url) {
  console.error('DATABASE_URL no está definida')
  process.exit(1)
}

const urlMigrate = url.replace(':6543', ':5432')
const subcomando = process.argv[2] ?? 'deploy'

const resultado = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', subcomando, ...process.argv.slice(3)],
  { env: { ...process.env, DATABASE_URL: urlMigrate }, stdio: 'inherit' },
)

process.exit(resultado.status ?? 1)
