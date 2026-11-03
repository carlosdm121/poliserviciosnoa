/**
 * Validación de archivos subidos (punto 16 del módulo 6.1).
 *
 * Reglas:
 * - Lista blanca de tipo MIME y extensión, MÁS verificación de la firma real
 *   del archivo (magic bytes) en el servidor: no confiar en el Content-Type
 *   del cliente.
 * - Imágenes: jpg, png y webp, máx. 5 MB.
 * - Constancias de empresa: pdf, jpg o png, máx. 10 MB.
 * - Sin SVG, HTML, ejecutables ni archivos comprimidos.
 * - Nombres generados por el servidor; el nombre original se descarta.
 * - Quitar metadatos EXIF (ubicación, dispositivo) de las imágenes.
 * - Documentos y evidencias como recursos privados con URL firmada efímera.
 */

import { env } from '@/lib/env'

/** Tamaño máximo para imágenes: 5 MB. */
export const TAMANO_MAX_IMAGEN = 5 * 1024 * 1024

/** Tamaño máximo para constancias: 10 MB. */
export const TAMANO_MAX_CONSTANCIA = 10 * 1024 * 1024

/** Tipos MIME permitidos para imágenes. */
export const TIPOS_MIME_IMAGEN = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Tipos MIME permitidos para constancias de empresa. */
export const TIPOS_MIME_CONSTANCIA = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

/** Extensiones permitidas para imágenes. */
export const EXTENSIONES_IMAGEN = new Set(['jpg', 'jpeg', 'png', 'webp'])

/** Extensiones permitidas para constancias. */
export const EXTENSIONES_CONSTANCIA = new Set(['pdf', 'jpg', 'jpeg', 'png'])

// ---------------------------------------------------------------------------
// Magic bytes (firmas de archivo)
// ---------------------------------------------------------------------------

/**
 * Corta un segmento del buffer de forma segura. `Buffer.prototype.slice` en
 * algunas versiones de @types/node tipa el resultado como posiblemente
 * `undefined`, pero en la práctica nunca lo es cuando los índices son válidos.
 */
function segmento(buffer: Buffer, inicio: number, fin: number): Buffer {
  const resultado = buffer.slice(inicio, fin)
  if (!resultado) {
    throw new Error('No se pudo leer el segmento del buffer.')
  }
  return resultado
}

/**
 * Verifica si `buffer` comienza con los bytes de `firma`.
 * Usa comparación byte a byte para evitar problemas de tipos entre Buffer y Uint8Array.
 */
function empiezaCon(buffer: Buffer, firma: Buffer): boolean {
  if (buffer.length < firma.length) return false
  for (let i = 0; i < firma.length; i++) {
    if (buffer[i] !== firma[i]) return false
  }
  return true
}

/**
 * Firmas de archivo conocidas (magic bytes).
 * Los primeros bytes del archivo identifican el tipo real, independientemente
 * de la extensión o el Content-Type que envíe el cliente.
 */
const MAGIC_BYTES_PDF = Buffer.from([0x25, 0x50, 0x44, 0x46]) // %PDF
const MAGIC_BYTES_JPEG = Buffer.from([0xff, 0xd8, 0xff])
const MAGIC_BYTES_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAGIC_BYTES_WEBP_RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF
const MAGIC_BYTES_SVG = Buffer.from([0x3c, 0x73, 0x76, 0x67]) // <svg
const MAGIC_BYTES_HTML = Buffer.from([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]) // <!DOCTYPE
const MAGIC_BYTES_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const MAGIC_BYTES_EXE = Buffer.from([0x4d, 0x5a]) // MZ

/**
 * Detecta el tipo real de un archivo por sus magic bytes.
 *
 * @param buffer Primeros bytes del archivo.
 * @returns Tipo detectado ('jpeg', 'png', 'webp', 'pdf', 'svg', 'html', 'zip', 'exe') o null.
 */
export function detectarTipoPorMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null

  // PDF
  if (empiezaCon(buffer, MAGIC_BYTES_PDF)) return 'pdf'

  // JPEG
  if (buffer.length >= 3 && empiezaCon(buffer, MAGIC_BYTES_JPEG)) {
    return 'jpeg'
  }

  // PNG
  if (buffer.length >= 8 && empiezaCon(buffer, MAGIC_BYTES_PNG)) {
    return 'png'
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    empiezaCon(buffer, MAGIC_BYTES_WEBP_RIFF) &&
    buffer.slice(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp'
  }

  // SVG
  if (buffer.length >= 4 && empiezaCon(buffer, MAGIC_BYTES_SVG)) {
    return 'svg'
  }

  // HTML
  if (buffer.length >= 9 && empiezaCon(buffer, MAGIC_BYTES_HTML)) {
    return 'html'
  }

  // ZIP
  if (buffer.length >= 4 && empiezaCon(buffer, MAGIC_BYTES_ZIP)) {
    return 'zip'
  }

  // EXE
  if (buffer.length >= 2 && empiezaCon(buffer, MAGIC_BYTES_EXE)) {
    return 'exe'
  }

  return null
}

/**
 * Valida que un archivo de imagen cumpla con tipo MIME, extensión, magic bytes
 * y tamaño máximo.
 *
 * @param buffer Contenido del archivo.
 * @param tipoMime Tipo MIME declarado por el cliente (no se confía ciegamente).
 * @param nombreArchivo Nombre original del archivo (se descarta, solo para extensión).
 * @returns { tipoReal, valido } con el tipo real detectado y si es válido.
 */
export function validarArchivoImagen(
  buffer: Buffer,
  tipoMime: string,
  nombreArchivo: string,
): { tipoReal: string | null; valido: boolean; motivo?: string } {
  // Tamaño.
  if (buffer.length > TAMANO_MAX_IMAGEN) {
    return { tipoReal: null, valido: false, motivo: 'La imagen excede los 5 MB.' }
  }

  // Tipo MIME declarado debe ser de imagen.
  if (!TIPOS_MIME_IMAGEN.has(tipoMime.toLowerCase())) {
    return { tipoReal: null, valido: false, motivo: 'Tipo de archivo no permitido para imágenes.' }
  }

  // Extensión.
  const extension = nombreArchivo.toLowerCase().split('.').pop() ?? ''
  if (!EXTENSIONES_IMAGEN.has(extension)) {
    return { tipoReal: null, valido: false, motivo: 'Extensión no permitida para imágenes.' }
  }

  // Magic bytes: el tipo real debe ser jpeg, png o webp.
  const tipoReal = detectarTipoPorMagicBytes(buffer)
  const tiposImagenValidos = new Set(['jpeg', 'png', 'webp'])
  if (!tipoReal || !tiposImagenValidos.has(tipoReal)) {
    return {
      tipoReal,
      valido: false,
      motivo: 'El contenido del archivo no coincide con una imagen válida.',
    }
  }

  // Coherencia: si el cliente dice jpeg pero los magic bytes dicen png, rechazar.
  const mimePorTipo: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }
  if (mimePorTipo[tipoReal] !== tipoMime.toLowerCase()) {
    return {
      tipoReal,
      valido: false,
      motivo: 'El tipo MIME no coincide con el contenido del archivo.',
    }
  }

  return { tipoReal, valido: true }
}

/**
 * Valida un archivo de constancia de empresa (PDF, JPG, PNG).
 */
export function validarArchivoConstancia(
  buffer: Buffer,
  tipoMime: string,
  nombreArchivo: string,
): { tipoReal: string | null; valido: boolean; motivo?: string } {
  if (buffer.length > TAMANO_MAX_CONSTANCIA) {
    return { tipoReal: null, valido: false, motivo: 'El archivo excede los 10 MB.' }
  }

  if (!TIPOS_MIME_CONSTANCIA.has(tipoMime.toLowerCase())) {
    return {
      tipoReal: null,
      valido: false,
      motivo: 'Tipo de archivo no permitido para constancias.',
    }
  }

  const extension = nombreArchivo.toLowerCase().split('.').pop() ?? ''
  if (!EXTENSIONES_CONSTANCIA.has(extension)) {
    return { tipoReal: null, valido: false, motivo: 'Extensión no permitida para constancias.' }
  }

  const tipoReal = detectarTipoPorMagicBytes(buffer)
  const tiposValidos = new Set(['pdf', 'jpeg', 'png'])
  if (!tipoReal || !tiposValidos.has(tipoReal)) {
    return {
      tipoReal,
      valido: false,
      motivo: 'El contenido del archivo no es una constancia válida.',
    }
  }

  return { tipoReal, valido: true }
}

/**
 * Rechaza tipos de archivo peligrosos (SVG, HTML, ejecutables, comprimidos).
 */
export function esTipoPeligroso(tipoReal: string | null): boolean {
  const peligrosos = new Set(['svg', 'html', 'zip', 'exe'])
  return tipoReal ? peligrosos.has(tipoReal) : false
}

/**
 * Genera un nombre de archivo seguro generado por el servidor.
 * El nombre original se descarta para evitar sobreescritura, traversal o
 * revelación de información del cliente.
 */
export function generarNombreSeguro(extension: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex}.${extension.toLowerCase()}`
}

/**
 * Indica si los metadatos EXIF deben quitarse.
 *
 * Nota: quitar EXIF en Node.js puro requiere una librería de procesamiento de
 * imágenes (sharp, jimp, etc.). Como política, las imágenes se suben a
 * Cloudinary con una transformación que puede eliminar metadatos, o se
 * integra ClamAV / un servicio externo para constancias. Esta función es el
 * punto de integración para ese paso.
 */
export function requiereQuitarExif(tipoReal: string): boolean {
  return ['jpeg', 'png', 'webp'].includes(tipoReal)
}
