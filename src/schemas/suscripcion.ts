import { z } from 'zod'

import { digitoVerificador, validarCuit } from '@/lib/cuit'

/**
 * Validación de los datos fiscales.
 *
 * El mismo schema va en el formulario y en el server action. En el cliente para
 * marcar el campo sin hacer un request; en el servidor porque el cliente se
 * puede manipular y esta es la única frontera real.
 *
 * **Por qué hay un validador de CUIT propio y no `validarCuit` de `lib/cuit.ts`:**
 * ese módulo valida el CUIT de una **empresa** (obligatoriamente 33 o 34 al
 * principio) porque su único uso hasta ahora era el perfil de empresa. Acá hace
 * falta el CUIT de una persona humana (30) también, y el de monotributo es
 * justamente el caso más común del país. Reusar el de empresa rechazaría a la
 * mitad de los profesionales. Lo que sí se reusa es `digitoVerificador`, que es
 * el algoritmo y no la política.
 */

/** Prefijos válidos de CUIT: persona humana y las dos de persona jurídica. */
const PREFIJOS_CUIT = ['30', '33', '34'] as const

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
 * Documento fiscal: CUIT/CUIL de 11 dígitos o DNI de 8.
 *
 * La forma se acepta siempre; lo que depende de `tipoPersona` se decide en el
 * `superRefine` del objeto completo, porque es una regla cruzada entre dos
 * campos y un `refine` por campo no la puede ver.
 */
const documentoSchema = z
  .string()
  .trim()
  .min(1, 'Escribí tu CUIT o, si no tenés, tu DNI.')
  .transform((valor) => valor.replace(/\D/g, ''))
  .refine((valor) => valor.length === 11 || valor.length === 8, {
    message:
      'El CUIT tiene 11 dígitos (30-12345678-9) y el DNI tiene 8. Sin guiones son menos de lo que escribiste.',
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
       * Empresa sin excepción: CUIT con 33 o 34 y dígito verificador correcto.
       *
       * Acá se delega en `validarCuit`, que es el validador de empresa que ya
       * existe y ya tiene el mensaje exacto para el caso más común: alguien
       * pega su propio CUIT de persona humana en el casillero de empresa.
       */
      const resultado = validarCuit(documento)

      if (!resultado.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documento'],
          message:
            resultado.error ??
            'El CUIT de una empresa tiene que empezar con 33 o 34 y el último dígito es el verificador.',
        })
      }

      return
    }

    /**
     * Persona humana: CUIT (30) o DNI de 8 dígitos.
     *
     * El CUIT se valida con el dígito verificador como cualquier CUIT, pero se
     * acepta el prefijo 30 que `validarCuit` rechaza. El DNI no tiene dígito
     * verificador: son 8 dígitos y nada más, así que solo se verifica el largo.
     */
    if (documento.length === 11) {
      const prefijo = documento.slice(0, 2)

      if (!(PREFIJOS_CUIT as readonly string[]).includes(prefijo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documento'],
          message: 'Un CUIT tiene que empezar con 30 (persona), 33 o 34 (empresa).',
        })
        return
      }

      const esperado = digitoVerificador(documento)

      if (esperado === null || esperado !== Number(documento[10])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documento'],
          message: `El CUIT no es válido. El último dígito debería ser ${esperado ?? '?'}, no ${documento[10]}.`,
        })
      }
    }

    /**
     * `CONSUMIDOR_FINAL` con DNI tiene un problema que no se puede dejar pasar en
     * silencio: a un consumidor final sin CUIT no se le puede emitir una factura
     * A, y el contador lo va a rechazar. Se permite igual —el profesional decide
     * cómo factura— y queda anotado acá para que la interfaz pueda advertirlo.
     * El módulo de facturación (2.5) es el que tiene que manejar el caso.
     */
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