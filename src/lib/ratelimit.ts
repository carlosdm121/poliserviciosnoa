import { Redis } from '@upstash/redis'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Rate limiting con Upstash Redis y fallback en memoria.
 *
 * Por qué Redis y no solo en memoria: en Vercel cada request puede caer en una
 * instancia distinta y el contador en memoria no se comparte. Un límite que se
 * reinicia con cada invocación serverless no limita nada, y el profesional que
 * reimprime el código 200 veces se lleva la verificación.
 *
 * Por qué fallback en memoria: el desarrollo local no debería obligar a levantar
 * Redis. El fallback es deliberadamente peor (contador local a la instancia) y
 * avisa por log una sola vez, para que nadie lo confunda con producción.
 *
 * Sin `import 'server-only'` a propósito: lo importan Server Actions y esa
 * directiva rompe el build ahí (ver `decisions.md` D9). `@upstash/redis` solo
 * se instancia desde el servidor igual, porque el módulo se alcanza únicamente
 * a través de actions, rutas y jobs.
 */

/** Ventana y contadores en memoria, solo para desarrollo. */
const memoria = new Map<string, { conteo: number; expiraEn: number }>()

/** Clientes de Upstash por proyecto; se crean una sola vez por URL. */
const clientes = new Map<string, Redis>()

function clienteRedis(url: string, token: string): Redis | null {
  const clave = `${url}|${token}`
  const existente = clientes.get(clave)

  if (existente) return existente

  const nuevo = new Redis({ url, token })
  clientes.set(clave, nuevo)

  return nuevo
}

/** Ya se avisó de que estamos en modo degradado, para no spamear el log. */
let avisadoFallback = false

/**
 * Momento en que se vuelve a intentar Redis tras un fallo.
 *
 * Sin esto, cada llamada al rate limiter en desarrollo reintenta contra una
 * URL de ejemplo, espera el timeout de red y recién después cae a memoria. El
 * límite funciona pero la verificación tarda varios segundos de más.
 */
let reintentarRedisEn = 0

/** True si hay Redis configurado y utilizable. */
export function hayRedis(): boolean {
  return Boolean(env.upstash.redisUrl && env.upstash.redisToken)
}

export type ResultadoLimite = {
  /** ¿Se superó el límite? */
  limitado: boolean
  /** Cuántos intentos van, incluido el actual. */
  conteo: number
  /** Segundos que faltan para que se libere la ventana. */
  restante: number
}

/**
 * Contabiliza un intento y dice si se pasó del límite.
 *
 * @param clave Namespace de la regla. Tiene que incluir lo que la identifica:
 *   `verificar-codigo:perfil:{id}` o `verificar-codigo:ip:{hash}`.
 * @param limite Máximo de intentos en la ventana.
 * @param ventanaSegundos Tamaño de la ventana.
 */
export async function rateLimit(
  clave: string,
  limite: number,
  ventanaSegundos: number,
): Promise<ResultadoLimite> {
  if (hayRedis() && Date.now() >= reintentarRedisEn) {
    return limitarConRedis(clave, limite, ventanaSegundos)
  }

  return limitarEnMemoria(clave, limite, ventanaSegundos)
}

async function limitarConRedis(
  clave: string,
  limite: number,
  ventanaSegundos: number,
): Promise<ResultadoLimite> {
  const redis = clienteRedis(env.upstash.redisUrl, env.upstash.redisToken)

  if (!redis) return limitarEnMemoria(clave, limite, ventanaSegundos)

  try {
    // Una transacción porque el contador y la expiración tienen que escribirse
    // juntos: si el contador queda sin TTL, la clave no expira nunca y ese
    // perfil queda bloqueado para siempre.
    const resultado = await redis
      .multi()
      .incr(clave)
      .expire(clave, ventanaSegundos)
      .ttl(clave)
      .exec<[number, number, number]>()

    const conteo = Number(resultado[0] ?? 0)
    const restante = Math.max(Number(resultado[2] ?? ventanaSegundos), 0)

    return { limitado: conteo > limite, conteo, restante }
  } catch (error) {
    // Si Redis está caído, se degrada a memoria en lugar de rechazar la
    // operación. Cortar la verificación porque el rate limiter no responde
    // deja al profesional sin poder publicar, que es peor que un límite blando.
    if (!avisadoFallback) {
      avisadoFallback = true
      logger.warn('rate limit: Redis no responde, se usa contador en memoria', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    reintentarRedisEn = Date.now() + 60_000

    return limitarEnMemoria(clave, limite, ventanaSegundos)
  }
}

function limitarEnMemoria(clave: string, limite: number, ventanaSegundos: number): ResultadoLimite {
  const ahora = Date.now()
  const previo = memoria.get(clave)

  // Ventana corrida: se reinicia cuando expira la del intento anterior. Es
  // más permisivo que la ventana fija, que es lo que hace Redis con INCR+EXPIRE,
  // así que el fallback nunca es más estricto que el modo real.
  const registro =
    previo && previo.expiraEn > ahora ? previo : { conteo: 0, expiraEn: ahora + ventanaSegundos * 1000 }

  registro.conteo += 1
  memoria.set(clave, registro)

  // Limpieza oportunista: sin esto el Map crece para siempre en un proceso
  // de larga vida.
  if (memoria.size > 5000) {
    for (const [k, v] of memoria) {
      if (v.expiraEn <= ahora) memoria.delete(k)
    }
  }

  return {
    limitado: registro.conteo > limite,
    conteo: registro.conteo,
    restante: Math.ceil((registro.expiraEn - ahora) / 1000),
  }
}

/**
 * Suelta el límite de un perfil.
 *
* Se llama cuando la verificación termina bien. Si no, el profesional que ya
 * verificó el número igual se come el límite si intenta cambiar su número
 * minutos después, y no parece un bug sino una bronca.
 */
export async function limpiarLimite(clave: string): Promise<void> {
  memoria.delete(clave)

  if (!hayRedis() || Date.now() < reintentarRedisEn) return

  try {
    const redis = clienteRedis(env.upstash.redisUrl, env.upstash.redisToken)
    await redis?.del(clave)
  } catch {
    // Si no se puede limpiar, expira solo. No vale la pena fallar la
    // verificación por un contador residual.
  }
}