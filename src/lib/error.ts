/**
 * Centralización de manejo de errores (punto 12 del módulo 6.1).
 *
 * Las Server Actions y los handlers de rutas pueden lanzar errores de
 * cualquier tipo. Acá se convierte todo en una respuesta consistente sin
 * exponer detalles internos al cliente ni lasciar que el stack trace vaya.
 */

export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Traduce un error a una respuesta HTTP consumible sin exponer el detail.
 *
 * - Errores `AppError` se pasan tal cual (con su status code y mensaje).
 * - Errores Prisma: P2002 -> 409 (ya existe), P2025 -> 404 (no encontrado).
 * - Todo lo demás -> 500 genérico.
 */
export function manejarError(error: unknown): { mensaje: string; codigo: number } {
  if (error instanceof AppError) {
    return { mensaje: error.message, codigo: error.statusCode }
  }

  // Errores de Prisma
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code?: string; meta?: unknown }
    if (prismaError.code === 'P2002') {
      return { mensaje: 'Ya existe un registro con esos datos.', codigo: 409 }
    }
    if (prismaError.code === 'P2025') {
      return { mensaje: 'Registro no encontrado.', codigo: 404 }
    }
  }

  // Error genérico — no exponer detalles
  return { mensaje: 'Error interno del servidor.', codigo: 500 }
}
