/**
 * Consulta del perfil público.
 *
 * La condición de publicación no se reescribe acá: se trae
 * `CONDICION_PERFIL_PUBLICO`. Es el punto del módulo donde es más tentador
 * "optimizar" con un `where` propio, y es exactamente donde un perfil vencido
 * se queda visible y el cliente llama a un número que ya no atiende.
 */

import { prisma } from '@/lib/prisma'
import { LIMITE_IMAGENES } from '@/lib/imagen'
import { CONDICION_PERFIL_PUBLICO } from '@/services/publicacion'

export type PerfilPublico = NonNullable<Awaited<ReturnType<typeof obtenerPerfilPublico>>>

/**
 * Perfil listo para pintar, o `null` si no cumple la condición pública.
 *
 * Se seleccionan solo las columnas que la página y los metadatos usan. En
 * particular **no se selecciona `whatsappE164`**: el número no tiene por qué
 * pasar por el render.
 */
export async function obtenerPerfilPublico(slug: string) {
  return prisma.profile.findFirst({
    where: { slug, ...CONDICION_PERFIL_PUBLICO },
    select: {
      id: true,
      slug: true,
      type: true,
      name: true,
      tradeName: true,
      logoUrl: true,
      teamSize: true,
      licenseNumber: true,
      companyVerifiedAt: true,
      description: true,
      shortBio: true,
      coversWholeProvince: true,
      coversOtherProvinces: true,
      baseCity: { select: { name: true, province: true } },
      images: {
        where: { isHidden: false },
        orderBy: { sortOrder: 'asc' },
        take: LIMITE_IMAGENES,
        select: { id: true, url: true, width: true, height: true },
      },
      categories: {
        // Primero el rubro principal y después el secundario: la página los
        // muestra en ese orden y no depende del orden de inserción.
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          isPrimary: true,
          category: {
            select: {
              name: true,
              slug: true,
              requiresLicense: true,
              licenseLabel: true,
              group: { select: { name: true } },
            },
          },
        },
      },
      subcategories: {
        select: { subcategory: { select: { name: true } } },
      },
      coverage: {
        select: { city: { select: { name: true, province: true } } },
      },
    },
  })
}
