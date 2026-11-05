import { z } from 'zod'

import { servicioSchema, type ServicioInput } from '@/schemas/personalizacion'

/** Schema compartido para crear y editar servicios. Valida en cliente y servidor. */
export const crearServicioSchema = servicioSchema
export const editarServicioSchema = servicioSchema

export type { ServicioInput }
