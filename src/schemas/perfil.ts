import { z } from 'zod'

import { PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'
import { validarCuit } from '@/lib/cuit'
import { MAXIMO_DESCRIPCION, revisarDescripcion } from '@/lib/texto-perfil'

/**
 * Validación del formulario de perfil.
 *
 * El mismo schema se usa en el cliente y en el servidor. En el cliente para dar
 * el error junto al campo sin hacer un request; en el servidor porque el cliente
 * se puede manipular y esta es la única frontera real.
 *
 * Los schemas son perezosos en las reglas que necesitan consultar la base
 * (que el rubro exista, que la ciudad sea de esa provincia): eso no se puede
 * resolver con Zod solo. Se valida acá lo que es forma, y `services/perfil.ts`
 * revalida dentro de la transacción lo que es relaciones.
 */

/** Límites. Centralizados porque los usa la UI, el servidor y los tests. */
export const LIMITES_PERFIL = {
  rubros: 2,
  subcategorias: 4,
  ciudades: 8,
} as const

const id = z.string().min(1, 'Falta un dato del formulario.')

export const tipoPerfilSchema = z.enum(['PERSON', 'COMPANY'], {
  errorMap: () => ({ message: 'Elegí si sos una persona o una empresa.' }),
})

export const teamSizeSchema = z.enum(['T1_5', 'T6_20', 'T21_50', 'T50_PLUS'])

export const provinciaSchema = z.enum(
  PROVINCIAS_LISTA as unknown as [string, ...string[]],
  { errorMap: () => ({ message: 'Elegí una provincia.' }) },
)

/**
 * Descripción con el filtro de contacto externo.
 *
 * El error que devuelve dice qué sacar y dónde, no "texto inválido": el
 * profesional puede tener un texto perfectamente bueno con un teléfono de más.
 */
const descripcionSchema = z
  .string()
  .trim()
  .min(20, 'Contá un poco más: con 20 caracteres alcanza.')
  .max(MAXIMO_DESCRIPCION, `Escribí hasta ${MAXIMO_DESCRIPCION} caracteres.`)
  .superRefine((valor, ctx) => {
    const revision = revisarDescripcion(valor)

    if (!revision.ok && revision.detalle) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: revision.detalle })
    }
  })

/** Nombre a mostrar. Corto porque va en la card de búsqueda. */
const nombreMostrarSchema = z
  .string()
  .trim()
  .min(2, 'Escribí tu nombre.')
  .max(80, 'El nombre es demasiado largo.')

const cuitSchema = z
  .string()
  .trim()
  .superRefine((valor, ctx) => {
    const resultado = validarCuit(valor)

    if (!resultado.ok && resultado.error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: resultado.error })
    }
  })

/** Datos de empresa. Todos opcionales: se piden solo si el tipo es COMPANY. */
const empresaSchema = z
  .object({
    companyName: z.string().trim().min(2, 'Escribí la razón social.').max(120).optional(),
    tradeName: z.string().trim().max(120).optional(),
    cuit: cuitSchema.optional().or(z.literal('')),
    teamSize: teamSizeSchema.optional(),
    yearFounded: z.coerce
      .number()
      .int()
      .min(1800, 'Ese año no existe.')
      .max(new Date().getFullYear(), 'No podés fundar una empresa en el futuro.')
      .optional(),
    website: z
      .string()
      .trim()
      .max(200)
      .regex(
        /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i,
        'Revisá el sitio web. Tiene que ser una dirección como empresa.com.ar',
      )
      .optional()
      .or(z.literal('')),
  })
  .strict()

/** Datos de la sección de ubicación y cobertura. */
const ubicacionSchema = z
  .object({
    province: provinciaSchema,
    baseCityId: id,
    /** Cubre toda la provincia: ignora la lista y usa la bandera. */
    coversWholeProvince: z.boolean().default(false),
    /** Provincias adicionales donde atiende, sin fijar ciudades. */
    otherProvinces: z.array(provinciaSchema).max(PROVINCIAS_LISTA.length).default([]),
    /** Ciudades de cobertura, aparte de la base. Máximo 8. */
    cityIds: z.array(id).max(LIMITES_PERFIL.ciudades, `Elegí hasta ${LIMITES_PERFIL.ciudades} ciudades.`).default([]),
  })
  .strict()

/** Rubros y subcategorías. */
const catalogoSchema = z
  .object({
    primaryCategoryId: id,
    secondaryCategoryId: id.optional().or(z.literal('')),
    subcategoryIds: z
      .array(id)
      .max(LIMITES_PERFIL.subcategorias, `Elegí hasta ${LIMITES_PERFIL.subcategorias} subcategorías.`)
      .default([]),
    /** Solo si algún rubro elegido exige matrícula. */
    licenseNumber: z.string().trim().max(60).optional(),
  })
  .strict()

/** Objeto completo del formulario. */
export const perfilSchema = z
  .object({
    type: tipoPerfilSchema,
    name: nombreMostrarSchema,
    description: descripcionSchema,
    company: empresaSchema.default({}),
    ubicacion: ubicacionSchema,
    catalogo: catalogoSchema,
  })
  .strict()
  .superRefine((valor, ctx) => {
    // El secundario tiene que ser distinto del principal. Sin esto, elegir el
    // mismo dos veces deja un perfil con un solo rubro y un contador que dice
    // 2/2, que no cuadra con nada.
    if (valor.catalogo.secondaryCategoryId === valor.catalogo.primaryCategoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['catalogo', 'secondaryCategoryId'],
        message: 'El rubro secundario tiene que ser distinto del principal.',
      })
    }

    // Sin las subcategorías duplicadas, el contador del panel miente y el
    // límite de 4 se puede gastar en la misma dos veces.
    const unicas = new Set(valor.catalogo.subcategoryIds)

    if (unicas.size !== valor.catalogo.subcategoryIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['catalogo', 'subcategoryIds'],
        message: 'Hay una subcategoría repetida.',
      })
    }

    // La ciudad base no hace falta repetirla en la cobertura.
    if (valor.ubicacion.cityIds.includes(valor.ubicacion.baseCityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ubicacion', 'cityIds'],
        message: 'La ciudad base ya está cubierta. Sacala de la lista.',
      })
    }

    // Si el tipo es empresa, hay que completar lo mínimo de empresa.
    if (valor.type === 'COMPANY') {
      if (!valor.company.companyName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['company', 'companyName'],
          message: 'Escribí la razón social de la empresa.',
        })
      }

      if (!valor.company.cuit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['company', 'cuit'],
          message: 'Escribí el CUIT de la empresa.',
        })
      }
    }
  })

export type PerfilInput = z.input<typeof perfilSchema>

/** Enum de provincia a partir de la constante, sin castear strings sueltos. */
export function esProvinciaValida(valor: string): boolean {
  return (PROVINCIAS_LISTA as readonly string[]).includes(valor)
}