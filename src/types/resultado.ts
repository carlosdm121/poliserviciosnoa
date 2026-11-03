/**
 * Resultado de una operación de escritura.
 *
 * Se usa en vez de tirar excepciones en la lógica de negocio, por dos
 * razones concretas:
 *
 * 1. Un error de negocio esperado (el perfil ya tiene 10 imágenes) no es una
 *    excepción: es una respuesta. Si se tira como excepción hay que
 *    distinguirla de un error real de base de datos, y es fácil equivocarse.
 * 2. Obliga a que cada función declare qué puede fallar. Si el tipo dice
 *    `Error` no hay información; si dice tres casos concretos, el que llama
 *    tiene quecubrir los tres.
 */

export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: CodigoError }

/**
 * Códigos de error estables.
 *
 * El código es para que la UI decida qué mostrar sin parsear el mensaje: el
 * mensaje puede cambiar de texto, el código no.
 */
export const ERROR_CODES = {
  // Validación
  VALIDACION: 'VALIDACION',
  NO_AUTENTICADO: 'NO_AUTENTICADO',
  SIN_PERMISOS: 'SIN_PERMISOS',

  // Reglas de negocio
  LIMITE_ALCANZADO: 'LIMITE_ALCANZADO',
  DUPLICADO: 'DUPLICADO',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  ESTADO_INVALIDO: 'ESTADO_INVALIDO',
  REQUIERE_PAGO: 'REQUIERE_PAGO',

  // Externos
  ERROR_EXTERNO: 'ERROR_EXTERNO',
  RATE_LIMIT: 'RATE_LIMIT',
  DESCONOCIDO: 'DESCONOCIDO',
} as const

export type CodigoError = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** Atajo para construir un resultado exitoso. */
export function ok<T>(data: T): Resultado<T> {
  return { ok: true, data }
}

/**
 * Atajo para construir un resultado fallido.
 *
 * El mensaje va en español rioplatense y debe decir qué pasó y qué puede
 * hacer el usuario, no qué falló internamente.
 */
export function err<T = never>(
  error: string,
  code: CodigoError = ERROR_CODES.DESCONOCIDO,
): Resultado<T> {
  return { ok: false, error, code }
}

/**
 * Error lanzado cuando un recurso no existe.
 * Se usa en controles de propiedad (getOwned*) para devolver 404 sin revelar
 * si el recurso pertenece a otro usuario.
 */
export class NotFoundError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'NotFoundError'
  }
}

/**
 * Error lanzado cuando un recurso existe pero no pertenece al usuario
 * autenticado. Se usa para devolver 403 sin revelar existencia del recurso.
 */
export class PropiedadDenegadaError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'PropiedadDenegadaError'
  }
}