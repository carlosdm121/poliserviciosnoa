import { z } from 'zod'

/** Colores de la página pública. Cada uno opcional, hexadecimal si se envía. */
const colorOpcional = z
  .string()
  .optional()
  .nullable()
  .refine(
    (valor) => valor === undefined || valor === null || /^#[0-9A-Fa-f]{6}$/.test(valor),
    { message: 'Usá un código hexadecimal, por ejemplo #0A0A0A.' },
  )

export const personalizacionSchema = z.object({
  logoUrl: z.string().url('El logo tiene que ser una URL válida.').optional().nullable(),
  bannerUrl: z.string().url('El banner tiene que ser una URL válida.').optional().nullable(),
  pageColors: z
    .object({
      primary: colorOpcional,
      secondary: colorOpcional,
      background: colorOpcional,
      text: colorOpcional,
    })
    .optional()
    .nullable(),
})

export type PersonalizacionInput = z.infer<typeof personalizacionSchema>

/** Límite de precio para validación. */
export const PRECIO_MAXIMO = 999999999.99

export const servicioSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribí el nombre del servicio.').max(120),
  descripcion: z.string().trim().max(1000).optional().nullable(),
  precio: z
    .number()
    .min(0, 'El precio no puede ser negativo.')
    .max(PRECIO_MAXIMO, 'El precio es demasiado alto.'),
  cuotasMax: z.number().int().min(0).max(36).default(0),
  interesCuota: z.number().min(0).max(100).default(0),
  activo: z.boolean().default(true),
})

export type ServicioInput = z.infer<typeof servicioSchema>
