import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/**
 * Hash HMAC con pepper del entorno.
 *
 * Un hash con pepper no se puede revertir con una tabla rainbow aunque alguien
 * se lleve la base: sin `PHONE_HASH_PEPPER` el hash no sirve para nada. Por eso
 * el pepper vive en `.env` y nunca en la base ni en el repositorio.
 *
 * Para números y códigos de un solo uso alcanza con SHA-256: el espacio de
 * búsqueda son 10 dígitos y el atacante no puede elegir el preimage a voluntad
 * para colisionar. El HMAC agrega que el pepper no está en la base, que es el
 * escenario real de una filtración.
 *
 * El módulo es de servidor: usa `node:crypto`, que no existe en el navegador.
 * La normalización del número vive aparte, en `src/lib/phone.ts`, que sí es
 * importable desde el cliente.
 */

/** Hexadecimal en minúsculas, que es lo que se guarda en la base. */
function hmac(valor: string): string {
  return createHmac('sha256', env.phoneHashPepper).update(valor).digest('hex')
}

/** Hash de un teléfono ya normalizado a E.164. */
export function hashTelefono(e164: string): string {
  return hmac(e164)
}

/** Hash del código de verificación. Nunca se guarda el código en claro. */
export function hashCodigo(codigo: string): string {
  return hmac(codigo)
}

/** Hash genérico, para el resto de identificadores sensibles. */
export function hashValor(valor: string): string {
  return hmac(valor)
}

/**
 * Compara dos hashes en tiempo constante.
 *
 * `===` sobre strings corta la comparación en el primer byte distinto y abre
 * una ventana de tiempo: un atacante que puede medir cuánto tarda el servidor
 * en responder puede adivinar un hash byte a byte. Con HMAC no sirve para
 * invertir nada, pero comparar igual tiene el costo cero y evita que alguien
 * copie el patrón.
 */
export function compararHash(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')

  if (bufferA.length !== bufferB.length) return false

  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Alfabeto sin caracteres ambiguos: sin 0/O y sin 1/I.
 *
 * El código lo lee una persona, de un celular, sin zoom, tipeándolo a mano en
 * el chat de WhatsApp. Sacar los dos caracteres que se confunden con 0 y O, y
 * con 1 e I, evita que la mitad de los intentos fallen por una letra.
 */
const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Longitud del código de verificación. */
export const LARGO_CODIGO = 6

/**
 * Genera un código con `crypto.randomInt`, que usa la fuente criptográfica del
 * sistema. `Math.random()` no sirve acá: el código es la prueba de titularidad
 * y se adivina o se filtra.
 */
export function generarCodigo(): string {
  let codigo = ''

  for (let i = 0; i < LARGO_CODIGO; i++) {
    codigo += ALFABETO_CODIGO[randomInt(0, ALFABETO_CODIGO.length)]
  }

  return codigo
}

/**
 * Extrae el código de un texto libre.
 *
 * El profesional escribe lo que sea: "codigo ABC123", "mi codigo es abc-123",
 * "hola soy yo, ABC123", con mayúsculas, espacios o guiones. La búsqueda tiene
 * que ser tolerante o la mitad de las verificaciones falla por formato, y el
 * mensaje de error "código inválido" no le dice qué hizo mal.
 *
 * Solo se aceptan los caracteres del alfabeto del código, en un bloque de
 * exactamente `LARGO_CODIGO`. Buscar "el primero de 6 caracteres" en un
 * párrafo común_matcharía palabras de 6 letras que no son códigos.
 */
export function extraerCodigo(texto: string): string | null {
  // Primero se busca junto a la palabra "código". El mensaje que sugerimos es
  // "Verifico mi número en PoliserviciosNOA. Código: ABC123", y casi todos lo
  // van a copiar tal cual: ese camino no tiene falsos positivos.
  const conEtiqueta = texto.toUpperCase().match(/C[OÓ]DIGO\D{0,8}([2-9A-HJ-NP-Z]{6})/)

  if (conEtiqueta?.[1]) return conEtiqueta[1]

  // Fallback para el que escribe "soy yo ABC123" sin la palabra código.
  //
  // Acotado por límites de palabra a propósito. Sin ellos, cualquier palabra
  // de 6 letras del alfabeto matchea: "trabajo" devolvía TRABAJ y el
  // profesional recibía un mensaje de error sin haber hecho nada malo.
  const suelto = texto.toUpperCase().match(/(?:^|[^0-9A-Z])([2-9A-HJ-NP-Z]{6})(?![0-9A-Z])/)

  return suelto?.[1] ?? null
}