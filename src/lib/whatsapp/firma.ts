import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Validación de la firma de Meta.
 *
 * Vive acá y no en la ruta del webhook para poder testearla sin levantar Next.
 * Una función de seguridad sin tests es una función que nadie va a romper a
 * propósito para ver si se rompe.
 */

/**
 * `X-Hub-Signature-256` tiene que coincidir con el HMAC del cuerpo CRUDO.
 *
 * El detalle que hace fallar a la mitad de las implementaciones: hay que
 * hashear el cuerpo exacto que llegó, no el JSON reserializado. Si se parsea
 * primero y se vuelve a stringify, cambia el orden de las claves o los espacios
 * y la firma deja de coincidir, y el webhook se rechaza con un 401 que no
 * dice por qué.
 *
 * @param cuerpoCrudo Texto exacto del body.
 * @param firma Valor del header `X-Hub-Signature-256`.
 * @param secreto Secreto de la app de Meta. Se pasa como parámetro para que el
 *   test pueda verificar el valor real y no solo "que no revienta".
 */
export function firmaValida(
  cuerpoCrudo: string,
  firma: string | null,
  secreto: string = env.whatsapp.appSecret,
): boolean {
  if (!firma || !secreto) return false

  const recibido = firma.startsWith('sha256=') ? firma.slice(7) : firma

  // 64 hexadecimales es un sha256. Anything else no es una firma nuestra y
  // comparar longitudes distintas con timingSafeEqual tira.
  if (!/^[0-9a-f]{64}$/i.test(recibido)) return false

  const esperado = createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest('hex')

  return timingSafeEqual(Buffer.from(recibido.toLowerCase(), 'utf8'), Buffer.from(esperado, 'utf8'))
}

/** Calcula la firma que Meta enviaría por un cuerpo dado. Lo usan los tests. */
export function firmar(cuerpoCrudo: string, secreto: string = env.whatsapp.appSecret): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest('hex')}`
}