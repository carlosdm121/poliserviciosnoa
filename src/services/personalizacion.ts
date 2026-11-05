import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Colores que el profesional puede elegir para su página pública.
 * Se guardan como JSON en `pageColors` del perfil.
 */
export type PageColors = {
  primary?: string
  secondary?: string
  background?: string
  text?: string
}

/** Valida que un color sea un hex válido. */
function esColorHex(valor: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(valor)
}

/**
 * Edita los colores, logo y banner de la página pública de un perfil.
 *
 * El profesional puede cambiar cómo se ve su espacio: colores principales,
 * logo y banner. Todo se valida antes de escribir.
 */
export async function editarPersonalizacion(
  profileId: string,
  datos: {
    logoUrl?: string | null
    bannerUrl?: string | null
    pageColors?: PageColors | null
  },
): Promise<Resultado<null>> {
  const colores = datos.pageColors

  if (colores) {
    const campos = ['primary', 'secondary', 'background', 'text'] as const

    for (const campo of campos) {
      const valor = colores[campo]
      if (valor !== undefined && valor !== null && !esColorHex(valor)) {
        return err(
          `El color ${campo} no es válido. Usá un código hexadecimal, por ejemplo #0A0A0A.`,
          ERROR_CODES.VALIDACION,
        )
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profileId },
        data: {
          logoUrl: datos.logoUrl ?? null,
          bannerUrl: datos.bannerUrl ?? null,
          ...(datos.pageColors !== null && datos.pageColors !== undefined
            ? { pageColors: datos.pageColors }
            : {}),
        },
      })
    })
  } catch (error: unknown) {
    logger.error('personalizacion: error al editar', { profileId, error })
    return err('No pudimos guardar los cambios. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  await sincronizarPublicacion(profileId)

  return ok(null)
}

/**
 * Lee los colores, logo y banner de un perfil para la página pública.
 * No selecciona datos sensibles: solo lo que se muestra al cliente.
 */
export async function obtenerPersonalizacionPublica(profileId: string) {
  return prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      bannerUrl: true,
      pageColors: true,
      whatsappE164: true,
    },
  })
}

/**
 * Mensaje predefinido del botón de WhatsApp.
 * Vive acá para que el cliente y el servidor usen el mismo texto.
 */
export const MENSAJE_WHATSAPP =
  'Hola, te vi en la pagina de PoliserviciosNOA y me gustaria contratar tus servicios, necesito mas informacion'

/**
 * Construye el enlace de WhatsApp con el mensaje predefinido.
 */
export function enlaceWhatsApp(numeroE164: string): string {
  const sinSignos = numeroE164.replace(/^\+/, '')
  return `https://wa.me/${sinSignos}?text=${encodeURIComponent(MENSAJE_WHATSAPP)}`
}
