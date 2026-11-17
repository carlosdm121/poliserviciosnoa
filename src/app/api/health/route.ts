import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { ipHasheada } from '@/lib/peticion'
import { pingRedis, rateLimit } from '@/lib/ratelimit'
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
  return (await pingRedis()) ? 'ok' : 'error'
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Consultas por minuto y por IP. El monitoreo normal hace una; el margen es
 * para varios chequeos en paralelo, no para un bucle.
 */
const CONSULTAS_POR_MINUTO = 60

/**
 * Cuánto vale un resultado ya calculado.
 *
 * Cada GET abre la base, llama a Mercado Pago y pinguea Redis. Sin caché, un
 * bucle anónimo multiplica esas tres llamadas por request y agota la cuota de
 * los proveedores. El caché vive en memoria de la instancia: acota el daño
 * aunque el atacante rote IPs, y el rate limit acota el resto.
 */
const CACHE_MS = 30_000

type Servicios = Record<'database' | 'mercadopago' | 'upstash', 'ok' | 'error'>

let ultimo: { at: number; servicios: Servicios } | null = null

function responder(servicios: Servicios): Response {
  const estadoGlobal = Object.values(servicios).includes('error') ? 'degradado' : 'ok'

  return NextResponse.json(
    { status: estadoGlobal, servicios },
    {
      status: estadoGlobal === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}

export async function GET(): Promise<Response> {
  const limite = await rateLimit(
    `health:ip:${await ipHasheada()}`,
    CONSULTAS_POR_MINUTO,
    60,
  )

  if (limite.limitado) {
    return new NextResponse(null, {
      status: 429,
      headers: {
        'Retry-After': String(limite.restante),
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  if (ultimo && Date.now() - ultimo.at < CACHE_MS) {
    return responder(ultimo.servicios)
  }

  const [db, mp, upstash] = await Promise.all([
    saludBaseDeDatos(),
    saludMercadoPago(),
    saludUpstash(),
  ])

  const servicios: Servicios = {
    database: db,
    mercadopago: mp,
    upstash: upstash,
  }

  ultimo = { at: Date.now(), servicios }

  logger.info('health: consulta', {
    estado: Object.values(servicios).includes('error') ? 'degradado' : 'ok',
    servicios,
  })

  return responder(servicios)
}
