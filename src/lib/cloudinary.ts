import { createHash } from 'node:crypto'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  carpetaDePerfil,
  publicIdPerteneceA,
  publicIdTieneTraversal,
  TRANSFORMACION_SUBIDA,
} from '@/lib/imagen'

/**
 * Cliente de Cloudinary.
 *
 * Existe como módulo y no como SDK suelto en los servicios por la misma razón
 * que `lib/whatsapp`: el desarrollo local y los tests no pueden depender de que
 * haya credenciales reales ni de que la red esté disponible. La regla de
 * `stack.md` se cumple acá: ningún `services/` habla con Cloudinary
 * directamente, habla con las funciones de este archivo.
 *
 * El flujo de subida es el de *signed upload* de Cloudinary, y la razón de que
 * sea firmado y no directo es que el navegador del profesional no puede decidir
 * la carpeta. Con una clave de API en el cliente, cualquiera podría subir a
 * `perfiles/<otro-id>/`; con la firma, la carpeta la pone el servidor y solo
 * dentro de su ventana de tiempo.
 */

/** Datos que Cloudinary devuelve de un recurso ya subido. */
export type RecursoImagen = {
  publicId: string
  url: string
  width: number
  height: number
  bytes: number
  format: string
}

/** Lo que el navegador necesita para subir directo a Cloudinary. */
export type FirmaSubida = {
  /** URL completa del endpoint de subida de la cuenta. */
  url: string
  apiKey: string
  /** Sello de tiempo de la firma, en segundos. */
  timestamp: number
  /** Firma HMAC-SHA1 de los parámetros. */
  signature: string
  /** Carpeta ya resuelta, para que el cliente no la pueda cambiar. */
  folder: string
  /** Restricciones firmadas:Cloudinary las aplica aunque el cliente no las mande. */
  allowedFormats: string
  transformation: string
}

export class ErrorCloudinary extends Error {
  constructor(
    message: string,
    readonly detalle?: string,
  ) {
    super(message)
    this.name = 'ErrorCloudinary'
  }
}

/**
 * Parámetros firmados, en el orden exacto que Cloudinary exige.
 *
 * Cloudinary firma el string de parámetros **ordenado alfabéticamente** y
 * concatenado al final el `api_secret`. Si el orden no coincide, la firma no
 * valida y el error del proveedor es críptico; el comentario está porque es el
 * detalle que más se rompe cuando algo anda mal.
 */
function parametrosFirmados(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((clave) => `${clave}=${params[clave]}`)
    .join('&')
}

/**
 * Genera la firma de subida para la galería de un perfil.
 *
 * @param profileId Perfil dueño. La carpeta se deriva de acá y de ningún otro
 *   lugar: es lo que impide subir a la carpeta de otro.
 * @param ahora Inyectable para tests, porque la firma expira.
 */
export function firmarSubida(
  profileId: string,
  ahora: Date = new Date(),
): FirmaSubida {
  const timestamp = Math.floor(ahora.getTime() / 1000)
  const folder = carpetaDePerfil(profileId)

  const params = {
    // El límite de formatos también va firmado, y no solo como filtro del
    // selector de archivos: el selector es donde no importa, porque se puede
    // saltear. El que tiene que hacer caso es Cloudinary.
    allowed_formats: 'jpg,png,webp',
    folder,
    timestamp,
    transformation: TRANSFORMACION_SUBIDA,
  }

  const firma = createHash('sha1')
    .update(parametrosFirmados(params) + env.CLOUDINARY_API_SECRET)
    .digest('hex')

  return {
    url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature: firma,
    folder,
    allowedFormats: params.allowed_formats,
    transformation: params.transformation,
  }
}

/**
 * Consulta un recurso en la API de Cloudinary.
 *
 * Va contra la API y no contra la base a propósito. Es la única forma de
 * comprobar que el archivo existe de verdad y que dice las dimensiones que
 * dice: si el servicio se fiara del `publicId` que manda el cliente, alguien
 * podría registrar en la base una imagen que nunca se subió, y el perfil
 * quedaría "completo" con una foto rota.
 *
 * `null` significa que no existe. Un error de red no se convierte en `null`:
 * el servicio tiene que poder distinguir "esa imagen no está" de "no supimos
 * verificar", porque llevan a respuestas distintas.
 */
export async function consultarRecurso(publicId: string): Promise<RecursoImagen | null> {
  if (publicIdTieneTraversal(publicId)) {
    throw new ErrorCloudinary('El identificador de la imagen no es válido.')
  }

  if (usarMock()) {
    return mockConsulta(publicId)
  }

  const endpoint =
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}` +
    `/image/admin/${encodeURIComponent(publicId)}` +
    `?api_key=${env.CLOUDINARY_API_KEY}`

  const respuesta = await fetch(endpoint, {
    headers: { Authorization: `Basic ${credencialesBasic()}` },
    cache: 'no-store',
  })

  // Cloudinary responde 404 con cuerpo JSON cuando el recurso no existe. Un
  // 401 o 500 sí es un problema nuestro y no se puede convertir en "no existe".
  if (respuesta.status === 404) return null

  if (!respuesta.ok) {
    logger.error('cloudinary: error al consultar el recurso', { status: respuesta.status })
    throw new ErrorCloudinary('No pudimos verificar la imagen. Probá de nuevo.')
  }

  /**
   * Forma de la respuesta de la API, que es `snake_case`.
   *
   * No se tipa como `Partial<RecursoImagen>` a propósito: ese tipo está en
   * `camelCase` porque es el que maneja el resto del código, y castear la
   * respuesta a ese tipo haría que TypeScript creyera que `datos.public_id`
   * existe. El mapeo de abajo es lo que convierte una cosa en la otra, y que
   * sea explícito es lo que evita que esa conversión se pierda.
   */
  const datos = (await respuesta.json()) as {
    public_id?: unknown
    secure_url?: unknown
    url?: unknown
    width?: unknown
    height?: unknown
    bytes?: unknown
    format?: unknown
  }

  const idDevuelto = datos.public_id
  const urlImagen = datos.secure_url ?? datos.url

  if (typeof idDevuelto !== 'string' || typeof urlImagen !== 'string') {
    throw new ErrorCloudinary('La respuesta de Cloudinary no tiene lo esperado.')
  }

  return {
    publicId: idDevuelto,
    url: urlImagen,
    width: typeof datos.width === 'number' ? datos.width : 0,
    height: typeof datos.height === 'number' ? datos.height : 0,
    bytes: typeof datos.bytes === 'number' ? datos.bytes : 0,
    format: typeof datos.format === 'string' ? datos.format : '',
  }
}

/**
 * Verifica que el recurso exista y que sea de este perfil.
 *
 * Son dos preguntas separadas y ambas tienen que ser certain:
 *
 * 1. ¿Existe? Si no, el cliente se inventó el `publicId`.
 * 2. ¿Es de esta carpeta? Si no, es la foto de otro perfil.
 *
 * El servicio llama a esto y no a `consultarRecurso` directo porque así el
 * orden —existe primero, después es de quién— queda escrito en un solo lugar.
 */
export async function verificarRecursoDePerfil(
  publicId: string,
  profileId: string,
): Promise<RecursoImagen | null> {
  const recurso = await consultarRecurso(publicId)

  if (!recurso) return null

  if (!publicIdPerteneceA(recurso.publicId, profileId)) {
    logger.warn('galería: imagen de otra carpeta rechazada', { profileId })
    return null
  }

  return recurso
}

/**
 * Borra el recurso de Cloudinary.
 *
 * Nunca tira excepción por un recurso que no está: borrar algo dos veces no
 * es un error que le importe a nadie, y en la base la imagen ya se está
 * borrando igual. Un `404` acá es el resultado esperado cuando el borrado
 * anterior se cortó a mitad de camino.
 */
export async function borrarRecurso(publicId: string): Promise<void> {
  if (publicIdTieneTraversal(publicId)) {
    throw new ErrorCloudinary('El identificador de la imagen no es válido.')
  }

  if (usarMock()) {
    mockBorrar(publicId)
    return
  }

  const url =
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}` +
    `/image/destroy?api_key=${env.CLOUDINARY_API_KEY}`

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credencialesBasic()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ public_id: publicId }),
    })

    // Cloudinary responde 200 con `result: 'not found'` cuando no existe.
    const cuerpo = (await respuesta.json()) as { result?: string }

    if (!respuesta.ok && respuesta.status !== 404) {
      logger.error('cloudinary: error al borrar el recurso', { status: respuesta.status })
    }

    if (cuerpo.result === 'not found') {
      logger.info('cloudinary: el recurso ya no estaba', { publicId })
    }
  } catch (error: unknown) {
    /**
     * No se propaga el error de red, y la razón es de negocio, no técnica:
     * si Cloudinary está caído y el borrado falla, el profesional tiene que
     * poder sacarse la foto igual. La fila de la base se borra siempre; la
     * huérfana en Cloudinary se limpia sola, porque el plan no factura por
     * archivo y una imagen suelta no la ve nadie.
     */
    logger.warn('cloudinary: no se pudo borrar el recurso', {
      publicId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function credencialesBasic(): string {
  return Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

/**
 * Recursos "existentes" en el mock, en memoria.
 *
 * Es global por el mismo motivo que el mock de WhatsApp: la subida la simula
 * un request y la consulta viene de otro, y en un entorno serverless cada uno
 * es una instancia distinta. Sin el global, el servicio vería que la imagen
 * nunca se subió y toda la galería fallaría en desarrollo.
 */
const globalMock = globalThis as unknown as { __mockCloudinary?: Map<string, RecursoImagen> }

const mockRecursos: Map<string, RecursoImagen> =
  globalMock.__mockCloudinary ?? (globalMock.__mockCloudinary = new Map())

/**
 * Si se usa el mock.
 *
 * Misma regla que en WhatsApp: **fuera de producción se usa el mock, salvo que
 * se pida explícitamente lo contrario con `CLOUDINARY_REAL=1`.** Un `.env`
 * copiado de otra máquina con credenciales de producción haría que cada prueba
 * de desarrollo suba archivos de verdad a la cuenta real y consuma ancho de
 * banda del plan pago.
 */
function usarMock(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.CLOUDINARY_REAL !== '1'
}

function mockConsulta(publicId: string): RecursoImagen | null {
  return mockRecursos.get(publicId) ?? null
}

function mockBorrar(publicId: string): void {
  mockRecursos.delete(publicId)
}

/**
 * Registra un recurso como subido. Solo para desarrollo y tests.
 *
 * Es el equivalente del navegador ejecutando la subida real contra Cloudinary:
 * el archivo llega, y el servidor después lo va a buscar por `publicId`. En
 * desarrollo no hay navegador que suba, así que se simula acá.
 */
export function registrarSubidaMock(
  publicId: string,
  dimensiones: { width?: number; height?: number; bytes?: number } = {},
): RecursoImagen {
  const recurso: RecursoImagen = {
    publicId,
    url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
    width: dimensiones.width ?? 1200,
    height: dimensiones.height ?? 800,
    bytes: dimensiones.bytes ?? 240_000,
    format: publicId.endsWith('.png') ? 'png' : 'jpg',
  }

  mockRecursos.set(publicId, recurso)

  return recurso
}

/** Vacía el registro del mock. Lo usan los tests entre corridas. */
export function limpiarMock(): void {
  mockRecursos.clear()
}