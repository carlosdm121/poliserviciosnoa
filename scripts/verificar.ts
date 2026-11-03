/**
 * Script de verificación: levanta un PostgreSQL efímero, aplica el schema,
 * corre el seed dos veces y comprueba que no duplique nada, después corre los
 * tests unitarios, el flujo de verificación de WhatsApp, el flujo de la
 * galería, el de planes y precio, el de suscripción con Mercado Pago, el del
 * webhook de Mercado Pago, el build y el lint.
 *
 * Sirve para verificar el proyecto entero en cualquier máquina, sin instalar
 * PostgreSQL a mano ni depender de una base de desarrollo que pueda tener datos
 * de otra cosa.
 *
 * Es el comando de confianza del proyecto. Si `npm run verificar` pasa, el
 * catálogo, la verificación de WhatsApp, la galería, el precio, la suscripción y
 * el build están bien.
 *
 * Uso: npm run verificar
 */

import { execSync } from 'node:child_process'
import { rm } from 'node:fs/promises'

import EmbeddedPostgres from 'embedded-postgres'

const PUERTO = 54329
const USUARIO = 'postgres'
const PASSWORD = 'postgres'
const BASE = 'poliservicios_test'
const DIR_DATOS = './.tmp-postgres'

async function main(): Promise<void> {
  /**
   * Si quedó un directorio de la corrida anterior, `initdb` se niega a arrancar
   * sobre algo no vacío y la verificación falla con un mensaje que no dice nada
   * del problema real. Se borra antes de empezar.
   */
  await borrarDirDatos()

  const postgres = new EmbeddedPostgres({
    databaseDir: DIR_DATOS,
    user: USUARIO,
    password: PASSWORD,
    port: PUERTO,
    persistent: false,
  })

  console.log('Levantando PostgreSQL efimero...')
  await postgres.initialise()
  await postgres.start()
  await postgres.createDatabase(BASE)
  console.log(`PostgreSQL listo en localhost:${PUERTO}/${BASE}\n`)

  process.env.DATABASE_URL = `postgresql://${USUARIO}:${PASSWORD}@localhost:${PUERTO}/${BASE}?schema=public`

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  try {
    console.log('Aplicando el schema...')
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })

    console.log('\n--- Seed ---')
    execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })
    const primera = await contar(prisma)

    console.log('\n--- Seed por segunda vez (debe ser no-op) ---')
    execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' })
    const segunda = await contar(prisma)

    // Comparar los objetos serializados detecta duplicados: si el seed no
    // fuera idempotente, los números crecerían entre corrida y corrida.
    const idempotente = JSON.stringify(primera) === JSON.stringify(segunda)
    console.log(`\nIdempotente: ${idempotente ? 'SI' : 'NO - el seed duplico datos'}`)

    console.log('\n--- Verificación de WhatsApp ---')
    let whatsappOk = true
    try {
      execSync('npx tsx scripts/verificar-whatsapp.ts', { stdio: 'inherit' })
    } catch {
      whatsappOk = false
    }

    console.log('\n--- Flujo de galería ---')
    let galeriaOk = true
    try {
      execSync('npx tsx scripts/verificar-galeria.ts', { stdio: 'inherit' })
    } catch {
      galeriaOk = false
    }

    console.log('\n--- Flujo de planes ---')
    let planesOk = true
    try {
      execSync('npx tsx scripts/verificar-planes.ts', { stdio: 'inherit' })
    } catch {
      planesOk = false
    }

    console.log('\n--- Flujo de suscripción ---')
    let suscripcionOk = true
    try {
      execSync('npx tsx scripts/verificar-suscripcion.ts', { stdio: 'inherit' })
    } catch {
      suscripcionOk = false
    }

    console.log('\n--- Webhook de Mercado Pago ---')
    let webhookOk = true
    try {
      execSync('npx tsx scripts/verificar-webhook-mp.ts', { stdio: 'inherit' })
    } catch {
      webhookOk = false
    }

    console.log('\n--- Facturación electrónica ---')
    let facturacionOk = true
    try {
      execSync('npx tsx scripts/verificar-facturacion.ts', { stdio: 'inherit' })
    } catch {
      facturacionOk = false
    }

    console.log('\n--- Baja, arrepentimiento y cron ---')
    let cancelacionesOk = true
    try {
      execSync('npx tsx scripts/verificar-cancelaciones.ts', { stdio: 'inherit' })
    } catch {
      cancelacionesOk = false
    }

    console.log('\n--- Contacto y corazones ---')
    let contactoVotosOk = true
    try {
      execSync('npx tsx scripts/verificar-contacto-votos.ts', { stdio: 'inherit' })
    } catch {
      contactoVotosOk = false
    }

    console.log('\n--- Perfil público ---')
    let perfilPublicoOk = true
    try {
      execSync('npx tsx scripts/verificar-perfil-publico.ts', { stdio: 'inherit' })
    } catch {
      perfilPublicoOk = false
    }

    console.log('\n--- Reconciliación de contadores ---')
    let reconciliacionOk = true
    try {
      execSync('npx tsx scripts/reconciliar-contadores.ts', { stdio: 'inherit' })
    } catch {
      reconciliacionOk = false
    }

    console.log('\n--- Tests unitarios ---')
    let testsOk = true
    try {
      execSync('npx vitest run', { stdio: 'inherit' })
    } catch {
      testsOk = false
    }

    console.log('\n--- Build de Next.js ---')
    let buildOk = true
    try {
      execSync('npx next build', { stdio: 'inherit' })
    } catch {
      buildOk = false
    }

    console.log('\n--- Lint ---')
    let lintOk = true
    try {
      execSync('npx next lint --dir src', { stdio: 'inherit' })
    } catch {
      lintOk = false
    }

    console.log('\n=========================')
    console.log(`Seed idempotente: ${idempotente ? 'SI' : 'NO'}`)
    console.log(`Tests:           ${testsOk ? 'OK' : 'FALLO'}`)
    console.log(`Flujo WhatsApp:  ${whatsappOk ? 'OK' : 'FALLO'}`)
    console.log(`Flujo galería:   ${galeriaOk ? 'OK' : 'FALLO'}`)
    console.log(`Flujo planes:      ${planesOk ? 'OK' : 'FALLO'}`)
    console.log(`Flujo suscripción: ${suscripcionOk ? 'OK' : 'FALLO'}`)
    console.log(`Webhook MP:        ${webhookOk ? 'OK' : 'FALLO'}`)
    console.log(`Facturación:       ${facturacionOk ? 'OK' : 'FALLO'}`)
    console.log(`Baja y cron:       ${cancelacionesOk ? 'OK' : 'FALLO'}`)
    console.log(`Contacto y votos:  ${contactoVotosOk ? 'OK' : 'FALLO'}`)
    console.log(`Perfil público:    ${perfilPublicoOk ? 'OK' : 'FALLO'}`)
    console.log(`Reconciliación:    ${reconciliacionOk ? 'OK' : 'FALLO'}`)
    console.log(`Build:           ${buildOk ? 'OK' : 'FALLO'}`)
    console.log(`Lint:            ${lintOk ? 'OK' : 'FALLO'}`)
    console.log('=========================')

    if (
      !idempotente ||
      !testsOk ||
      !whatsappOk ||
      !galeriaOk ||
      !planesOk ||
      !suscripcionOk ||
      !webhookOk ||
      !facturacionOk ||
      !cancelacionesOk ||
      !contactoVotosOk ||
      !perfilPublicoOk ||
      !reconciliacionOk ||
      !buildOk ||
      !lintOk
    ) {
      process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()

    /**
     * La limpieza no puede romper una corrida que ya pasó.
     *
     * En Windows, borrar el directorio de datos tira EBUSY si un proceso
     * soltó el archivo un instante antes. Convertir eso en exit code 1
     * convertiría "todo verde" en "falló", y el próximo que lo lea va a
     * buscar un bug que no existe.
     */
    try {
      await postgres.stop()
    } catch (error: unknown) {
      console.warn(
        '\nAviso: no se pudo limpiar el PostgreSQL efímero.',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

async function borrarDirDatos(): Promise<void> {
  // Los retries con backoff corto: en Windows el antivirus o el indexador de
  // archivos agarran el directorio un instante después de soltarlo y el primer
  // intento falla con EBUSY.
  for (let intento = 0; intento < 3; intento++) {
    try {
      await rm(DIR_DATOS, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolver) => setTimeout(resolver, 500))
    }
  }

  throw new Error(
    `No se pudo borrar ${DIR_DATOS}. Cerrá lo que lo esté usando y volvé a correr.`,
  )
}

async function contar(
  prisma: import('@prisma/client').PrismaClient,
): Promise<Record<string, number>> {
  const [grupos, rubros, subcategorias, ciudades] = await Promise.all([
    prisma.categoryGroup.count(),
    prisma.category.count(),
    prisma.subcategory.count(),
    prisma.city.count(),
  ])

  return { grupos, rubros, subcategorias, ciudades }
}

main().catch((error: unknown) => {
  console.error('\nError en la verificacion:', error)
  process.exit(1)
})