import { z } from 'zod'

import { emailSchema, nombreSchema, passwordSchema, whatsappSchema } from './contacto'

/**
 * Schemas de registro y login.
 *
 * Los mismos objetos se usan en el formulario del cliente y en el Server
 * Action. Es deliberado: si el cliente valida con un schema y el servidor
 * valida con otro, alguien termina manteniendo dos reglas que divergen. Un
 * solo schema no puede divergir.
 */

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

/** Registro de profesional: es el flujo principal del portal. */
export const registroProfesionalSchema = z.object({
  name: nombreSchema,
  email: emailSchema,
  password: passwordSchema,
  whatsapp: whatsappSchema,
})

export type RegistroProfesionalInput = z.infer<typeof registroProfesionalSchema>

/**
 * Registro de cliente.
 *
 * No lleva contraseña: el cliente entra con Google o con un enlace mágico.
 * Pedirle una contraseña a alguien que solo va a mirar un perfil es una
 * barrera que no compra nada.
 */
export const registroClienteSchema = z.object({
  name: z.string().trim().min(2, 'Escribí tu nombre').max(80),
  email: emailSchema,
})

export type RegistroClienteInput = z.infer<typeof registroClienteSchema>

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribí tu contraseña'),
})

export type LoginInput = z.infer<typeof loginSchema>

/** Solicitud de enlace mágico. Solo el email, porque no hay contraseña. */
export const magicLinkSchema = z.object({
  email: emailSchema,
  // Honeypot: campo invisible que solo llenan los bots. Si viene con valor,
  // el envío se descarta en silencio para no darle señal al bot.
  empresa: z.string().max(0).optional(),
})

export type MagicLinkInput = z.infer<typeof magicLinkSchema>

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/** Límites del negocio, en un solo lugar. */
export const LIMITES = {
  imagenesPorPerfil: 10,
  rubrosPorPerfil: 2,
  subcategoriasPorPerfil: 4,
  ciudadesPorPerfil: 8,
} as const

export const perfilSchema = z.object({
  name: nombreSchema,
  type: z.enum(['PERSON', 'COMPANY']).default('PERSON'),

  // Empresa: campos condicionados por `type`.
  companyName: z.string().trim().max(120).optional().or(z.literal('')),
  tradeName: z.string().trim().max(120).optional().or(z.literal('')),
  cuit: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    // Validación de formato: 11 dígitos con prefijo de persona jurídica
    // (30, 33, 34). El dígito verificador se valida en services/ porque
    // requiere el algoritmo módulo 11, no una regex.
    .refine(
      (valor) => !valor || /^(30|33|34)\d{9}$/.test(valor),
      'El CUIT tiene que tener 11 dígitos y empezar con 30, 33 o 34',
    ),
  website: z.string().trim().url('Esa dirección web no es válida').optional().or(z.literal('')),

  // Matrícula: obligatoria solo si el rubro elegido la requiere. La
  // comprobación real depende del rubro, que viene del servidor, así que se
  // valida en services/.
  licenseNumber: z.string().trim().max(60).optional().or(z.literal('')),

  description: z
    .string()
    .trim()
    .min(20, 'Contá un poco más: al menos 20 caracteres')
    .max(600, 'La descripción es demasiado larga (máximo 600)'),

  baseCityId: z.string().cuid('Elegí tu ciudad'),
  coversWholeProvince: z.boolean().default(false),
})

export type PerfilInput = z.infer<typeof perfilSchema>

/**
 * Selección de rubros.
 *
 * Máximo 2 rubros con exactamente 1 principal. El conteo se valida con
 * refine en vez de con un schema aparte para que el error llegue al campo
 * exacto y no a un formulario entero.
 */
export const rubrosSchema = z
  .object({
    principal: z.string().cuid('Elegí tu rubro principal'),
    secundario: z.string().cuid().optional().or(z.literal('')),
    subcategorias: z
      .array(z.string().cuid())
      .max(LIMITES.subcategoriasPorPerfil, `Elegí hasta ${LIMITES.subcategoriasPorPerfil} subcategorías`)
      .default([]),
  })
  .refine(
    (datos) => !datos.secundario || datos.secundario !== datos.principal,
    'El rubro secundario tiene que ser distinto del principal',
  )

export type RubrosInput = z.infer<typeof rubrosSchema>

/** Zonas de cobertura. */
export const coberturaSchema = z.object({
  // La ciudad base se cuenta como cubierta automáticamente y no se manda acá.
  ciudades: z
    .array(z.string().cuid())
    .max(LIMITES.ciudadesPorPerfil, `Elegí hasta ${LIMITES.ciudadesPorPerfil} ciudades`)
    .default([]),
})

export type CoberturaInput = z.infer<typeof coberturaSchema>

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------

export const reporteSchema = z.object({
  profileId: z.string().cuid(),
  reason: z.enum(['DUDOSO', 'DATO_FALSO', 'CONTENIDO_INADECUADO', 'ESTAFO', 'OTRO']),
  detail: z.string().trim().max(500, 'Contá un poco más, hasta 500 caracteres').optional(),
})

export type ReporteInput = z.infer<typeof reporteSchema>