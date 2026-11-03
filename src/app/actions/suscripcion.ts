'use server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  guardarDatosFiscales,
  cancelarRenovacion,
  crearSuscripcion,
} from '@/services/suscripcion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Server Actions de la suscripción.
 *
 * `"use server"` arriba del archivo, sin excepción (ver `decisions.md` D8): sin
 * la directiva, Prisma entra al bundle del cliente.
 *
 * **El `profileId` sale siempre de la sesión, nunca del cliente.** Es la misma
 * regla que en las acciones de la galería y en las del perfil: si el id del
 * perfil viniera por parámetro, cualquiera con una sesión válida podría
 * suscribir, dar de baja o cargar datos fiscales de otro.
 *
 * Las tres acciones devuelven `Resultado`, nunca una excepción: son las tres
 * cosas que un profesional aprieta con la mano en un celular, y una pantalla en
 * blanco por un error no capturado se lee como que la página está rota.
 */

/**
 * Abre el checkout de Mercado Pago.
 *
 * Devuelve la URL a la que redirige el componente. La redirección no se hace
 * desde el servidor con un 302: el Server Action no puede mandar un 307 con la
 * URL del proveedor sin perder el referer, y el componente ya tiene el control
 * de la navegación.
 */
export async function suscribirme(entrada: unknown): Promise<Resultado<{ urlCheckout: string }>> {
  const perfil = await perfilDeLaSesion()

  // Se reenvía el error con `err` y no devolviendo el resultado de la otra
  // función: `Resultado<string>` no es asignable a `Resultado<{urlCheckout}>`,
  // porque el tipo de `data` es el que cambia. Reenviar el objeto entero
  // tiparía la action como `unknown` y perdería el autocompletado justo donde
  // más importa, que es la respuesta del cobro.
  if (!perfil.ok) return err(perfil.error, perfil.code)

  return crearSuscripcion(perfil.data, entrada)
}

/** Cancela la renovación automática. No devuelve el dinero ni despublica. */
export async function cancelarLaRenovacion(): Promise<Resultado<null>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return err(perfil.error, perfil.code)

  return cancelarRenovacion(perfil.data)
}

/** Guarda los datos fiscales que necesita la factura de cada pago. */
export async function guardarLosDatosFiscales(entrada: unknown): Promise<Resultado<null>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return err(perfil.error, perfil.code)

  return guardarDatosFiscales(perfil.data, entrada)
}

/**
 * Perfil del usuario de la sesión.
 *
 * Se resuelve una vez por action y no por parámetro, para que ninguna de las tres
 * pueda olvidarse de filtrar por el dueño.
 */
async function perfilDeLaSesion(): Promise<Resultado<string>> {
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

  return ok(perfil.id)
}