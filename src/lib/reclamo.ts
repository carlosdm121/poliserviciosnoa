/**
 * Reglas puras de reclamos de cliente contra profesional.
 *
 * Todo lo que se puede decidir sin base vive acá: validar la descripción, el
 * motivo, el número de trámite y el límite de uno por cliente y perfil cada 30
 * días. El servicio (`services/reclamo.ts`) solo lee y escribe.
 */

import { ReclamoEstado, ReclamoMotivo } from '@prisma/client'

/** Longitud máxima de la descripción del reclamo. */
export const LARGO_MAX_DESCRIPCION = 1000

/** Límite: un reclamo por cliente y perfil cada 30 días corridos. */
export const DIAS_LIMITE_RECLAMO = 30

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Motivos válidos de reclamo. */
export const MOTIVOS_RECLAMO: Record<ReclamoMotivo, string> = {
  NO_SE_PRESENTO: 'No se presentó al servicio contratado.',
  MALA_CALIDAD: 'Mala calidad del servicio.',
  COBRO_EXCESIVO: 'Cobro excesivo.',
  TRATO_INADECUADO: 'Trato inadecuado.',
  FRAUDE: 'Fraude.',
  OTRO: 'Otro motivo.',
}

/** Texto de cada estado. */
export const ETIQUETA_ESTADO_RECLAMO: Record<ReclamoEstado, string> = {
  NUEVO: 'Nuevo',
  EN_REVISION: 'En revisión',
  VALIDADO: 'Validado',
  DESESTIMADO: 'Desestimado',
}

/**
 * Valida la descripción del reclamo.
 *
 * Devuelve null si es válida, o un mensaje de error si no.
 */
export function validarDescripcion(descripcion: string): string | null {
  const texto = descripcion.trim()

  if (!texto) {
    return 'La descripción es obligatoria.'
  }

  if (texto.length > LARGO_MAX_DESCRIPCION) {
    return `La descripción no puede superar los ${LARGO_MAX_DESCRIPCION} caracteres.`
  }

  return null
}

/**
 * Fecha límite: reclamos más viejos que esta fecha ya no bloquean una nueva
 * presentación (pasaron los 30 días).
 */
export function limiteTreintaDias(ahora: Date): Date {
  return new Date(ahora.getTime() - DIAS_LIMITE_RECLAMO * MS_POR_DIA)
}

/**
 * Número de trámite visible para el cliente.
 *
 * Formato: `RC-20261028-AB12CD`. Lleva fecha y sufijo corto alfanumérico para
 * que se pueda dictar por teléfono.
 */
export function generarNumeroTramiteReclamo(ahora: Date, sufijo: string): string {
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const limpio = sufijo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  return `RC-${anio}${mes}${dia}-${limpio || '000000'}`
}

/**
 * Verifica que un motivo sea uno de los válidos del enum.
 */
export function esMotivoValido(motivo: string): motivo is ReclamoMotivo {
  return Object.values(ReclamoMotivo).includes(motivo as ReclamoMotivo)
}
