import { z } from 'zod'

/**
 * Validación de la galería.
 *
 * El mismo schema corre en el cliente y en el servidor. En el cliente sirve
 * para avisar el error junto al campo sin hacer un request; en el servidor
 * porque el cliente se puede manipular y esta es la única frontera real.
 *
 * Ojo con lo que NO está acá: que la imagen exista en Cloudinary, que sea de
 * este perfil y que el perfil no tenga ya 10. Eso necesita red y base de datos,
 * y vive en `services/galeria.ts`. Zod solo puede ver la forma.
 *
 * El límite de 10 tampoco se reexporta desde acá a propósito: tiene un solo
 * dueño, `lib/imagen.ts`. Un `export { LIMITE_IMAGENES }` en este archivo
 * haría que el compilador aceptara las dos rutas de importación y, con el
 * tiempo, que alguien dejara de actualizar una de las dos.
 */

/**
 * Identificador de recurso de Cloudinary.
 *
 * Se acota la longitud porque el valor va a una URL de la API y a un log: sin
 * tope, un cliente puede mandar un string de un megabyte y el registro de
 * errores se llena de basura. 300 caracteres de sobra para un `publicId`.
 */
export const publicIdSchema = z
  .string()
  .min(1, 'Falta el identificador de la imagen.')
  .max(300, 'El identificador de la imagen no es válido.')

export const registrarImagenSchema = z.object({
  publicId: publicIdSchema,
  // La URL también la manda el cliente, pero no se confía: el servicio la
  // descarta y usa la que devuelve la API de Cloudinary. Se pide en el schema
  // solo para no romper el contrato si algún día hace falta.
  url: z.string().url().max(500).optional(),
})

export const reordenarSchema = z.object({
  /**
   * Orden completo de la galería, como lista de ids de imagen.
   *
   * Se manda la lista entera y no un par (id, posición): con el par, dos
   * reordenados simultáneos se pisan y la galería queda con dos imágenes en la
   * misma posición. Con la lista entera, el último que llega define el estado y
   * no queda nada a medias.
   */
  ids: z.array(publicIdSchema).max(10, 'La galería no puede tener más de 10 fotos.'),
})

export type RegistrarImagenInput = z.infer<typeof registrarImagenSchema>
export type ReordenarInput = z.infer<typeof reordenarSchema>

/**
 * Imagen de la galería, tal como la pinta el panel.
 *
 * Vive acá y no en `services/galeria.ts` por una razón concreta: el
 * componente de galería es un Client Component y tiene que poder tipar las
 * props sin importar nada que llegue al navegador. Importar el tipo desde el
 * servicio se lleva Prisma al bundle del cliente (ver `decisions.md` D8), y
 * con `import type` se evita en la mayoría de los casos, pero "en la mayoría
 * de los casos" es exactamente el tipo de dependencia que un día vuelve sin
 * avisar.
 */
export type ImagenGaleria = {
  id: string
  publicId: string
  url: string
  width: number
  height: number
  sortOrder: number
  isHidden: boolean
}