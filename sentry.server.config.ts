import * as Sentry from '@sentry/nextjs'

/**
 * Configuración de Sentry para el servidor de PoliserviciosNOA.
 *
 * El beforeSend redacta campos sensibles antes de enviar el evento a Sentry.
 * sendDefaultPii está en false para que no se envíen cookies ni datos de
 * sesión automáticamente.
 */

const CAMPOS_SENSIBLES = [
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
]

function esSensible(clave: string): boolean {
  const normalizada = clave.toLowerCase().replace(/[^a-z]/g, '')
  return CAMPOS_SENSIBLES.some((s) =>
    normalizada.includes(s.replace(/[^a-z]/g, '')),
  )
}

function redactar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor
  if (valor instanceof Date) return valor.toISOString()
  if (valor instanceof Error) {
    return { name: valor.name, message: String(valor.message) }
  }
  if (Array.isArray(valor)) return valor.map(redactar)
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {}
    for (const [clave, dato] of Object.entries(valor)) {
      salida[clave] = esSensible(clave) ? '[redactado]' : redactar(dato)
    }
    return salida
  }
  return String(valor)
}

const beforeSend = (event: unknown, _hint: unknown): unknown => {
  const evt = event as Sentry.Event & { extra?: Record<string, unknown> }

  // Redactar headers de la request
  if (evt.request && typeof evt.request === 'object') {
    const headers = evt.request.headers
    if (headers && typeof headers === 'object') {
      for (const clave of Object.keys(headers as Record<string, unknown>)) {
        if (esSensible(clave)) {
          ;(headers as Record<string, string>)[clave] = '[redactado]'
        }
      }
    }
  }

  // Redactar extra
  if (evt.extra && typeof evt.extra === 'object') {
    for (const [clave, dato] of Object.entries(evt.extra)) {
      evt.extra[clave] = esSensible(clave)
        ? '[redactado]'
        : redactar(dato)
    }
  }

  // Teléfonos sueltos en strings libres.
  const textoTelefono = /\+?\d[\d\s-]{8,16}\d/g
  function enmascararStrings(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return obj.replace(textoTelefono, (n) => {
        const d = n.replace(/\D/g, '')
        return d.length < 4 ? '[redactado]' : `***${d.slice(-2)}`
      })
    }
    if (Array.isArray(obj)) return obj.map(enmascararStrings)
    if (obj && typeof obj === 'object') {
      const salida: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        salida[k] = enmascararStrings(v)
      }
      return salida
    }
    return obj
  }

  evt.extra = enmascararStrings(evt.extra ?? {}) as Record<string, unknown>

  return evt
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version,
  tracesSampleRate:
    process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend: beforeSend as Parameters<typeof Sentry.init>[0]['beforeSend'],
  ignoreErrors: [
    'NextRouterError',
    'RouteNotFoundError',
    'Network Error',
    'Failed to fetch',
    'Non-Error promise rejection captured',
    'Extension context invalidated',
  ],
})

export default Sentry
