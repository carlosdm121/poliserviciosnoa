'use server'

import { revalidatePath } from 'next/cache'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { editarPersonalizacion, type PageColors } from '@/services/personalizacion'
import { personalizacionSchema, type PersonalizacionInput } from '@/schemas/personalizacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Edita la personalización del espacio público: logo, banner y colores.
 * Solo el dueño del perfil puede hacerlo.
 */
export async function editarEspacioPersonalizacion(
  entrada: PersonalizacionInput,
): Promise<Resultado<null>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const parseado = personalizacionSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(
      primero?.message ?? 'Revisá los datos.',
      ERROR_CODES.VALIDACION,
    )
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true, slug: true },
  })

  if (!perfil) {
    return err('No encontramos tu espacio.', ERROR_CODES.NO_ENCONTRADO)
  }

  const datos: { logoUrl?: string | null; bannerUrl?: string | null; pageColors?: PageColors | null } = {}

  if (parseado.data.logoUrl !== undefined) datos.logoUrl = parseado.data.logoUrl
  if (parseado.data.bannerUrl !== undefined) datos.bannerUrl = parseado.data.bannerUrl
  if (parseado.data.pageColors !== undefined) {
    datos.pageColors = parseado.data.pageColors
      ? (parseado.data.pageColors as PageColors)
      : null
  }

  const resultado = await editarPersonalizacion(perfil.id, datos)

  if (resultado.ok) {
    revalidatePath('/panel/espacio')
    // Las dos formas de la URL sirven el mismo perfil. Si se revalida una sola,
    // el link que la persona comparte puede quedar con la versión vieja.
    revalidatePath(`/p/${perfil.slug}`)
    revalidatePath(`/${perfil.slug}`)
  }

  return resultado
}
