import { execSync } from 'node:child_process'
import { rm } from 'node:fs/promises'

import EmbeddedPostgres from 'embedded-postgres'

const PUERTO = 54331
const DIR_DATOS = './.tmp-postgres-32'

async function main(): Promise<void> {
  await rm(DIR_DATOS, { recursive: true, force: true })

  const postgres = new EmbeddedPostgres({
    databaseDir: DIR_DATOS,
    user: 'postgres',
    password: 'postgres',
    port: PUERTO,
    persistent: false,
  })

  try {
    await postgres.initialise()
    await postgres.start()
    await postgres.createDatabase('poliservicios_test')
    process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${PUERTO}/poliservicios_test?schema=public`
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
    execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })
    execSync('npx next build', { stdio: 'inherit' })
  } finally {
    await postgres.stop()
    await rm(DIR_DATOS, { recursive: true, force: true })
  }
}

void main()
