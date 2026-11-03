'use server'

import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'

import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { whatsappSchema } from '@/schemas/contacto'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'
import { solicitarCodigo } from '@/services/verificacion-whatsapp'

/**
 * Acciones de verificación de WhatsApp del panel.
 *
 * `"use server"` arriba del archivo es obligatorio: sin la directiva Next.js
 * trata el módulo como común y lo mete en el bundle del cliente, arrastrando
 * Prisma al navegador (ver `decisions.md` D8). Por eso tampoco lleva
 * `import 'server-only'`: rompería el build justo acá (ver D9).
 */

/** Lo que la UI necesita después de pedir un código. */
export type RespuestaSolicitarCodigo = {
  codigo: string
  expiraEnIso: string
  /** Enlace wa.me con el texto ya escrito, para que el profesional solo toque enviar. */
  enlaceWhatsApp: string
  /** Número de la plataforma, para mostrarlo en las instrucciones. */
  numeroPlataforma: string
  nombrePagina: string
}

/**
 * Pide un código de verificación.
 *
 * El código se devuelve al navegador porque el profesional tiene que leerlo y
 * escribirlo en WhatsApp: no hay forma de que un código generado en el servidor
 * llegue a otro lado. Es un token de un solo uso, con 15 minutos de vida y que
 * solo sirve desde el mismo número, así que exponerlo en la respuesta no
 * habilita nada que no estuviera ya habilitado para quien está autenticado.
 */
export async function pedirCodigoWhatsApp(
  telefono: string,
): Promise<Resultado<RespuestaSolicitarCodigo>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  // El servidor revalida: el formulario valida para dar buen feedback, pero
  // esta es la frontera real.
  const numero = whatsappSchema.safeParse(telefono)

  if (!numero.success) {
    return err(numero.error.issues[0]?.message ?? 'Revisá el número.', ERROR_CODES.VALIDACION)
  }

  const { NOMBRE_PAGINA } = await import('@/lib/constantes')
  const { numeroPlataforma } = await import('@/lib/whatsapp')

  const ip = ipDelRequest()

  const resultado = await solicitarCodigo(perfil.id, numero.data, ip)

  if (!resultado.ok) {
    return err(resultado.error, resultado.code)
  }

  const texto = `Verifico mi número en ${NOMBRE_PAGINA}. Código: ${resultado.data.codigo}`

  return ok({
    codigo: resultado.data.codigo,
    expiraEnIso: resultado.data.expiraEnIso,
    enlaceWhatsApp: `https://wa.me/${numeroPlataforma()}?text=${encodeURIComponent(texto)}`,
    numeroPlataforma: numeroPlataforma(),
    nombrePagina: NOMBRE_PAGINA,
  })
}

/**
 * IP del cliente, para el límite por IP.
 *
 * Se hashea antes de usarla como clave: la IP es un dato personal y en Vercel
 * no hay nada confiable en `x-forwarded-for` para distinguir al usuario real de
 * un proxy. Como clave de rate limiting alcanza con algo estable por conexión.
 */
function ipDelRequest(): string | undefined {
  const headersList = headers()

  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    undefined
  )
}

/**
 * Verificación manual, del lado del servidor.
 *
 * Existe como action para que el admin no tenga que tocar la base, pero no se
 * expone en ninguna interfaz todavía: la pantalla de admin es el módulo 4.1.
 * La autorización se revalida acá contra el rol en la base, no contra el token,
 * porque es una acción que marca a alguien como verificado.
 */
export async function verificarWhatsAppComoAdmin(
  profileId: string,
  motivo: string,
): Promise<Resultado<null>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.email) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const admin = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { role: true, email: true },
  })

  // Solo ADMIN. El enum del proyecto tiene tres roles y no incluye MODERATOR:
  // agregarlo "por si más adelante" sería un valor que ninguna regla contempla.
  if (admin?.role !== 'ADMIN') {
    logger.warn('verificación manual sin permisos', { email: admin?.email })
    return err('No tenés permisos para hacer esto.', ERROR_CODES.SIN_PERMISOS)
  }

  const { verificarManualmente } = await import('@/services/verificacion-whatsapp')

  return verificarManualmente(profileId, admin.email, motivo)
}