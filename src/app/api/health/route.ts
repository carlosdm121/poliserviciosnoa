import { NextResponse } from 'next/server'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { saludMercadoPago } from '@/lib/mp/health'

/**
 * Endpoint de salud del sitio.
 *
 * Responde si la base de datos y los servicios externos clave están
 * operativos. Nunca expone stack traces, mensajes de error de proveedores ni
 * detalles internos: solo `ok` o `error` por servicio, y un estado global.
 *
 * Se usa para uptime monitoring externo y para que el panel de administración
 * sepa si algo está caído sin tener que entrar a cada servicio.
 */

async function saludBaseDeDatos(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`
    return 'ok'
  } catch {
    return 'error'
  }
}

async function saludUpstash(): Promise<'ok' | 'error'> {
  if (!env.upstash.redisUrl || !env.upstash.redisToken) return 'ok'

  try {
    const respuesta = await fetch(`${env.upstash.redisUrl}/ping`, {
      headers: { Authorization: `Bearer ${env.upstash.redisToken}` },
    })

    return respuesta.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(): Promise<Response> {
  const [db, mp, upstash] = await Promise.all([
    saludBaseDeDatos(),
    saludMercadoPago(),
    saludUpstash(),
  ])

  const servicios = {
    database: db,
    mercadopago: mp,
    upstash: upstash,
  }

  const estadoGlobal =
    db === 'error' ? 'degradado' : Object.values(servicios).includes('error')
      ? 'degradado'
      : 'ok'

  logger.info('health: consulta', {
    estado: estadoGlobal,
    servicios,
  })

  return NextResponse.json(
    { status: estadoGlobal, servicios },
    {
      status: estadoGlobal === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
