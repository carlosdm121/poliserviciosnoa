/**
 * Validación de CUIT.
 *
 * Módulo sin dependencias: se usa en el formulario y en el servidor.
 *
 * El CUIT es 11 dígitos: los dos primeros indican el tipo de persona y los
 * nueve siguientes son el número, con un dígito verificador al final calculado
 * módulo 11. Las personas jurídicas usan 30, 33 o 34; las personas humanas
 * usan 20, 23, 24, 25, 26 o 27.
 */

/** Prefijos de persona jurídica: 30, 33 y 34. */
const PREFIJOS_PERSONA_JURIDICA = ['30', '33', '34'] as const

/** Prefijos de persona humana (CUIL): 20, 23, 24, 25, 26 y 27. */
export const PREFIJOS_PERSONA_HUMANA = ['20', '23', '24', '25', '26', '27'] as const

/** Pesos del algoritmo módulo 11 con multiplicadores cíclicos 2..7. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

export type ResultadoCuit = {
  ok: boolean
  /** CUIT sin guiones, en mayúsculas. `null` si no es válido. */
  cuit: string | null
  error?: string
}

/**
 * Normaliza un CUIT quitando guiones, espacios y puntos.
 *
 * Acepta `30-12345678-9`, `30 12345678 9` y `30123456789`: la gente lo copia de
 * formatos distintos y no va a escribirlo siempre igual.
 */
export function normalizarCuit(entrada: string): string {
  return entrada.replace(/\D/g, '')
}

/**
 * Valida un CUIT de persona jurídica.
 *
 * @param entrada El CUIT como lo escribió la persona.
 * @returns `cuit` normalizado si es válido, con un mensaje que se puede mostrar
 *   tal cual si no.
 */
export function validarCuit(entrada: string): ResultadoCuit {
  const cuit = normalizarCuit(entrada)

  if (cuit.length === 0) {
    return { ok: false, cuit: null, error: 'Escribí el CUIT de la empresa.' }
  }

  if (cuit.length !== 11) {
    return {
      ok: false,
      cuit: null,
      error: `El CUIT tiene 11 dígitos. Va como 30-12345678-9 (sin guiones son ${cuit.length}).`,
    }
  }

  const prefijo = cuit.slice(0, 2)

  if (!PREFIJOS_PERSONA_JURIDICA.includes(prefijo as (typeof PREFIJOS_PERSONA_JURIDICA)[number])) {
    return {
      ok: false,
      cuit: null,
      error: (PREFIJOS_PERSONA_HUMANA as readonly string[]).includes(prefijo)
        ? 'Ese CUIT es de una persona humana (CUIL). Si sos empresa, usá el CUIT con 30, 33 o 34 al principio.'
        : 'El CUIT de una empresa tiene que empezar con 30, 33 o 34.',
    }
  }

  const digitoEsperado = digitoVerificador(cuit)

  if (digitoEsperado === null) {
    return { ok: false, cuit: null, error: 'No pudimos leer ese CUIT. Revisá los dígitos.' }
  }

  const digitoIngresado = Number(cuit[10] ?? '')

  if (digitoIngresado !== digitoEsperado) {
    return {
      ok: false,
      cuit: null,
      error: `El CUIT no es válido. El último dígito debería ser ${digitoEsperado}, no ${digitoIngresado}.`,
    }
  }

  return { ok: true, cuit }
}

/**
 * Dígito verificador módulo 11.
 *
 * Se suman los 10 primeros dígitos multiplicados por pesos cíclicos 5,4,3,2,
 * 7,6,5,4,3,2. El resto de dividir por 11:
 *
 * - 0 → el dígito es 0
 * - 1 → el dígito es 9
 * - resto ≥ 2 → el dígito es 11 - resto
 *
 * El caso especial del resto 1 (dígito 9) es el que más se olvida en las
 * implementaciones, y es el que hace fallar la validación de un 10% de los
 * CUITs reales.
 *
 * @param cuit 11 dígitos, sin validar.
 * @returns El dígito esperado, o `null` si la entrada no tiene 11 dígitos.
 */
export function digitoVerificador(cuit: string): number | null {
  const limpio = normalizarCuit(cuit)

  if (limpio.length !== 11) return null

  let suma = 0

  for (let i = 0; i < PESOS.length; i++) {
    suma += Number(limpio[i] ?? 0) * (PESOS[i] ?? 0)
  }

  const resto = suma % 11

  if (resto === 0) return 0
  if (resto === 1) return 9

  return 11 - resto
}

/** Formato legible: 30-12345678-9. */
export function formatearCuit(cuit: string): string {
  const limpio = normalizarCuit(cuit)

  if (limpio.length !== 11) return limpio

  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`
}

/**
 * ¿Es un CUIT de persona jurídica?
 *
 * Versión booleana para chequeos internos donde el mensaje ya se dio.
 */
export function esCuitEmpresa(entrada: string): boolean {
  return validarCuit(entrada).ok
}