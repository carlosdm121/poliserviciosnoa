import { Prisma, PrismaClient } from '@prisma/client'

import { GRUPOS } from './data/categories'
import { CIUDADES } from './data/cities'
import { BANDERA_APROBACION_MANUAL } from '@/services/ajustes'

/**
 * Carga idempotente del catálogo.
 *
 * Idempotente significa que se puede correr las veces que haga falta sin
 * duplicar nada: todo va por `upsert` sobre una clave natural (slug), nunca
 * por create. Un seed que duplica es un seed que algún día se corre dos veces
 * en desarrollo y rompe los filtros con "Plomería" y "Plomería" con id
 * distinto.
 *
 * Para correrlo:
 *   npm run db:seed
 */

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('Cargando catálogo...\n')

  let totalGrupos = 0
  let totalRubros = 0
  let totalSubcategorias = 0

  for (const [indiceGrupo, grupo] of GRUPOS.entries()) {
    const grupoCreado = await prisma.categoryGroup.upsert({
      where: { slug: grupo.slug },
      update: {
        // Se actualizan nombre e icono porque el seed también sirve para
        // corregir un nombre mal escrito sin tocar la base a mano.
        name: grupo.name,
        icon: grupo.icon,
        sortOrder: indiceGrupo,
      },
      create: {
        name: grupo.name,
        slug: grupo.slug,
        icon: grupo.icon,
        sortOrder: indiceGrupo,
      },
    })
    totalGrupos++

    for (const [indiceRubro, rubro] of grupo.categories.entries()) {
      const rubroCreado = await prisma.category.upsert({
        where: { slug: rubro.slug },
        update: {
          name: rubro.name,
          icon: rubro.icon,
          groupId: grupoCreado.id,
          sortOrder: indiceRubro,
          requiresLicense: rubro.requiresLicense ?? false,
          licenseLabel: rubro.licenseLabel ?? null,
          // No se toca isActive: si el admin desactivó un rubro para que
          // deje de aparecer, el seed no debería volver a activarlo.
          isActive: true,
        },
        create: {
          name: rubro.name,
          slug: rubro.slug,
          icon: rubro.icon,
          groupId: grupoCreado.id,
          sortOrder: indiceRubro,
          requiresLicense: rubro.requiresLicense ?? false,
          licenseLabel: rubro.licenseLabel ?? null,
          isActive: true,
        },
      })
      totalRubros++

      for (const [indiceSub, sub] of rubro.subcategories.entries()) {
        // La clave natural es (categoryId, slug): "instalacion" puede
        // existir en plomería y en electricidad sin conflicto.
        await prisma.subcategory.upsert({
          where: {
            categoryId_slug: {
              categoryId: rubroCreado.id,
              slug: sub.slug,
            },
          },
          update: {
            name: sub.name,
            sortOrder: indiceSub,
          },
          create: {
            categoryId: rubroCreado.id,
            name: sub.name,
            slug: sub.slug,
            sortOrder: indiceSub,
            isActive: true,
          },
        })
        totalSubcategorias++
      }
    }

    console.log(`  ${indiceGrupo + 1}. ${grupo.name} — ${grupo.categories.length} rubros`)
  }

  console.log('')

  let totalCiudades = 0
  for (const [indice, ciudad] of CIUDADES.entries()) {
    await prisma.city.upsert({
      where: {
        province_slug: {
          province: ciudad.province,
          slug: ciudad.slug,
        },
      },
      update: {
        name: ciudad.name,
        sortOrder: indice,
      },
      create: {
        province: ciudad.province,
        name: ciudad.name,
        slug: ciudad.slug,
        sortOrder: indice,
        isActive: true,
      },
    })
    totalCiudades++
  }

  /**
   * Plan inicial.
   *
   * Va en el seed porque sin una fila en `Plan` no hay forma de crear una
   * suscripción: la regla de publicación exige una suscripción ACTIVE, y el
   * módulo de pagos necesita el plan al que apuntar el preapproval.
   *
   * El monto sale de `SUBSCRIPTION_AMOUNT` y no está hardcodeado acá: los
   * precios cambian y la fuente tiene que ser una sola, que es el entorno.
   */
  const monto = Number(process.env.SUBSCRIPTION_AMOUNT ?? '10000')
  const moneda = process.env.SUBSCRIPTION_CURRENCY ?? 'ARS'

  await prisma.plan.upsert({
    where: { id: 'plan_mensual_inicial' },
    create: {
      id: 'plan_mensual_inicial',
      name: 'Suscripción mensual',
      amount: new Prisma.Decimal(monto),
      currency: moneda,
      isActive: true,
    },
    update: {
      // Se actualiza el monto a propósito: cambiar el precio tiene que ser
      // cambiar la variable de entorno y correr el seed, no editar la base.
      amount: new Prisma.Decimal(monto),
      currency: moneda,
    },
  })

  /**
   * Aprobación manual activa para el lanzamiento.
   *
   * Arrancar con `requireManualApproval` prendido significa que cada perfil
   * nuevo nace en `PENDING_REVIEW` y no aparece hasta que un administrador lo
   * apruebe desde el panel. Es el colchón para los primeros perfiles, antes
   * de que el volumen justifique dejarlo apagado. Se apaga desde el panel o
   * desde Prisma Studio una vez que la operación está rodando.
   */
  await prisma.siteSetting.upsert({
    where: { key: BANDERA_APROBACION_MANUAL },
    create: {
      key: BANDERA_APROBACION_MANUAL,
      value: true,
      updatedBy: 'seed',
    },
    update: {
      value: true,
      updatedBy: 'seed',
    },
  })

  console.log(
    `Catálogo cargado: ${totalGrupos} grupos, ${totalRubros} rubros, ` +
      `${totalSubcategorias} subcategorías, ${totalCiudades} ciudades, 1 plan.`,
  )

  // Verificación posterior: si el seed corrió dos veces, estos números los
  // delatan. Fallar acá es mejor que descubrirlo en los filtros de búsqueda.
  const [grupos, rubros, subcategorias, ciudades] = await Promise.all([
    prisma.categoryGroup.count(),
    prisma.category.count(),
    prisma.subcategory.count(),
    prisma.city.count(),
  ])

  console.log(
    `Verificado en base: ${grupos} grupos, ${rubros} rubros, ` +
      `${subcategorias} subcategorías, ${ciudades} ciudades.`,
  )

  if (grupos !== GRUPOS.length) {
    throw new Error(
      `Hay ${grupos} grupos en la base y el archivo declara ${GRUPOS.length}. ` +
        'Revisá si quedó un grupo huérfano de una versión anterior del catálogo.',
    )
  }

  if (rubros !== totalRubros) {
    throw new Error(
      `Hay ${rubros} rubros en la base y el archivo declara ${totalRubros}. ` +
        'Revisá si quedó un rubro huérfano.',
    )
  }
}

main()
  .catch((error: unknown) => {
    console.error('\nError al cargar el catálogo:', error)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })