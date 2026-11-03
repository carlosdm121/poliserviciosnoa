/**
 * Logger estructurado con redacción automática.
 *
 * Sale JSON y no texto libre por dos razones concretas:
 *
 * 1. Vercel y cualquier agregador de logs indexan por estructura. Con texto
 *    libre hay que filtrar con expresiones regulares para encontrar un error.
 * 2. Un `console.log(error)` en desarrollo se convierte en
 *    `console.log(error)` en producción sin que nadie lo note. Con un único
 *    punto de entrada, la redacción es imposible de saltear.
 *
 * La redacción no es una función que se acuerde de llamar: es el comportamiento
 * por defecto de este módulo. Un campo cuyo nombre está en la lista de
 * sensibles nunca sale en claro, ni por error ni por apuro.
 *
 * No lleva `import 'server-only'`: lo importan Server Actions, y esa directiva
 * rompe el build en los módulos que están del lado de una action (ver D9). La
 * protección real es que acá solo hay `console`, que existe de los dos lados y
 * no arrastra nada sensible al bundle.
 */

/** Campos cuyo valor se reemplaza por un marcador, sea cual sea el contenido. */
const CAMPOS_SENSIBLES = new Set([
  'email',
  'phone',
  'telefono',
  'whatsapp',
  'token',
  'authorization',
  'auth',
  'code',
  'codigo',
  'password',
  'secret',
  'apikey',
  'api_key',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'wamid',
  'cuit',
  'dni',
  'ip',
  'ipaddress',
])

/** Texto que reemplaza a cualquier valor sensible. */
const REDACTADO = '[redactado]'

/**
 * Detecta campos sensibles por nombre, aunque el que llama use otra variante.
 *
 * `actorEmail` y `phoneNumber` tienen que caerse igual que `email` y `phone`.
 * Comparar por igualdad exacta dejaría los huecos más obvios abiertos.
 */
function esCampoSensible(clave: string): boolean {
  const normalizada = clave.toLowerCase().replace(/[^a-z]/g, '')

  for (const sensible of CAMPOS_SENSIBLES) {
    if (normalizada.includes(sensible.replace(/[^a-z]/g, ''))) return true
  }

  return false
}

/**
 * Telefonos sueltos dentro de texto libre.
 *
 * Los campos con nombre conocido los tapa la lista. Esto tapa lo demás: un
 * número puede aparecer dentro del mensaje de error de una API de Meta o
 * dentro de una URL, donde no hay ningún nombre de campo que lo cubra.
 */
const TELEFONO_EN_TEXTO = /\+?\d[\d\s-]{8,16}\d/g

/**
 * Recorre un valor y redacta todo lo que deba, en cualquier profundidad.
 *
 * @param valor Cu cualquier cosa: string, número, objeto, array.
 * @param profundidad Límite de recursión para no quedar colgado con un ciclo.
 */
function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return '[profundo]'
  if (valor === null || valor === undefined) return valor

  if (typeof valor === 'string') {
    return valor.replace(TELEFONO_EN_TEXTO, (n) => enmascaraDigitos(n))
  }

  if (typeof valor === 'number' || typeof valor === 'boolean') return valor

  if (valor instanceof Date) return valor.toISOString()

  if (valor instanceof Error) {
    return { name: valor.name, message: redactar(valor.message, profundidad + 1) }
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => redactar(item, profundidad + 1))
  }

  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {}

    for (const [clave, dato] of Object.entries(valor)) {
      salida[clave] = esCampoSensible(clave) ? REDACTADO : redactar(dato, profundidad + 1)
    }

    return salida
  }

  return String(valor)
}

/** Deja los últimos dos dígitos, que son los que se usan para diagnosticar. */
function enmascaraDigitos(texto: string): string {
  const digitos = texto.replace(/\D/g, '')

  if (digitos.length < 4) return REDACTADO

  return `***${digitos.slice(-2)}`
}

type Nivel = 'debug' | 'info' | 'warn' | 'error'

const NIVELES: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Nivel mínimo que se escribe.
 *
 * En producción `debug` se descarta: un webhook de Meta genera dozens de líneas
 * por minuto y llenan el presupuesto de logs sin información útil.
 */
const NIVEL_MINIMO: Nivel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

function emitir(nivel: Nivel, mensaje: string, contexto?: Record<string, unknown>): void {
  if (NIVELES[nivel] < NIVELES[NIVEL_MINIMO]) return

  const linea = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    mensaje,
    ...(contexto ? (redactar(contexto) as Record<string, unknown>) : {}),
  })

  // `error` y `warn` van a stderr para que las plataformas los indexen
  // separados del ruido normal.
  if (nivel === 'error' || nivel === 'warn') {
    console.error(linea)
  } else {
    console.log(linea)
  }
}

export const logger = {
  debug: (mensaje: string, contexto?: Record<string, unknown>) => emitir('debug', mensaje, contexto),
  info: (mensaje: string, contexto?: Record<string, unknown>) => emitir('info', mensaje, contexto),
  warn: (mensaje: string, contexto?: Record<string, unknown>) => emitir('warn', mensaje, contexto),
  error: (mensaje: string, contexto?: Record<string, unknown>) => emitir('error', mensaje, contexto),
}

/**
 * Logger de los bordes HTTP: webhooks y rutas del simulador.
 *
 * El cuerpo crudo de un webhook puede contener un teléfono y un código, así que
 * no se loguea el body completo: solo lo que hace falta para debuggear, y
 * siempre pasando por la redacción.
 */
export function logWebhook(ruta: string, datos: Record<string, unknown>): void {
  logger.info('webhook recibido', { ruta, ...datos })
}