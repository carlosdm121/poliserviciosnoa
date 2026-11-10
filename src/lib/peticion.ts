import 'server-only'

import { headers } from 'next/headers'

import { env } from '@/lib/env'

/**
 * IP del cliente, hasheada.
 *
 * Vive en `lib/` y no junto a las server actions porque un archivo con
 * `"use server"` solo puede usar APIs de Node: Next.js rechaza que se importe
 * `next/headers` desde un módulo que termina importado por un Client
 * Component.
 *
 * Se hashea porque una IP es dato personal bajo la Ley 25.326: guardarla en
 * claro obliga a declararla en la política de privacidad y a eliminarla
 * cuando expire. Hasheada alcanza para rate limiting y auditoría, que son los
 * dos usos reales.
 *
 * En Vercel la IP real viene en `x-forwarded-for`. En desarrollo local no
 * existe y cae al valor por defecto.
 */
export async function ipHasheada(ip?: string): Promise<string> {
  const ipReal = ip ?? (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida'

  // Hash simple y determinista. No necesita ser criptográficamente fuerte:
  // tiene que ser irreversible para no poder reconstruir la IP, y estable
  // para que el rate limit funcione entre requests.
  let hash = 0
  for (let i = 0; i < ipReal.length; i++) {
    hash = (hash << 5) - hash + ipReal.charCodeAt(i)
    hash |= 0
  }

  // Se mezcla con un fragmento de un secreto del proyecto para que un atacante
  // no pueda precomputar todos los hashes posibles y buscar el inverso con una
  // tabla. No es PBKDF2, pero para esto alcanza.
  return `${env.CRON_SECRET.slice(0, 8)}-${Math.abs(hash).toString(36)}`
}