/**
 * Reconciliación de contadores de confianza.
 *
 * `heartsCount` y `contactsCount` están desnormalizados para ordenar y pintar
 * rápido. La fuente de verdad son `ProfileVote` y `ContactIntent`. Este script
 * compara y, con `--fix`, corrige.
 *
 * Uso:
 *   npx tsx scripts/reconciliar-contadores.ts
 *   npx tsx scripts/reconciliar-contadores.ts --fix
 *
 * Sin `--fix` no escribe nada y sale con código 1 si encontró diferencias:
 * así sirve como chequeo en la verificación y como herramienta de diagnóstico.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const corregir = process.argv.includes('--fix')

type Diferencia = {
  profileId: string
  slug: string
  campo: 'heartsCount' | 'contactsCount'
  guardado: number
  real: number
}

async function main(): Promise<void> {
  const [perfiles, votos, contactos] = await Promise.all([
    prisma.profile.findMany({
      select: { id: true, slug: true, heartsCount: true, contactsCount: true },
      orderBy: { slug: 'asc' },
    }),
    prisma.profileVote.groupBy({ by: ['profileId'], _count: { _all: true } }),
    prisma.contactIntent.groupBy({ by: ['profileId'], _count: { _all: true } }),
  ])

  const votosPorPerfil = new Map(votos.map((fila) => [fila.profileId, fila._count._all]))
  const contactosPorPerfil = new Map(
    contactos.map((fila) => [fila.profileId, fila._count._all]),
  )

  const diferencias: Diferencia[] = []

  for (const perfil of perfiles) {
    const corazonesReales = votosPorPerfil.get(perfil.id) ?? 0
    const contactosReales = contactosPorPerfil.get(perfil.id) ?? 0

    if (perfil.heartsCount !== corazonesReales) {
      diferencias.push({
        profileId: perfil.id,
        slug: perfil.slug,
        campo: 'heartsCount',
        guardado: perfil.heartsCount,
        real: corazonesReales,
      })
    }

    if (perfil.contactsCount !== contactosReales) {
      diferencias.push({
        profileId: perfil.id,
        slug: perfil.slug,
        campo: 'contactsCount',
        guardado: perfil.contactsCount,
        real: contactosReales,
      })
    }
  }

  console.log(`Perfiles revisados: ${perfiles.length}`)
  console.log(`Votos registrados: ${votos.reduce((total, fila) => total + fila._count._all, 0)}`)
  console.log(
    `Contactos registrados: ${contactos.reduce((total, fila) => total + fila._count._all, 0)}`,
  )

  if (diferencias.length === 0) {
    console.log('Contadores: OK, coinciden con las tablas de origen.')
    return
  }

  console.log(`\nDiferencias: ${diferencias.length}`)

  for (const diferencia of diferencias) {
    console.log(
      `  ${diferencia.slug} · ${diferencia.campo}: guardado ${diferencia.guardado}, real ${diferencia.real}`,
    )
  }

  if (!corregir) {
    console.log('\nModo reporte: no se escribió nada. Corré con --fix para corregir.')
    process.exitCode = 1
    return
  }

  await prisma.$transaction(
    diferencias.map((diferencia) =>
      prisma.profile.update({
        where: { id: diferencia.profileId },
        data: {
          ...(diferencia.campo === 'heartsCount'
            ? { heartsCount: diferencia.real }
            : { contactsCount: diferencia.real }),
        },
      }),
    ),
  )

  console.log(`\nCorregidos: ${diferencias.length}`)
}

main()
  .catch((error: unknown) => {
    console.error('Error en la reconciliación:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
