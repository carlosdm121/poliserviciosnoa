/**
 * Crea los 20 códigos personales de la promoción de lanzamiento.
 *
 * Cada código es de un solo uso, vale 2 meses gratis y vence a los 90 días.
 * Los códigos son aleatorios para que no se puedan adivinar y se entregan de a
 * uno: el sistema impide que el mismo perfil, WhatsApp o CUIT use dos.
 *
 * Es idempotente: si ya existen códigos con el prefijo `PROMO-`, los muestra y
 * no crea otros. Para una tanda nueva, cambiar el prefijo.
 *
 * Uso: npx tsx scripts/crear-cupones-promo.ts
 */

import { randomInt } from 'node:crypto'

import { TipoCupon } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
import { crearCupon } from '../src/services/cupones'

const CANTIDAD = 20
const PREFIJO = 'PROMO-'
const MESES = 2
const DIAS_DE_VIGENCIA = 90

/** Sin 0, O, 1 ni I: se confunden al leerlos por WhatsApp. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function codigoAleatorio(): string {
  let sufijo = ''

  for (let i = 0; i < 6; i += 1) {
    sufijo += ALFABETO[randomInt(0, ALFABETO.length)]
  }

  return `${PREFIJO}${sufijo}`
}

async function main(): Promise<void> {
  const existentes = await prisma.cupon.findMany({
    where: { codigo: { startsWith: PREFIJO } },
    select: { codigo: true, usosActuales: true },
    orderBy: { codigo: 'asc' },
  })

  if (existentes.length > 0) {
    console.log(`Ya existen ${existentes.length} códigos con el prefijo ${PREFIJO}:`)
    for (const cupon of existentes) {
      console.log(`  ${cupon.codigo}  (usos: ${cupon.usosActuales})`)
    }
    console.log('\nNo se creó ninguno nuevo.')
    return
  }

  const ahora = new Date()
  const hasta = new Date(ahora.getTime() + DIAS_DE_VIGENCIA * 24 * 60 * 60 * 1000)
  const generados: string[] = []

  while (generados.length < CANTIDAD) {
    const codigo = codigoAleatorio()

    if (generados.includes(codigo)) continue

    const creado = await crearCupon({
      codigo,
      tipo: TipoCupon.MES_GRATIS,
      valor: MESES,
      cupoMaximoUsos: 1,
      vigenteDesde: ahora,
      vigenteHasta: hasta,
      rubrosHabilitados: null,
      provinciasHabilitados: null,
      activo: true,
    })

    if (!creado.ok) {
      throw new Error(`No se pudo crear ${codigo}: ${creado.error}`)
    }

    generados.push(codigo)
  }

  console.log(`Creados ${generados.length} códigos de ${MESES} meses gratis:`)
  console.log(`Vigencia: hasta ${hasta.toISOString().slice(0, 10)}\n`)

  for (const codigo of generados) {
    console.log(`  ${codigo}`)
  }

  console.log('\nEntregá un código por persona. Cada uno sirve una sola vez.')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
