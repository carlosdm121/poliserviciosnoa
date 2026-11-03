/**
 * Cifrado AES-256-GCM a nivel de aplicación para campos sensibles.
 *
 * Los datos cifrados viajan a la base de datos en este formato:
 *
 *   v1:{keyId}:{ivBase64}:{tagBase64}:{ciphertextBase64}
 *
 * Donde:
 * - `v1` es la versión del formato (soporta rotación de claves).
 * - `keyId` identifica la clave usada (para re-cifrado futuro).
 * - `iv` es un vector de inicialización aleatorio de 12 bytes (único por valor).
 * - `tag` es la etiqueta de autenticación de GCM (16 bytes).
 * - `ciphertext` es el texto cifrado.
 *
 * La clave de 32 bytes viene de `DATA_ENCRYPTION_KEY` en base64, definida en
 * `.env` y nunca versionada. Sin esta clave, los datos cifrados no se pueden
 * descifrar aunque se filtre la base de datos.
 *
 * Campos a cifrar (ver punto 5 del módulo 6.1):
 *   - Profile.whatsappE164 (se descifra solo al redirigir en /api/contacto/[slug]
 *     y al exportar datos del propio titular).
 *   - FiscalData.documento (CUIT/CUIL/DNI fiscal).
 *   - FiscalData.domicilioFiscal.
 *   - Profile.cuit (perfil de empresa).
 *   - Cualquier dato personal de reclamos/evidencias.
 *
 * NO se cifra lo que se busca o ordena: la unicidad y el lookup usan los hashes
 * HMAC ya existentes (whatsappHash, cuitHash). El email queda en claro porque
 * se usa para el login.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

import { env } from '@/lib/env'

/** ID de la clave activa. Se incrementa al rotar la clave de cifrado. */
export const CLAVE_ACTIVA_ID = 'v1'

/** Tamaño del IV para GCM (12 bytes = 96 bits, recomendado por NIST). */
const IV_LENGTH = 12

/** Longitud de la clave en bytes (256 bits = 32 bytes). */
const CLAVE_LENGTH = 32

/** Prefijo que identifica un valor cifrado. */
const PREFIJO_CIFRADO = 'v1:'

/**
 * Lee la clave de cifrado desde el entorno.
 *
 * Falla al arrancar si falta o si no tiene 32 bytes cuando se decodifica
 * desde base64. Es preferible fallar el arranque a usar una clave débil o
 * inventada.
 */
function obtenerClave(): Buffer {
  const valorBase64 = process.env.DATA_ENCRYPTION_KEY

  if (!valorBase64 || valorBase64.trim() === '') {
    throw new Error(
      'Falta DATA_ENCRYPTION_KEY. Generala con: openssl rand -base64 32',
    )
  }

  let clave: Buffer
  try {
    clave = Buffer.from(valorBase64, 'base64')
  } catch {
    throw new Error('DATA_ENCRYPTION_KEY no es un base64 válido.')
  }

  if (clave.length !== CLAVE_LENGTH) {
    throw new Error(
      `DATA_ENCRYPTION_KEY debe decodificar a exactamente ${CLAVE_LENGTH} bytes (256 bits), ` +
        `decodificó ${clave.length} bytes.`,
    )
  }

  return clave
}

/** Clave cargada una sola vez al importar el módulo. */
const CLAVE = obtenerClave()

/**
 * Cifra un valor de texto plano.
 *
 * Devuelve `null` si el valor de entrada es `null` o `undefined`, para que los
 * campos opcionales del schema puedan seguir siendo nulos en la base.
 *
 * @param valor Texto plano a cifrar.
 * @param keyId Identificador de la clave (por defecto la activa).
 * @returns String cifrado en formato `v1:{keyId}:{iv}:{tag}:{ciphertext}`, o `null`.
 */
export function encryptField(valor: string | null | undefined, keyId = CLAVE_ACTIVA_ID): string | null {
  if (valor === null || valor === undefined) return null

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', CLAVE, iv)

  const ciphertext = Buffer.concat([
    cipher.update(valor, 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return `${PREFIJO_CIFRADO}${keyId}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

/**
 * Descifra un valor previamente cifrado con `encryptField`.
 *
 * Lanza un error si el formato es inválido, si el descifrado falla (clave
 * equivocada, datos corruptos o manipulados) o si el valor no tiene el
 * prefijo esperado.
 *
 * @param cifrado String en formato `v1:{keyId}:{iv}:{tag}:{ciphertext}`.
 * @returns Texto plano descifrado.
 */
export function decryptField(cifrado: string | null | undefined): string | null {
  if (cifrado === null || cifrado === undefined) return null

  if (!cifrado.startsWith(PREFIJO_CIFRADO)) {
    throw new Error('Formato de campo cifrado inválido: falta el prefijo v1:')
  }

  const partes = cifrado.slice(PREFIJO_CIFRADO.length).split(':')

  if (partes.length !== 4) {
    throw new Error('Formato de campo cifrado inválido: se esperan 4 partes.')
  }

  const [keyId, ivBase64, tagBase64, ciphertextBase64] = partes

  // Solo se descifra con la clave activa. Si el keyId es distinto, el dato
  // fue cifrado con una clave antigua y hay que re-cifrarlo primero.
  if (keyId !== CLAVE_ACTIVA_ID) {
    throw new Error(`Campo cifrado con clave obsoleta "${keyId}". Re-cifrar con la clave activa.`)
  }

  let iv: Buffer
  let tag: Buffer
  let ciphertext: Buffer

  try {
    const ivB = Buffer.from(ivBase64!, 'base64')
    const tagB = Buffer.from(tagBase64!, 'base64')
    const ctB = Buffer.from(ciphertextBase64!, 'base64')
    iv = ivB
    tag = tagB
    ciphertext = ctB
  } catch {
    throw new Error('Formato de campo cifrado inválido: partes no son base64 válido.')
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(`El IV debe tener ${IV_LENGTH} bytes, tiene ${iv.length}.`)
  }

  const decipher = createDecipheriv('aes-256-gcm', CLAVE, iv)
  decipher.setAuthTag(tag)

  const descifrado = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return descifrado.toString('utf8')
}

/**
 * Compara dos valores cifrados sin descifrarlos.
 *
 * Útil para saber si dos registros tienen el mismo valor sensible (por ejemplo,
 * para detectar duplicados) sin exponer el texto plano. Compara el ciphertext
 * en tiempo constante. Solo es válido si ambos fueron cifrados con la misma
 * clave; como el IV es aleatorio, dos cifrados del mismo valor son distintos,
 * así que esta función compara el ciphertext completo, no solo el tag.
 *
 * @param a Primer valor cifrado (o null).
 * @param b Segundo valor cifrado (o null).
 * @returns true si ambos son null, o si sus ciphertext son idénticos.
 */
export function compararCifrados(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false

  const partesA = a.slice(PREFIJO_CIFRADO.length).split(':')
  const partesB = b.slice(PREFIJO_CIFRADO.length).split(':')

  // Si el keyId es distinto, no se comparan (claves distintas).
  if (partesA[0] !== partesB[0]) return false

  const ciphertextA = Buffer.from(partesA[3]!, 'base64')
  const ciphertextB = Buffer.from(partesB[3]!, 'base64')

  if (ciphertextA.length !== ciphertextB.length) return false

  return timingSafeEqual(ciphertextA, ciphertextB)
}

/**
 * Determina si un valor ya está cifrado (tiene el prefijo v1:).
 *
 * Útil para la migración idempotente: evitar re-cifrar un valor que ya lo está.
 */
export function yaCifrado(valor: string | null | undefined): boolean {
  if (valor === null || valor === undefined) return false
  return valor.startsWith(PREFIJO_CIFRADO)
}

/**
 * Extrae el keyId de un valor cifrado, o null si no está cifrado.
 */
export function keyIdDe(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || !valor.startsWith(PREFIJO_CIFRADO)) {
    return null
  }
  const partes = valor.slice(PREFIJO_CIFRADO.length).split(':')
  return partes.length >= 1 ? (partes[0] as string) : null
}
