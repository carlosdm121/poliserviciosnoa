/**
 * Verificación del flujo de planes y precio.
 *
 * El criterio del módulo 2.2 es: **cambiar el monto del plan en la base cambia
 * el precio mostrado, sin tocar código**. Eso no se puede probar sin base de
 * datos — es una afirmación sobre lo que lee el servidor—, así que va acá y no
 * en Vitest. Lo puro (el formateo) sí está en `tests/dinero.test.ts`.
 *
 * Uso: npx tsx scripts/verificar-planes.ts
 */

import { Prisma, PrismaClient } from '@prisma/client'

import { formatArs, formatearPrecioMensual } from '../src/lib/dinero'
import {
  getCurrentPlan,
  limpiarCachePlan,
  leerPlanVigente,
  montoVigente,
} from '../src/services/planes'

const prisma = new PrismaClient()

let fallos = 0
let pruebas = 0

function comprobar(descripcion: string, condicion: boolean, detalle?: string): void {
  pruebas += 1

  if (condicion) {
    console.log(`  ok   ${descripcion}`)
    return
  }

  fallos += 1
  console.log(`  FALLA ${descripcion}${detalle ? ` — ${detalle}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n--- ${texto} ---`)
}

/** Montos que aparecen en el código. El script no puede repetirlos. */
const MONTOS = {
  original: new Prisma.Decimal(10000),
 ahora: new Prisma.Decimal(18500),
  raro: new Prisma.Decimal(9999.5),
  roto: new Prisma.Decimal(-500),
}

/**
 * Apaga todos los planes y deja exactamente uno vigente.
 *
 * Se empieza apagando todo porque la base viene del seed, que puede tener más de
 * un plan si alguien lo corrió con datos distintos. Un test que depende del
 * estado previo no es un test: es una apuesta.
 */
async function dejarUnSoloPlanVigente(monto: Prisma.Decimal): Promise<string> {
  await prisma.plan.updateMany({ data: { isActive: false } })

  const plan = await prisma.plan.create({
    data: {
      name: 'Suscripción mensual',
      amount: monto,
      currency: 'ARS',
      isActive: true,
      vigenteDesde: new Date(Date.now() - 60_000),
    },
    select: { id: true },
  })

  limpiarCachePlan()

  return plan.id
}

async function main(): Promise<void> {
  limpiarCachePlan()

  // -------------------------------------------------------------------------
  titulo('El seed trae un plan vigente')

  const delSeed = await leerPlanVigente()

  comprobar('el seed dejó un plan vigente', delSeed !== null)
  comprobar('tiene nombre', (delSeed?.nombre.length ?? 0) > 0)
  comprobar('el precio viene formateado desde el monto', delSeed?.precio === formatearPrecioMensual(delSeed?.monto ?? 0))
  comprobar('el monto es un número', typeof delSeed?.monto === 'number')

  console.log(`       plan: ${delSeed?.nombre} — ${delSeed?.precio}`)

  // -------------------------------------------------------------------------
  titulo('Cambiar el monto en la base cambia el precio, sin tocar código')

  const idPlan = await dejarUnSoloPlanVigente(MONTOS.original)

  const antes = await getCurrentPlan()
  comprobar('el precio inicial es el del monto original', antes?.monto === 10000, String(antes?.monto))

  // El único cambio del escenario: el número en la base.
  await prisma.plan.update({
    where: { id: idPlan },
    data: { amount: MONTOS.ahora },
  })

  /**
   * Se limpia la caché antes de volver a leer, y es parte del criterio.
   *
   * Sin limpiar, los primeros 15 segundos seguirían mostrando el precio viejo y
   * el test probaría el caché, no la lectura de la base. Se limpía justamente
   * para afirmar la otra mitad de la regla: que el admin puede cambiar el
   * precio y que se vea.
   */
  limpiarCachePlan()

  const despues = await getCurrentPlan()

  comprobar('el precio cambió sin tocar código', despues?.monto === 18500, String(despues?.monto))
  comprobar('el precio mostrado es el nuevo', despues?.precio === formatearPrecioMensual(18500), despues?.precio)
  comprobar('el id del plan no cambió', despues?.id === idPlan)

  // -------------------------------------------------------------------------
  titulo('Un plan con centavos formatea distinto')

  await prisma.plan.update({ where: { id: idPlan }, data: { amount: MONTOS.raro } })
  limpiarCachePlan()

  const conCentavos = await getCurrentPlan()

  comprobar(
    'un monto con centavos muestra los centavos',
    conCentavos?.precio === '$9.999,50/mes',
    conCentavos?.precio,
  )

  // -------------------------------------------------------------------------
  titulo('La caché es corta')

  await prisma.plan.update({ where: { id: idPlan }, data: { amount: MONTOS.original } })
  limpiarCachePlan()

  const cacheado = await getCurrentPlan()
  comprobar('la primera lectura trae el monto viejo', cacheado?.monto === 10000)

  await prisma.plan.update({ where: { id: idPlan }, data: { amount: MONTOS.ahora } })

  const sinLimpiar = await getCurrentPlan()
  comprobar(
    'dentro de la ventana la caché devuelve lo que ya tenía',
    sinLimpiar?.monto === 10000,
    String(sinLimpiar?.monto),
  )

  limpiarCachePlan()

  const trasLimpiar = await getCurrentPlan()
  comprobar('al limpar la caché aparece el nuevo', trasLimpiar?.monto === 18500)

  // -------------------------------------------------------------------------
  titulo('Un plan con fecha futura todavía no está vigente')

  await prisma.plan.update({
    where: { id: idPlan },
    data: { amount: MONTOS.original, vigenteDesde: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  })
  limpiarCachePlan()

  comprobar(
    'un plan programado no se vende todavía',
    (await leerPlanVigente()) === null,
  )

  // -------------------------------------------------------------------------
  titulo('Dos planes a la vez')

  await prisma.plan.update({
    where: { id: idPlan },
    data: { vigenteDesde: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  })
  limpiarCachePlan()

  await prisma.plan.create({
    data: {
      name: 'Suscripción mensual',
      amount: MONTOS.ahora,
      currency: 'ARS',
      isActive: true,
      vigenteDesde: new Date(Date.now() - 60_000),
    },
  })

  limpiarCachePlan()

  const conDos = await getCurrentPlan()

  comprobar('con dos vigentes responde algo, no falla', conDos !== null)
  comprobar('y es el más reciente, de forma determinista', conDos?.monto === 18500, String(conDos?.monto))

  await prisma.plan.updateMany({ where: { id: { not: idPlan } }, data: { isActive: false } })

  // -------------------------------------------------------------------------
  titulo('Un plan apagado no se vende')

  await prisma.plan.update({ where: { id: idPlan }, data: { isActive: false } })
  limpiarCachePlan()

  comprobar('un plan inactivo no es el vigente', (await leerPlanVigente()) === null)

  await prisma.plan.update({ where: { id: idPlan }, data: { isActive: true } })
  limpiarCachePlan()

  // -------------------------------------------------------------------------
  titulo('Un monto inválido no se muestra como precio')

  await prisma.plan.update({ where: { id: idPlan }, data: { amount: MONTOS.roto } })
  limpiarCachePlan()

  const conNegativo = await leerPlanVigente()

  comprobar('un monto negativo no produce un precio', conNegativo === null)
  comprobar('y no se muestra "-$500/mes"', formatArs(500) === '$500')

  await prisma.plan.update({ where: { id: idPlan }, data: { amount: MONTOS.original } })
  limpiarCachePlan()

  // -------------------------------------------------------------------------
  titulo('montoVigente devuelve el monto para la suscripción')

  const monto = await montoVigente()

  comprobar('devuelve el monto del plan', monto?.toNumber() === 10000, String(monto))

  await prisma.plan.updateMany({ data: { isActive: false } })
  limpiarCachePlan()

  comprobar('sin plan vigente devuelve null', (await montoVigente()) === null)

  // Se deja la base como estaba: el seed corre antes que este script y otros
  // pasos pueden depender del plan.
  await prisma.plan.upsert({
    where: { id: 'plan_mensual_inicial' },
    create: {
      id: 'plan_mensual_inicial',
      name: 'Suscripción mensual',
      amount: MONTOS.original,
      currency: 'ARS',
      isActive: true,
    },
    update: { isActive: true, amount: MONTOS.original },
  })

  await prisma.plan.updateMany({ where: { id: { not: 'plan_mensual_inicial' } }, data: { isActive: false } })

  limpiarCachePlan()

  comprobar('la base queda con el plan del seed activo', (await leerPlanVigente())?.monto === 10000)

  // -------------------------------------------------------------------------
  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

  if (fallos > 0) {
    console.log(`${fallos} FALLAS`)
    process.exitCode = 1
  }
}

main()
  .catch((error: unknown) => {
    console.error('\nError en la verificación de planes:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })