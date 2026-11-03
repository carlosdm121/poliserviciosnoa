/**
 * Contador de visitas del perfil público.
 *
 * Se cuenta una visita por render, pero la decisión de contar no se toma en el
 * navegador: la ruta vuelve a validar publicación y dueño. Un contador que se
 * puede inflar desde el cliente no sirve para ordenar búsquedas, que es el
 * único uso real que tiene.
 *
 * No se guarda IP, user-agent ni identificador del visitante. La deduplicación
 * por IP vive en el rate limit de la ruta y es efímera, no un registro.
 */

import { prisma } from '@/lib/prisma'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'
import { diaEstadistica } from '@/services/contacto'
import { ERROR_CODES, err, ok, type Resultado } from '@/types/resultado'

export type VistaRegistrada = {
  /** `false` cuando la visita no sumó (dueño, bot o ya contada). */
  contado: boolean
}

/**
 * Suma la visita y la estadística diaria.
 *
 * `contar: false` es para bots: la ruta igual responde 204 porque el bot no
 * tiene que ver un error, pero no se escribe nada.
 *
 * Las dos escrituras van en una transacción. Si se hicieran por separado, una
 * caída entre medio dejaría `viewsCount` sin su fila diaria y el reporte del
 * panel no cerraría contra el total.
 */
export async function registrarVista(params: {
  slug: string
  /** Sesión del visitante, si la hay. Sirve para no contar al dueño. */
  viewerUserId?: string | null
  contar?: boolean
  ahora?: Date
}): Promise<Resultado<VistaRegistrada>> {
  const ahora = params.ahora ?? new Date()

  const perfil = await prisma.profile.findFirst({
    where: { slug: params.slug, ...CONDICION_PERFIL_PUBLICO },
    select: { id: true, userId: true },
  })

  if (!perfil) {
    return err('Ese perfil no está disponible.', ERROR_CODES.NO_ENCONTRADO)
  }

  const esDueno = Boolean(params.viewerUserId && params.viewerUserId === perfil.userId)

  if (params.contar === false || esDueno) {
    return ok({ contado: false })
  }

  const dia = diaEstadistica(ahora)

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: perfil.id },
      data: { viewsCount: { increment: 1 } },
    })

    await tx.profileDailyStat.upsert({
      where: { profileId_date: { profileId: perfil.id, date: dia } },
      create: { profileId: perfil.id, date: dia, views: 1 },
      update: { views: { increment: 1 } },
    })
  })

  return ok({ contado: true })
}
