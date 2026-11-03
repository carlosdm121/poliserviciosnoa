import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Validación de la firma de los webhooks de Mercado Pago.
 *
 * Mercado Pago no firma el cuerpo como Meta: firma un *manifest* armado con
 * tres datos del pedido. Por eso este archivo no recibe el body crudo, recibe
 * las partes que van al manifest.
 *
 * El manifest es:
 *
 * ```
 * id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * ```
 *
 * `request-id` se omite si el header no vino. El `data.id` va en minúsculas
 * porque Mercado Pago lo documenta así para los identificadores alfanuméricos.
 *
 * Vive en `lib/` y no en la ruta para poder testearlo sin Next, igual que
 * `lib/whatsapp/firma.ts`. Una función de seguridad sin tests es una función
 * que nadie se anima a tocar cuando hay que cambiarla.
 */

/** Partes del header `x-signature`: `ts=...,v1=...`. */
export type PartesFirma = {
  ts: string
  v1: string
}

/**
 * Lee `x-signature`.
 *
 * El orden de los pares no está garantizado y pueden venir espacios después de
 * las comas. Un parser que asume `ts` primero rechaza webhooks legítimos y el
 * síntoma es un 401 intermitente que nadie relaciona con el formato del header.
 */
export function parsearFirma(header: string | null): PartesFirma | null {
  if (!header) return null

  const partes = new Map<string, string>()

  for (const par of header.split(',')) {
    const separador = par.indexOf('=')
    if (separador === -1) continue

    const clave = par.slice(0, separador).trim()
    const valor = par.slice(separador + 1).trim()

    if (clave.length > 0 && valor.length > 0) partes.set(clave, valor)
  }

  const ts = partes.get('ts')
  const v1 = partes.get('v1')

  if (!ts || !v1) return null

  return { ts, v1 }
}

/**
 * Arma el texto exacto que Mercado Pago firma.
 *
 * El `;` final no es decorativo: sin él, el HMAC no coincide y todos los
 * webhooks se rechazan. Es el error más común de esta integración.
 */
export function manifestWebhook(
  dataId: string,
  ts: string,
  requestId: string | null,
): string {
  const id = dataId.toLowerCase()
  const pedido = requestId && requestId.length > 0 ? `request-id:${requestId};` : ''

  return `id:${id};${pedido}ts:${ts};`
}

/**
 * Calcula el `v1` que Mercado Pago mandaría para estos datos.
 *
 * Lo usan los tests y el script de verificación para firmar pedidos propios.
 * Devuelve solo el hexadecimal, no el header completo: el `ts` lo elige quien
 * arma el pedido.
 */
export function firmarWebhook(params: {
  dataId: string
  ts: string
  requestId?: string | null
  secreto: string
}): string {
  return createHmac('sha256', params.secreto)
    .update(manifestWebhook(params.dataId, params.ts, params.requestId ?? null), 'utf8')
    .digest('hex')
}

/**
 * ¿La firma corresponde a estos datos?
 *
 * Compara en tiempo constante. La longitud se valida antes porque
 * `timingSafeEqual` tira si los buffers miden distinto, y una excepción en el
 * camino del webhook se convierte en un 500 que Mercado Pago reintenta para
 * siempre.
 */
export function firmaValidaWebhook(params: {
  dataId: string
  header: string | null
  requestId: string | null
  secreto: string
}): boolean {
  if (!params.secreto) return false

  const firma = parsearFirma(params.header)

  if (!firma) return false

  if (!/^[0-9a-f]{64}$/i.test(firma.v1)) return false

  const esperado = firmarWebhook({
    dataId: params.dataId,
    ts: firma.ts,
    requestId: params.requestId,
    secreto: params.secreto,
  })

  return timingSafeEqual(
    Buffer.from(firma.v1.toLowerCase(), 'utf8'),
    Buffer.from(esperado, 'utf8'),
  )
}
