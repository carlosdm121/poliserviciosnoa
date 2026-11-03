/**
 * Sanitización de contenido de usuario (punto 15 del módulo 6.1).
 *
 * Reglas:
 * - Texto plano por defecto. Nunca `dangerouslySetInnerHTML` con datos de usuario.
 * - Descripciones: sin HTML, sin enlaces ni teléfonos externos.
 * - JSON-LD: escapar "<" para que no cierre el <script>.
 * - URLs de usuario: solo http/https, con rel="noopener noreferrer nofollow ugc".
 * - Emails: escapar HTML en plantillas y prevenir inyección de cabeceras
 *   (sin saltos de línea en asunto ni destinatario).
 * - Exportaciones CSV: prevenir CSV injection.
 */

/**
 * Escapa `<` y `>` para uso dentro de JSON-LD (<script type="application/ld+json">).
 * Evita que un atacante cierre la etiqueta <script> e inyecte JS.
 */
export function escaparJsonLd(texto: string): string {
  return texto.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

/**
 * Valida que una URL de usuario sea http o https.
 * Devuelve null si no es válida.
 */
export function validarUrlUsuario(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Genera el atributo rel para enlaces de usuario (sitios web de perfiles).
 * Los enlaces de usuario nunca deben transmitir referrer ni ser seguidos por motores.
 */
export const REL_USUARIO = 'noopener noreferrer nofollow ugc'

/**
 * Valida que un valor no contenga saltos de línea, para prevenir inyección de
 * cabeceras de email (CRLF injection) en asunto y destinatario.
 */
export function esCabeceraEmailSegura(valor: string): boolean {
  return !/[\r\n]/.test(valor)
}

/**
 * Escapa HTML básico para renderizar texto de usuario de forma segura.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Previene CSV injection en exportaciones.
 * Los valores que empiezan con =, +, - o @ se prefijan con comilla simple para
 * que Excel/LibreOffice no los interpreten como fórmulas.
 */
export function escaparCsv(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return ''

  const str = String(valor)

  if (/^[=+\-@]/.test(str)) {
    return `'` + str
  }

  // Si el valor contiene comillas, comas o saltos de línea, envolver en comillas
  // y escapar las comillas internas duplicándolas.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}
