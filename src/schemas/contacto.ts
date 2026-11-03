import { z } from 'zod'

import { explicarTelefonoInvalido, normalizarWhatsapp } from '@/lib/phone'

/**
 * Schemas de contacto.
 *
 * `normalizarWhatsapp` vive en `lib/phone.ts` sin dependencias para que el
 * formulario de cliente pueda previsualizar el número mientras se escribe sin
 * arrastrar Zod al bundle.
 */

/**
 * Schema de WhatsApp listo para usar en formularios.
 *
 * Valida y normaliza en un solo paso: el cliente recibe el error en su idioma
 * y el servidor recibe siempre el mismo formato, sin importar de dónde venga.
 */
export const whatsappSchema = z
  .string()
  .trim()
  .min(1, 'Escribí tu número de WhatsApp')
  .transform((valor, ctx) => {
    const normalizado = normalizarWhatsapp(valor)
    if (!normalizado) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: explicarTelefonoInvalido(valor),
      })
      return z.NEVER
    }
    return normalizado
  })

/**
 * Schema de email en minúsculas.
 *
 * El minúsculas no es cosmético: la base tiene índice único sobre email y
 * "Ana@Mail.com" y "ana@mail.com" son cuentas distintas para Postgres pero la
 * misma para la persona. Sin normalizar, el mismo usuario se registra dos
 * veces.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Escribí tu email')
  .email('Ese email no parece válido')
  .max(255, 'El email es demasiado largo')

export const nombreSchema = z
  .string()
  .trim()
  .min(2, 'Escribí tu nombre')
  .max(80, 'El nombre es demasiado largo')

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña necesita al menos 10 caracteres')
  .max(72, 'La contraseña es demasiado larga') // bcrypt trunca a 72 bytes