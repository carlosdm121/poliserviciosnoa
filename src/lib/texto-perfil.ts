/**
 * Validación del texto que escribe el profesional.
 *
 * La descripción es el único campo libre que un cliente lee antes de decidir a
 * quién escribe. Hay dos riesgos y se resuelven distinto:
 *
 * 1. **Contacto por fuera de la plataforma.** Un número, un link o un `@usuario`
 *    en la descripción esquivan el contacto por WhatsApp, que es lo que sostiene
 *    la suscripción. No es un problema moral: es el ingreso.
 * 2. **Acoso.** Amenazas, insultos o datos de terceros. Eso va a moderación y
 *    no se puede detectar con una lista corta de palabras.
 *
 * Solo se resuelve el primero acá. El segundo es del módulo de moderación.
 */

/**
 * Números de teléfono escondidos en texto.
 *
 * Regex deliberadamente tolerante: cubre los formatos argentinos con y sin el
 * 9, con separadores y con espacios. Un filtro estricto deja pasar
 * "3814-123456" y solo pilla "3814123456", que es la forma que el filtrador
 * normalmente busca y no la que se usa para esconderse.
 */
const TELEFONO = /(?:\+?\d[\d\s.-]{7,16}\d)/

/**
 * Direcciones web.
 *
 * Incluye las sin `www` ni esquema porque `poliservicios-noa.com.ar` es la
 * forma más usada. La pregunta que importa no es si es una web válida sino si
 * es una URL: en el 99% de los casos, una URL en la descripción es un contacto
 * por fuera.
 */
const URL = /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|ar|com\.ar|io|co)\b\S*/i

/** Usuarios de redes, sin el `@` cuando la plataforma lo pone pegado. */
const USUARIO = /(?:^|\s)@[A-Za-z0-9._]{4,}/

/** Caracteres de control y estilos que no tienen por qué estar en un texto. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/

/** Tope de longitud. Más largo no es mejor: nadie lo lee. */
export const MAXIMO_DESCRIPCION = 600

export type ResultadoTexto = {
  ok: boolean
  /** Mensaje para mostrarle al profesional, en su idioma. */
  problema?: 'CONTACTO_EXTERNO' | 'MUY_LARGA' | 'CORTO_DEMASIADO' | 'CARACTERES_INVALIDOS'
  /** Dónde se encontró el problema, para señalar el texto sin inventar nada. */
  detalle?: string
}

/**
 * Revisa la descripción.
 *
 * @param descripcion Texto crudo del formulario.
 * @param minimo Caracteres mínimos. La regla de publicación usa 20.
 */
export function revisarDescripcion(descripcion: string, minimo = 20): ResultadoTexto {
  const limpio = descripcion.trim()

  if (limpio.length < minimo) {
    return {
      ok: false,
      problema: 'CORTO_DEMASIADO',
      detalle: `Contá un poco más sobre tu trabajo. Con ${minimo} caracteres alcanza.`,
    }
  }

  if (limpio.length > MAXIMO_DESCRIPCION) {
    return {
      ok: false,
      problema: 'MUY_LARGA',
      detalle: `Escribí hasta ${MAXIMO_DESCRIPCION} caracteres. Tenés ${limpio.length}.`,
    }
  }

  if (CONTROL.test(limpio)) {
    return {
      ok: false,
      problema: 'CARACTERES_INVALIDOS',
      detalle: 'La descripción tiene caracteres que no se pueden mostrar.',
    }
  }

  // El orden importa: primero el contacto por fuera, porque es el motivo
  // real del filtro y el mensaje tiene que decirlo claro.
  const url = limpio.match(URL)
  if (url) {
    return {
      ok: false,
      problema: 'CONTACTO_EXTERNO',
      detalle: `Sacá "${url[0]}" de la descripción. Los clientes te escriben por acá, y si ven un link se van antes.`,
    }
  }

  const telefono = limpio.match(TELEFONO)
  if (telefono) {
    return {
      ok: false,
      problema: 'CONTACTO_EXTERNO',
      detalle: `Sacá el teléfono de la descripción (${telefono[0].trim()}). Ya lo tienen en tu perfil y se contactan por acá.`,
    }
  }

  const usuario = limpio.match(USUARIO)
  if (usuario) {
    return {
      ok: false,
      problema: 'CONTACTO_EXTERNO',
      detalle: `Sacá "${usuario[0].trim()}" de la descripción. Los clientes te escriben por acá.`,
    }
  }

  return { ok: true }
}

/**
 * Limpia el texto sin rechazarlo.
 *
 * Para los casos donde el contacto externo no motivo el rechazo y solo hay que
 * quitarlo: por ejemplo el nombre a mostrar, que a veces viene con un "@" por
 * costumbre de escribir en Instagram.
 */
export function limpiarTexto(texto: string): string {
  return texto
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAXIMO_DESCRIPCION)
}

/**
 * El texto tenía contacto externo. Útil para registrar la señal de riesgo sin
 * volver a correr el filtro completo.
 */
export function tieneContactoExterno(texto: string): boolean {
  const limpio = texto.trim()

  return URL.test(limpio) || TELEFONO.test(limpio) || USUARIO.test(limpio)
}