import { Prisma } from '@prisma/client'

import {
  ErrorCloudinary,
  verificarRecursoDePerfil,
  borrarRecurso,
  type RecursoImagen,
} from '@/lib/cloudinary'
import { logger } from '@/lib/logger'
import { LIMITE_IMAGENES, mensajeLimiteAlcanzado, publicIdTieneTraversal } from '@/lib/imagen'
import { prisma } from '@/lib/prisma'
import { registrarImagenSchema, type ImagenGaleria, type RegistrarImagenInput, type ReordenarInput } from '@/schemas/galeria'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Lógica de la galería.
 *
 * Tres operaciones, y las tres revalidan **contra la base** lo que el cliente
 * dice. El patrón es el mismo que en `services/perfil.ts`: al cliente se lo
 * escucha, no se lo cree.
 *
 * Lo que protege este módulo, en orden de gravedad:
 *
 * 1. **El límite de 10.** Se valida con `FOR UPDATE` sobre el perfil antes de
 *    contar, porque dos subidas simultáneas que leen 9 las dos pasan y quedan
 *    11 (ver `decisions.md` D5 y D20).
 * 2. **La pertenencia de la imagen.** Que el `publicId` sea de la carpeta del
 *    perfil es lo único que impide que un usuario enganche la foto de otro.
 * 3. **El IDOR en borrar y reordenar.** Toda imagen que se toca tiene que
 *    pertenecer al perfil que la pide, comprobado en la consulta y no en el
 *    código de arriba.
 */

/** Error de negocio lanzado dentro de la transacción, para provocar rollback. */
class ErrorGaleria extends Error {
  constructor(
    message: string,
    readonly code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  ) {
    super(message)
    this.name = 'ErrorGaleria'
  }
}

export type { ImagenGaleria }

export async function listarImagenes(profileId: string): Promise<ImagenGaleria[]> {
  const imagenes = await prisma.image.findMany({
    where: { profileId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      publicId: true,
      url: true,
      width: true,
      height: true,
      sortOrder: true,
      isHidden: true,
    },
  })

  return imagenes
}

/** Cuántas fotos tiene, para pintar el contador antes de que llegue la lista. */
export async function contarImagenes(profileId: string): Promise<number> {
  return prisma.image.count({ where: { profileId } })
}

/**
 * Registra una imagen ya subida a Cloudinary.
 *
 * El orden de los tres chequeos es a propósito y no es arbitrario:
 *
 * 1. **Formato del input.** Zod. Barato, y descarta lo que ni tiene sentido
 *    discutir.
 * 2. **Pertenencia y existencia del recurso**, contra la API de Cloudinary.
 *    Antes de tocar la base: si la imagen no es de este perfil, no hay nada
 *    que registrar y ni siquiera hay que bloquear la fila.
 * 3. **Límite**, dentro de la transacción y con la fila bloqueada. Es el único
 *    punto donde el estado de la base importa.
 *
 * @param profileId Perfil dueño. Sale de la sesión, nunca del cliente.
 */
export async function registrarImagen(
  profileId: string,
  entrada: RegistrarImagenInput,
): Promise<Resultado<ImagenGaleria>> {
  const parseado = registrarImagenSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos de la imagen.', ERROR_CODES.VALIDACION)
  }

  const { publicId } = parseado.data

  // Un `publicId` con `..` no es una imagen mal formada: es alguien tratando
  // de sacar el request de la API de la carpeta en la que debería estar.
  if (publicIdTieneTraversal(publicId)) {
    logger.warn('galería: publicId con traversal rechazado', { profileId })
    return err('Esa imagen no es válida.', ERROR_CODES.VALIDACION)
  }

  // La verificación va **antes** de la transacción y a propósito. Es una
  // llamada de red que puede tardar un segundo, y mantener abierta una
  // transacción con bloqueo de fila durante un segundo por cada subida
  // bloquea a todos los demás que estén tocando el mismo perfil.
  const verificado = await verificarRecurso(publicId, profileId)

  if (!verificado.ok) return verificado

  /**
   * `const` y no `let`.
   *
* El estrechamiento de tipo de un `let` se pierde dentro de un closure, y lo
   * que se usa acá es un closure: el callback de `$transaction`. Con un `let`
   * declarado, TypeScript insistiría en que `recurso` puede ser `null` adentro
   * de la transacción y obligaría a un `if` que ya se sabe que es falso.
   */
  const recurso = verificado.data

  try {
    const creada = await prisma.$transaction(
      async (tx) => {
        /**
         * Bloqueo de la fila del perfil ANTES de contar.
         *
         * Este es el punto entero del módulo. El orden no se puede invertir: si
         * se contara primero y se bloqueara después, entre el `count` y el
         * `insert` entra otra petición que también ve 9 y también pasa. El
         * `FOR UPDATE` tiene que tomar el snapshot antes de que el `count` lo
         * lea, para que las dos transacciones no puedan ver el mismo número.
         *
         * Por eso el `sortOrder` se calcula acá adentro y no antes: leer el
         * máximo fuera de la transacción es volver a abrir la misma carrera con
         * otro nombre.
         */
        await tx.$queryRaw`
          SELECT id FROM "Profile" WHERE id = ${profileId} FOR UPDATE
        `

        const actual = await tx.image.count({ where: { profileId } })

        if (actual >= LIMITE_IMAGENES) {
          throw new ErrorGaleria(mensajeLimiteAlcanzado(), ERROR_CODES.LIMITE_ALCANZADO)
        }

        // Continuo y sin huecos: si se reordena, se renumera entero. Un
        // `sortOrder` con huecos no rompe nada, pero el índice
        // (profileId, sortOrder) ordena peor y no hay ninguna ventaja.
        const ultima = await tx.image.findFirst({
          where: { profileId },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        })

        const orden = ultima ? ultima.sortOrder + 1 : 0

        return tx.image.create({
          data: {
            profileId,
            publicId: recurso.publicId,
            // La URL sale de la API de Cloudinary, nunca del cliente. La que
            // manda el navegador puede apuntar a cualquier lado, y esa
            // quedaría guardada y servida desde nuestro perfil público.
            url: recurso.url,
            width: recurso.width,
            height: recurso.height,
            sortOrder: orden,
          },
          select: {
            id: true,
            publicId: true,
            url: true,
            width: true,
            height: true,
            sortOrder: true,
            isHidden: true,
          },
        })
      },
      { timeout: 15000, maxWait: 5000 },
    )

    await sincronizarPublicacion(profileId)

    return ok(creada)
  } catch (error: unknown) {
    if (error instanceof ErrorGaleria) {
      return err(error.message, error.code)
    }

    logger.error('galería: error al registrar la imagen', { profileId, error })
    return err('No pudimos guardar la imagen. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }
}

/**
 * Verifica el recurso contra Cloudinary y traduce los fallos a `Resultado`.
 *
 * Existe como función aparte y no inline en `registrarImagen` por dos razones:
 * para que quede escrito en un solo lugar que "no existe" y "es de otro
 * perfil" son indistinguibles desde afuera, y para que `registrarImagen` no
 * tenga que manejar la excepción del proveedor.
 */
async function verificarRecurso(
  publicId: string,
  profileId: string,
): Promise<Resultado<RecursoImagen>> {
  try {
    const recurso = await verificarRecursoDePerfil(publicId, profileId)

    if (!recurso) {
      // El mismo mensaje para los dos casos: no existe, o es de otro perfil.
      // Distinguirlos le diría a quien está probando que la foto ajena existe.
      logger.warn('galería: imagen rechazada', {
        profileId,
        motivo: 'no existe o no es de este perfil',
      })
      return err('No encontramos esa imagen. Volvé a subirla.', ERROR_CODES.NO_ENCONTRADO)
    }

    return ok(recurso)
  } catch (error: unknown) {
    if (error instanceof ErrorCloudinary) {
      return err(error.message, ERROR_CODES.ERROR_EXTERNO)
    }

    logger.error('galería: error verificando el recurso', { profileId, error })
    return err('No pudimos verificar la imagen. Probá de nuevo.', ERROR_CODES.ERROR_EXTERNO)
  }
}

/**
 * Borra una imagen de la galería.
 *
 * Va primero la consulta con `profileId` en el `where` y no un `findUnique`
 * seguido de un chequeo: el filtro es el chequeo. Así el borrado de una imagen
 * ajena y el de una que no existe devuelven el mismo resultado, y no queda
 * ningún camino en el que el borrado se ejecute sin haber leído la fila con el
 * filtro puesto.
 */
export async function eliminarImagen(
  profileId: string,
  imageId: string,
): Promise<Resultado<null>> {
  const imagen = await prisma.image.findFirst({
    where: { id: imageId, profileId },
    select: { id: true, publicId: true, sortOrder: true },
  })

  if (!imagen) {
    // No se distingue "no existe" de "no es tuya": esa diferencia es una
    // herramienta para enumerar qué fotos hay.
    return err('No encontramos esa foto.', ERROR_CODES.NO_ENCONTRADO)
  }

  await prisma.image.delete({ where: { id: imagen.id } })

  try {
    await borrarRecurso(imagen.publicId)
  } catch (error: unknown) {
    // La fila ya se borró. Perder la foto en Cloudinary es una basura
    // huérfana; perder el registro en la base es una foto rota en el perfil.
    logger.warn('galería: la foto se borró de la base pero no de Cloudinary', {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  await renumerar(profileId)
  await sincronizarPublicacion(profileId)

  return ok(null)
}

/**
 * Reordena la galería.
 *
 * Se reescriben todos los `sortOrder` en una transacción. La lista que llega
 * tiene que ser un subconjunto exacto de las imágenes del perfil: si el cliente
 * manda un id de otra persona, el filtro lo ignora y abajo el conteo no da
 * igual y se rechaza.
 */
export async function reordenarImagenes(
  profileId: string,
  entrada: ReordenarInput,
): Promise<Resultado<null>> {
  const ids = entrada.ids

  if (ids.length === 0) {
    return err('La galería no puede quedar vacía desde acá.', ERROR_CODES.VALIDACION)
  }

  if (new Set(ids).size !== ids.length) {
    return err('Hay fotos repetidas en el orden que mandaste.', ERROR_CODES.VALIDACION)
  }

  const propias = await prisma.image.findMany({
    where: { profileId, id: { in: ids } },
    select: { id: true },
  })

  // Si el cliente manda 5 ids pero solo 3 son del perfil, hay dos imágenes
  // ajenas en la lista: se rechaza entero en vez de filtrar en silencio.
  if (propias.length !== ids.length) {
    return err('El orden incluye fotos que no son tuyas.', ERROR_CODES.SIN_PERMISOS)
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "Profile" WHERE id = ${profileId} FOR UPDATE
        `

        /**
         * Un `update` por id, en el orden de la lista.
         *
         * Y no un `updateMany` con un `sortOrder` calculado aparte, por dos
         * razones: las promesas de `updateMany` no se ejecutan en el orden en
         * que se las escriben, y un `sortOrder` duplicado deja dos fotos
         * peleándose por la misma posición, con la galería del perfil
         * mostrando una de las dos.
         */
        for (const [indice, id] of ids.entries()) {
          await tx.image.update({ where: { id }, data: { sortOrder: indice } })
        }
      },
      { timeout: 15000, maxWait: 5000 },
    )
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error('galería: error reordenando', { profileId, code: error.code })
    }
    return err('No pudimos guardar el nuevo orden. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  return ok(null)
}

/**
 * Oculta o muestra una imagen. Solo para administración.
 *
 * No borra: una moderación equivocada tiene que ser reversible, porque una
 * foto que parecía ajena puede ser un trabajo del cliente que el profesional
 * tenía permiso para mostrar.
 */
export async function ocultarImagen(
  profileId: string,
  imageId: string,
  ocultar: boolean,
  motivo: string,
  adminId: string,
): Promise<Resultado<null>> {
  const imagen = await prisma.image.findFirst({
    where: { id: imageId, profileId },
    select: { id: true, isHidden: true },
  })

  if (!imagen) {
    return err('No encontramos esa foto.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (imagen.isHidden === ocultar) {
    return ok(null)
  }

  await prisma.image.update({
    where: { id: imagen.id },
    data: {
      isHidden: ocultar,
      hiddenReason: ocultar ? motivo : null,
      hiddenAt: ocultar ? new Date() : null,
      hiddenBy: ocultar ? adminId : null,
    },
  })

  await sincronizarPublicacion(profileId)

  return ok(null)
}

/**
 * Renumera el orden sin huecos después de un borrado.
 *
 * Fuera de la transacción porque va después del `delete` ya confirmado: si
 * falla, lo que queda es un hueco en el orden, que es un defecto cosmético. Si
 * lo hiciera adentro y el borrado fallara, el rollback tampoco arreglaría el
 * hueco, porque el hueco viene del estado anterior.
 */
async function renumerar(profileId: string): Promise<void> {
  const imagenes = await prisma.image.findMany({
    where: { profileId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })

  await prisma.$transaction(
    imagenes.map((imagen, indice) =>
      prisma.image.update({ where: { id: imagen.id }, data: { sortOrder: indice } }),
    ),
  )
}