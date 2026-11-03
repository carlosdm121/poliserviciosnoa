'use server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { firmarSubida } from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import {
  eliminarImagen,
  reordenarImagenes,
  registrarImagen,
  type ImagenGaleria,
} from '@/services/galeria'
import { registrarImagenSchema, reordenarSchema } from '@/schemas/galeria'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Server Actions de la galería.
 *
 * `"use server"` arriba del archivo, sin excepción (ver `decisions.md` D8): sin
 * la directiva, Prisma entra al bundle del cliente.
 *
 * **El `profileId` sale siempre de la sesión, nunca del cliente.** Es la misma
 * regla en las cuatro acciones y no es una formalidad: si el id del perfil
 * viniera por parámetro, cualquiera con una sesión válida podría escribir en
 * la galería de otro.
 */

/**
 * Pide la firma para subir una foto.
 *
 * Es lo primero que hace el navegador: la firma dice que puede subir **a esta
 * carpeta** y no a ninguna otra, y vence en una hora.
 */
export async function pedirFirmaSubida(): Promise<
  Resultado<ReturnType<typeof firmarSubida>>
> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return perfil

  const limiteFirma = await rateLimit(
    `galeria:firma:${perfil.data}`,
    30,
    3600,
  )

  if (limiteFirma.limitado) {
    return err(
      'Pediste demasiadas firmas de subida en poco tiempo. Probá más tarde.',
      ERROR_CODES.RATE_LIMIT,
    )
  }

  return ok(firmarSubida(perfil.data))
}

/**
 * Confirma que la foto se subió y la registra.
 *
 * El `publicId` lo manda el navegador porque es el Cloudinary del navegador el
 * que lo generó, pero el servidor no se lo cree: lo busca en la API y descarta
 * la URL que venga.
 */
export async function confirmarImagen(
  entrada: unknown,
): Promise<Resultado<ImagenGaleria>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return perfil

  const parseado = registrarImagenSchema.safeParse(entrada)

  if (!parseado.success) {
    return err('No pudimos entender esa foto. Volvé a subirla.', ERROR_CODES.VALIDACION)
  }

  return registrarImagen(perfil.data, parseado.data)
}

export async function borrarImagen(imageId: string): Promise<Resultado<null>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return perfil

  return eliminarImagen(perfil.data, imageId)
}

export async function guardarOrden(entrada: unknown): Promise<Resultado<null>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return perfil

  /**
   * Pasa por Zod y no se castea.
   *
   * Es tentador aceptar `entrada as ReordenarInput` porque el componente ya la
   * mandó bien tipada. Pero el cliente HTTP es lo que llama a esta función, no
   * el componente: el tipo de TypeScript no existe en runtime y cualquiera que
   * haga un POST puede mandar mil ids.
   */
  const parseado = reordenarSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'El orden no es válido.', ERROR_CODES.VALIDACION)
  }

  return reordenarImagenes(perfil.data, parseado.data)
}

/**
 * Perfil del usuario de la sesión.
 *
 * Se resuelve una vez por action y no por parámetro, para que ninguna de las
 * cuatro pueda olvidarse de filtrar por el dueño.
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