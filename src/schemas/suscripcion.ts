import { z } from 'zod'

import { PREFIJOS_PERSONA_HUMANA, digitoVerificador, validarCuit } from '@/lib/cuit'

/**
 * Validación de los datos fiscales.
 *
 * El mismo schema va en el formulario y en el server action. En el cliente para
 * marcar el campo sin hacer un request; en el servidor porque el cliente se
 * puede manipular y esta es la única frontera real.
 *
 * El documento es siempre CUIT o CUIL de 11 dígitos: no se acepta DNI. Para
 * personas humanas se valida con los prefijos 20, 23, 24, 25, 26 y 27, y para
 * empresas con `validarCuit`, que acepta 30, 33 y 34.
 */

export const TIPO_PERSONA_FISCAL = {
  PERSONA_HUMANA: 'PERSONA_HUMANA',
  EMPRESA: 'EMPRESA',
} as const

/**
 * Valores de la condición frente al IVA, como tupla.
 *
 * Es una tupla explícita y no un `as const` derivado de una lista de objetos
 * porque `z.enum` necesita una tupla de strings en tiempo de compilación. La
 * lista con el texto que ve el profesional sale de acá, no al revés: si el
 * select y el validador tuvieran dos fuentes, el formulario ofrecería una opción
 * que el servidor rechaza.
 */
export const CONDICION_IVA_VALORES = [
  'RESPONSABLE_INSCRIPTO',
  'RESPONSABLE_MONOTRIBUTO',
  'EXENTO',
  'LIBERADO',
  'CONSUMIDOR_FINAL',
] as const

/** Texto que ve el profesional en el select. */
export const CONDICIONES_IVA: Record<(typeof CONDICION_IVA_VALORES)[number], string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable inscripto',
  RESPONSABLE_MONOTRIBUTO: 'Responsable monotributo',
  EXENTO: 'Exento',
  LIBERADO: 'Liberado',
  CONSUMIDOR_FINAL: 'Consumidor final',
}

/**
 * Documento fiscal: CUIT o CUIL de 11 dígitos.
 *
 * La forma se acepta siempre; el prefijo se decide en el `superRefine` del
 * objeto completo, porque es una regla cruzada con `tipoPersona` y un `refine`
 * por campo no la puede ver.
 */
const documentoSchema = z
  .string()
  .trim()
  .min(1, 'Escribí tu CUIT o CUIL.')
  .transform((valor) => valor.replace(/\D/g, ''))
  .refine((valor) => valor.length === 11, {
    message: 'El CUIT o CUIL tiene 11 dígitos. Va como 20-12345678-6.',
  })

export const datosFiscalesSchema = z
  .object({
    tipoPersona: z.enum(['PERSONA_HUMANA', 'EMPRESA'], {
      errorMap: () => ({ message: 'Elegí si sos una persona o una empresa.' }),
    }),

    nombreORazonSocial: z
      .string()
      .trim()
      .min(3, 'Escribí tu nombre y apellido, o la razón social de la empresa.')
      .max(120, 'Ese nombre es demasiado largo.'),

    documento: documentoSchema,

    condicionIva: z.enum(CONDICION_IVA_VALORES, {
      errorMap: () => ({ message: 'Elegí tu condición frente al IVA.' }),
    }),

    /**
     * El mínimo no es arbitrario: "San Miguel" son diez caracteres y no es un
     * domicilio. Con ocho, el campo aceptaba el nombre de una ciudad suelta y el
     * comprobante salía con una dirección que no le sirve a nadie. Calle y número
     * entran en doce caracteres ("Belgrano 1234").
     */
    domicilioFiscal: z
      .string()
      .trim()
      .min(12, 'Escribí el domicilio fiscal completo: calle, número, localidad y provincia.')
      .max(200, 'Ese domicilio es demasiado largo.'),
  })
  .strict()
  .superRefine((valor, ctx) => {
    const esEmpresa = valor.tipoPersona === 'EMPRESA'
    const documento = valor.documento

    if (esEmpresa) {
      /**
       * Empresa sin excepción: CUIT con 30, 33 o 34 y dígito verificador
       * correcto. Se delega en `validarCuit`, que tiene el mensaje exacto para
       * el caso más común: alguien pega su CUIL de persona en el casillero de
       * empresa.
       */
      const resultado = validarCuit(documento)

      if (!resultado.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documento'],
          message:
            resultado.error ??
            'El CUIT de una empresa tiene que empezar con 30, 33 o 34 y el último dígito es el verificador.',
        })
      }

      return
    }

    /**
     * Persona humana: CUIL/CUIT con prefijo 20, 23, 24, 25, 26 o 27 y dígito
     * verificador correcto.
     */
    const prefijo = documento.slice(0, 2)

    if (!(PREFIJOS_PERSONA_HUMANA as readonly string[]).includes(prefijo)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento'],
        message: 'El CUIL de una persona tiene que empezar con 20, 23, 24, 25, 26 o 27.',
      })
      return
    }

    const esperado = digitoVerificador(documento)

    if (esperado === null || esperado !== Number(documento[10])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento'],
        message: `El CUIL no es válido. El último dígito debería ser ${esperado ?? '?'}, no ${documento[10]}.`,
      })
    }
  })

/**
 * Aceptación de los términos.
 *
 * `z.literal(true)` y no `z.boolean()`: un `true`Required que se pueda mandar
 * como `false` deja pasar el alta sin aceptación, y lo que se guarda después es
 * una fecha de aceptación que no ocurrió.
 */
export const aceptarTerminosSchema = z.object({
  aceptaTerminos: z.literal(true, {
    errorMap: () => ({ message: 'Necesitamos que aceptes las condiciones para cobrarte.' }),
  }),
})

export type DatosFiscalesInput = z.input<typeof datosFiscalesSchema>
export type DatosFiscales = z.output<typeof datosFiscalesSchema>
export type CondicionIvaValor = (typeof CONDICION_IVA_VALORES)[number]