/**
 * Protección contra bots (punto 12 del módulo 6.1).
 *
 * Tres capas:
 * 1. Cloudflare Turnstile (o hCaptcha): token verificado en el servidor
 *    mediante siteverify, secreto en variables de entorno, de un solo uso.
 * 2. Campo trampa (honeypot): campo oculto que los bots rellenan y los
 *    humanos no.
 * 3. Tiempo mínimo de envío: si el formulario se envía demasiado rápido,
 *    es probable que sea un bot.
 *
 * Los endpoints que requieren captcha: registro, login después de 3 fallos,
 * enlace mágico, recuperación de contraseña, soporte, reportes y reclamos.
 * /api/contacto/[slug] no lleva captcha (es una redirección): se protege con
 * rate limiting. Los webhooks quedan fuera del captcha y se protegen con su
 * firma.
 */

import { env } from '@/lib/env'

/** Tiempo mínimo entre la carga del formulario y el envío (segundos). */
export const TIEMPO_MINIMO_ENVIO_SEGUNDOS = 3

/** Nombre del campo trampa (honeypot). Debe ocultarse con CSS a los humanos. */
export const CAMPO_TRAMPA = 'confirmar_email'

/**
 * Resultado de la verificación de captcha.
 */
export type ResultadoCaptcha = {
  /** ¿El envío parece legítimo (no es bot)? */
  valido: boolean
  /** Motivo de rechazo si no es válido. */
  motivo?: string
}

/**
 * Verifica un token de Turnstile/hCaptcha con el servidor del proveedor.
 *
 * El token se verifica SIEMPRE en el servidor con el secreto en variables de
 * entorno, es de un solo uso y falla cerrado.
 *
 * @param token Token del cliente (Turnstile o hCaptcha).
 * @param ip Dirección IP del cliente (para el sitio remoto).
 * @returns ResultadoCaptcha.
 */
export async function verificarCaptcha(
  token: string | null | undefined,
  ip: string | null | undefined,
): Promise<ResultadoCaptcha> {
  // Si no hay captcha configurado, no bloquear (modo desarrollo o sin proveedor).
  const secreto = process.env.TURNSTILE_SECRET ?? ''
  const siteVerifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

  if (!token) {
    return { valido: false, motivo: 'Falta el token de verificación de bots.' }
  }

  try {
    const respuesta = await fetch(siteVerifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secreto || '',
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    })

    const json = (await respuesta.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }

    if (!json.success) {
      return {
        valido: false,
        motivo: 'Token de verificación de bots inválido.',
      }
    }

    return { valido: true }
  } catch {
    // Si el proveedor de captcha no responde, fallar cerrado (no dejar pasar bots).
    return { valido: false, motivo: 'No se pudo verificar la protección contra bots.' }
  }
}

/**
 * Valida el campo trampa (honeypot). Si tiene valor, es un bot.
 *
 * @param valor Valor del campo trampa enviado por el cliente.
 * @returns ResultadoCaptcha.
 */
export function validarHoneypot(valor: string | null | undefined): ResultadoCaptcha {
  if (valor !== null && valor !== undefined && valor.trim() !== '') {
    return { valido: false, motivo: 'Campo no permitido detectado.' }
  }
  return { valido: true }
}

/**
 * Valida que haya transcurrido el tiempo mínimo desde la carga del formulario.
 *
 * @param timestampInicio Marca de tiempo (ISO) cuando se cargó el formulario.
 * @returns ResultadoCaptcha.
 */
export function validarTiempoMinimo(
  timestampInicio: string | null | undefined,
): ResultadoCaptcha {
  if (!timestampInicio) {
    return { valido: false, motivo: 'Falta la marca de tiempo del formulario.' }
  }

  const inicio = Date.parse(timestampInicio)
  if (Number.isNaN(inicio)) {
    return { valido: false, motivo: 'Marca de tiempo inválida.' }
  }

  const transcurrido = (Date.now() - inicio) / 1000
  if (transcurrido < TIEMPO_MINIMO_ENVIO_SEGUNDOS) {
    return {
      valido: false,
      motivo: 'El formulario se envió demasiado rápido.',
    }
  }

  return { valido: true }
}

/**
 * Ejecuta todas las verificaciones de bot y devuelve el primer fallo.
 *
 * @param token Token de captcha (puede ser null si no se requiere).
 * @param ip IP del cliente.
 * @param honeypotValor Valor del campo trampa.
 * @param timestampInicio Marca de tiempo de carga del formulario.
 * @param requiereCaptcha Si es falso, se salta la verificación de captcha.
 */
export async function validarBots({
  token,
  ip,
  honeypotValor,
  timestampInicio,
  requiereCaptcha = false,
}: {
  token?: string | null
  ip?: string | null
  honeypotValor?: string | null
  timestampInicio?: string | null
  requiereCaptcha?: boolean
}): Promise<ResultadoCaptcha> {
  // 1. Campo trampa.
  const honeypot = validarHoneypot(honeypotValor)
  if (!honeypot.valido) return honeypot

  // 2. Tiempo mínimo de envío.
  const tiempo = validarTiempoMinimo(timestampInicio)
  if (!tiempo.valido) return tiempo

  // 3. Captcha (solo si se requiere).
  if (requiereCaptcha) {
    return verificarCaptcha(token, ip)
  }

  return { valido: true }
}
