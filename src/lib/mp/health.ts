import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Salud de Mercado Pago, desde lib/mp.
 *
 * El health check del sitio no puede leer `env.MP_ACCESS_TOKEN` directamente
 * (regla del proyecto: solo `lib/mp` y `lib/env` tocan la credencial). Esta
 * función vive acá para que el endpoint de `/api/health` pueda verificar
 * conectividad sin tocar el token fuera de `lib/mp`.
 */
export async function saludMercadoPago(): Promise<'ok' | 'error'> {
  if (!env.MP_ACCESS_TOKEN) return 'ok'

  try {
    const respuesta = await fetch(
      'https://api.mercadopago.com/v1/payment_methods',
      { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` } },
    )

    return respuesta.ok ? 'ok' : 'error'
  } catch (error: unknown) {
    logger.error('health: mercadopago no responde', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 'error'
  }
}
