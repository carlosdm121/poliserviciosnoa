import { z } from 'zod'

/**
 * Variables de entorno validadas al importar.
 *
 * El motivo de validarlas acá y no en cada uso: si falta una clave, la
 * aplicación tiene que fallar al arrancar y decir cuál falta. Un `undefined`
 * que aparece recién cuando el usuario intenta pagar es un error de
 * producción; un fallo de arranque es un error de desarrollo, que es donde
 * se arregla.
 *
 * Para que el build de Vercel no corte por variables que solo se usan en
 * runtime (webhooks), se marca el prefijo `SERVER_` como opcional.
 */

/** Lista de secretos que NUNCA pueden tener prefijo NEXT_PUBLIC_. */
const SECRETOS_SERVIDOR = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'RESEND_API_KEY',
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'CLOUDINARY_API_SECRET',
  'UPSTASH_REDIS_REST_TOKEN',
  'PHONE_HASH_PEPPER',
  'CRON_SECRET',
  'DATA_ENCRYPTION_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'ARCA_ACCESS_TOKEN',
  'SENTRY_DSN',
] as const

/**
 * Valida que ninguna variable secreta tenga prefijo NEXT_PUBLIC_.
 *
 * NEXT_PUBLIC_ inyecta el valor en el bundle del cliente. Si un secreto
 * (API key, token, pepper, secreto de webhook) llega al cliente, cualquier
 * visitante puede leerlo desde el código fuente de la página.
 */
function verificarNoSecretosPublicos(): void {
  for (const secreto of SECRETOS_SERVIDOR) {
    const clavePublica = `NEXT_PUBLIC_${secreto}`
    if (process.env[clavePublica] !== undefined && process.env[clavePublica] !== '') {
      throw new Error(
        `Variable de entorno "${clavePublica}" detectada: "${secreto}" es un secreto ` +
          `y nunca debe tener prefijo NEXT_PUBLIC_.`,
      )
    }
  }
}

/** Convierte un string de env a número y falla si no es un número válido. */
function numeric(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    throw new Error(`Variable de entorno inválida: se esperaba un número y se recibió "${value}"`)
  }
  return parsed
}

/**
 * Lee el tipo de comprobante tolerando un valor mal escrito.
 *
 * Un error de tipeo en una variable de entorno no puede tumbar el arranque de
 * la app entera (a diferencia de una clave faltante): se cae al tipo C, que es
 * el que corresponde a monotributo y el que menos riesgo fiscal tiene.
 */
function leerTipoComprobante(value: string | undefined): 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C' ? value : 'C'
}

/** Variables requeridas sin las cuales la app no puede funcionar. */
const servidorObligatorio = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET es obligatoria. Generala con: openssl rand -base64 32'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL debe ser una URL válida'),

  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY es obligatoria'),

  MP_ACCESS_TOKEN: z.string().min(1, 'MP_ACCESS_TOKEN es obligatoria'),
  MP_WEBHOOK_SECRET: z.string().min(1, 'MP_WEBHOOK_SECRET es obligatoria'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME es obligatoria'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY es obligatoria'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET es obligatoria'),

  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL debe ser una URL válida'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN es obligatoria'),

  PHONE_HASH_PEPPER: z
    .string()
    .min(32, 'PHONE_HASH_PEPPER debe tener al menos 32 caracteres. Generala con: openssl rand -hex 32'),

  DATA_ENCRYPTION_KEY: z
    .string()
    .min(1, 'DATA_ENCRYPTION_KEY es obligatoria. Generala con: openssl rand -base64 32'),

  CRON_SECRET: z.string().min(1, 'CRON_SECRET es obligatoria'),
})

const parsed = servidorObligatorio.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  PHONE_HASH_PEPPER: process.env.PHONE_HASH_PEPPER,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
})

if (!parsed.success) {
  const faltantes = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(
    `Faltan variables de entorno requeridas o son inválidas:\n${faltantes.join('\n')}\n\n` +
      'Copiá .env.example a .env y completá los valores.',
  )
}

/** Falla al arrancar si algún secreto tiene prefijo NEXT_PUBLIC_. */
verificarNoSecretosPublicos()

const server = parsed.data

export const env = {
  ...server,

  emailFrom: process.env.EMAIL_FROM ?? 'PoliserviciosNOA <no-reply@poliserviciosnoa.com>',

  /**
   * Casilla donde caen los reclamos del libro de quejas.
   *
   * Es una casilla leída por una persona, no un alias de sistema. Tiene que ser
   * una dirección que alguien mire: una queja guardada solo en la base es una
   * queja que nadie contestó.
   */
  contactEmail: process.env.CONTACT_EMAIL ?? 'contacto@poliserviciosnoa.com',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },

  subscription: {
    // El monto nunca se hardcodea en el código: suben los precios y tener que
    // tocar el checkout para cambiar el número es una fuente de errores.
    amount: numeric(process.env.SUBSCRIPTION_AMOUNT, 10000),
    currency: process.env.SUBSCRIPTION_CURRENCY ?? 'ARS',
  },

  whatsapp: {
    // Número de la plataforma, en E.164 sin signos: es el destino del mensaje
    // de verificación y va en el enlace wa.me que ve el profesional.
    platformNumber: process.env.WHATSAPP_PLATFORM_NUMBER ?? '',
    phoneId: process.env.WHATSAPP_PLATFORM_PHONE_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',

    /** Minutos de vida del código de verificación. */
    codeMinutes: numeric(process.env.WHATSAPP_CODE_MINUTES, 15),

    /** Intentos fallidos antes de bloquear la verificación. */
    maxAttempts: numeric(process.env.WHATSAPP_MAX_ATTEMPTS, 5),
  },

  /**
   * Pepper del hash HMAC de teléfonos y códigos.
   *
   * Obligatorio y sin valor por defecto: con un pepper inventado en el código,
   * todos los hashes quedan atados a ese valor y cambiarlo invalida la base
   * entera. Validado arriba como obligatoria justamente para que no se pueda
   * rellenar con un string cualquiera.
   */
  phoneHashPepper: server.PHONE_HASH_PEPPER,

  upstash: {
    redisUrl: process.env.UPSTASH_REDIS_REST_URL ?? '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  },

  vote: {
    minHoursAfterContact: numeric(process.env.VOTE_MIN_HOURS_AFTER_CONTACT, 24),
  },

  payment: {
    graceDays: numeric(process.env.PAYMENT_GRACE_DAYS, 2),
  },

  /**
   * Facturación electrónica (ARCA, ex AFIP) vía Afip SDK.
   *
   * Afip SDK gestiona el Ticket de Acceso (WSAA) por nosotros: solo hace falta
   * el access token del panel. `real` es una bandera explícita, igual que
   * `MP_REAL` (D27): sin ella, todo va al mock y nunca se emite un comprobante
   * fiscal de verdad por accidente.
   */
  arca: {
    real: process.env.ARCA_REAL === '1',
    /** Base de la API. No incluye `/afip/...`. */
    apiUrl: process.env.ARCA_API_URL ?? 'https://app.afipsdk.com/api/v1',
    accessToken: process.env.ARCA_ACCESS_TOKEN ?? '',
    environment: process.env.ARCA_ENVIRONMENT === 'prod' ? 'prod' : 'dev',
    cuit: process.env.ARCA_CUIT ?? '',
    razonSocial: process.env.ARCA_RAZON_SOCIAL ?? 'PoliserviciosNOA',
    puntoVenta: numeric(process.env.ARCA_PUNTO_VENTA, 1),
    tipoComprobante: leerTipoComprobante(process.env.ARCA_TIPO_COMPROBANTE),
    condicionIvaEmisor: process.env.ARCA_CONDICION_IVA_EMISOR ?? 'RESPONSABLE_MONOTRIBUTO',
    alicuotaIva: numeric(process.env.ARCA_ALICUOTA_IVA, 21),
    descripcion: process.env.ARCA_DESCRIPCION ?? 'Suscripción mensual PoliserviciosNOA',
    /** Intentos de la cola antes de dejar la factura para revisión manual. */
    maxAttempts: numeric(process.env.ARCA_MAX_ATTEMPTS, 10),
  },

  emailCostUsd: numeric(process.env.EMAIL_COST_USD, 0.0003),
} as const

export type Env = typeof env