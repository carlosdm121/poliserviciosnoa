/**
 * Normalización de números de WhatsApp a E.164 canónico.
 *
 * Módulo sin dependencias, importable desde el cliente: el formulario muestra
 * el número ya normalizado mientras se escribe, y arrastrar Prisma o Zod al
 * bundle del cliente rompería el presupuesto de performance (ver D8).
 *
 * Formato de salida: 5493811234567
 *   54  país
 *   9   marca de móvil (los fijos no lo llevan)
 *   381 código de área
 *   1234567 número
 *
 * Argentina es ambigua: la misma persona escribe 3811234567, 543811234567,
 * 0381 15-1234567, +54 9 381 123-4567 o (381) 15-1234567. Sin normalizar, son
 * cinco cuentas distintas y el índice único de número no protege nada.
 *
 * El hash HMAC del número NO vive acá: necesita `node:crypto` y el pepper del
 * entorno. Está en `src/lib/hash.ts`, que sí es de servidor.
 */

/** Códigos de área válidos de Argentina (3 dígitos). */
const CODIGOS_AREA = new Set([
  '220', '221', '223', '230', '236', '237', '249',
  '260', '261', '263', '264', '266', '280', '291', '294', '297', '298', '299',
  '336', '341', '342', '343', '345', '348', '351', '353', '358', '362', '364',
  '370', '376', '379', '380', '381', '383', '385', '387', '388',
])

/** Capital Federal usa 2 dígitos de área y 8 de número. */
const AREA_CABA = '11'

/**
 * Normaliza a E.164, o devuelve `null` si no es un móvil argentino plausible.
 *
 * `null` y no una excepción: el caller es un formulario, y "el usuario se
 * Tecleó mal el número" es un resultado esperado del flujo, no un error de
 * programa. Quien necesite mostrar un mensaje usa `explicarTelefonoInvalido`.
 */
export function normalizarWhatsapp(entrada: string): string | null {
  // Letras significan que el número no es un número. Un profesional que
  // escribe "381 4123456 Juan" quiere otra cosa y hay que preguntárselo, no
  // adivinar qué se quiso escribir. Espacios, guiones y paréntesis sí se
  // permiten: son formatos de escritura, no basura.
  if (/[A-Za-z]/.test(entrada)) return null

  let d = entrada.replace(/\D/g, '')

  if (d.length < 10) return null

  // Prefijo internacional 00.
  if (d.startsWith('00')) d = d.slice(2)

  // El 0 de trunk nunca viaja en formato internacional.
  if (d.startsWith('0')) d = d.slice(1)

  // Ya canónico.
  if (d.length === 13 && d.startsWith('549')) {
    return esNumeroLocalValido(d.slice(3)) ? d : null
  }

  // 54 + 10 dígitos: móvil sin el 9. Es la forma que entrega Meta a veces.
  if (d.length === 12 && d.startsWith('54')) {
    const resto = d.slice(2)
    return esNumeroLocalValido(resto) ? `549${resto}` : null
  }

  // 9 + 10 dígitos.
  if (d.length === 11 && d.startsWith('9')) {
    const resto = d.slice(1)
    return esNumeroLocalValido(resto) ? `549${resto}` : null
  }

  // "15" adelante del número local: 153814123456. El 15 fue el prefijo móvil
  // histórico y hoy está prohibido, pero la gente lo sigue escribiendo.
  if (d.length === 12 && d.startsWith('15')) {
    const resto = d.slice(2)
    return esNumeroLocalValido(resto) ? `549${resto}` : null
  }

  // Área y "15" en el medio: 381154123456. Es la forma más común cuando el
  // número viene de un contacto guardado, porque muchos teléfonos siguen
  // guardando el 15.
  if (d.length === 12 && d.slice(3, 5) === '15') {
    const resto = `${d.slice(0, 3)}${d.slice(5)}`
    return esNumeroLocalValido(resto) ? `549${resto}` : null
  }

  // Número local de 10 dígitos: 3814123456.
  if (d.length === 10) {
    return esNumeroLocalValido(d) ? `549${d}` : null
  }

  // Número local de 8 dígitos (CABA): 114123456.
  if (d.length === 8) {
    return `549${AREA_CABA}${d}`
  }

  // Cualquier otra longitud es un error de tipeo o un número de otro país.
  return null
}

/**
 * Valida código de área y número local.
 *
 * El código de área se contrasta contra la lista real de Argentina porque sin
 * ese chequeo un fijos de Buenos Aires ("1141234567") se cuela como si fuera
 * un móvil de un área inexistente (114).
 *
 * Lo que NO se puede distinguir sin libphonenumber-js es un fijo de 7 dígitos
 * que comparte prefijo con un móvil (381 4xxxxxx). El prompt exige aceptar
 * "381 4123456" como válido, así que no se filtra por prefijo de suscriptor.
 * El filtro real de fijos es que el contacto es por WhatsApp: si ese número
 * no tiene WhatsApp, el profesional se queda sin verificar y lo ve en pantalla.
 */
function esNumeroLocalValido(areaYNumeracion: string): boolean {
  if (areaYNumeracion.length === 9) {
    // 2 dígitos de área (CABA) + 8 de número.
    return areaYNumeracion.startsWith(AREA_CABA)
  }

  if (areaYNumeracion.length !== 10) return false

  const area = areaYNumeracion.slice(0, 3)
  const numero = areaYNumeracion.slice(3)

  if (!CODIGOS_AREA.has(area)) return false

  // El número local tiene 7 dígitos y no puede empezar por 0 (queda reservado).
  return numero.length === 7 && !numero.startsWith('0')
}

/**
 * Variantes con las que puede aparecer el mismo número.
 *
 * Meta entrega a veces el remitente con el 9 (5493811234567) y a veces sin él
 * (543811234567), según cómo el número quedó registrado en la cuenta. Comparar
 * solo contra una de las dos formas hace que la verificación falle con el
 * mismo número, y el profesional no entiende por qué.
 *
 * Se comparan SIEMPRE contra estas variantes, nunca contra el E.164 pelado.
 */
export function variantesTelefono(e164: string): string[] {
  const variantes = new Set<string>([e164])

  if (e164.startsWith('549') && e164.length === 13) {
    variantes.add(`54${e164.slice(3)}`)
  } else if (e164.startsWith('54') && e164.length === 12) {
    variantes.add(`549${e164.slice(2)}`)
  }

  return [...variantes]
}

/** ¿Son el mismo número, más allá del 9? */
export function mismoTelefono(a: string, b: string): boolean {
  const variantes = variantesTelefono(a)
  return variantesTelefono(b).some((v) => variantes.includes(v))
}

/** Formato legible: +54 9 381 123-4567. Solo para mostrar. */
export function formatearWhatsapp(e164: string): string {
  if (e164.length === 13 && e164.startsWith('549')) {
    const area = e164.slice(3, 6)
    const numero = e164.slice(6)
    return `+54 9 ${area} ${numero.slice(0, 3)}-${numero.slice(3)}`
  }

  if (e164.length === 12 && e164.startsWith('54')) {
    return `+54 ${e164.slice(2, 5)} ${e164.slice(5, 8)}-${e164.slice(8)}`
  }

  return `+${e164}`
}

/**
 * Versión enmascarada para la UI y los logs: +54 9 381 ***-**56.
 *
 * El logger redacciona los campos marcados como sensibles, pero un teléfono que
 * aparece dentro de un mensaje libre (un `details` de un error de Meta, por
 * ejemplo) no pasa por ninguna clave conocida. Enmascarar en el punto de
 * lectura evita tener que confiar en que alguien se acuerde de hacerlo.
 */
export function enmascararTelefono(e164: string): string {
  if (e164.length < 4) return '***'

  const ultimos = e164.slice(-2)
  const base = e164.startsWith('549') ? `+54 9 ${e164.slice(3, 6)}` : `+${e164.slice(0, 3)}`

  return `${base} ***-**${ultimos}`
}

/**
 * Explica por qué un número fue rechazado, en palabras que el usuario entienda.
 *
 * El formulario no puede decir "E.164 inválido": el usuario no sabe qué es eso.
 */
export function explicarTelefonoInvalido(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '')

  if (digitos.length === 0) {
    return 'Escribí tu número de WhatsApp, sin espacios ni signos.'
  }

  if (digitos.length < 10) {
    return 'Ese número está incompleto. Cargalo como 3814123456.'
  }

  return 'Ese número no parece un celular de Argentina. Revisá el código de área.'
}