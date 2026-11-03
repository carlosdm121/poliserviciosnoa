/**
 * Verificación del flujo de la galería.
 *
 * Corre contra la base que levantó `scripts/verificar.ts` y no usa un runner de
 * tests: los casos necesitan una base de verdad (bloqueo de fila, transacciones
 * concurrentes) y el proyecto ya tiene el Postgres embebido montado para eso.
 *
 * El caso central es el del prompt: **12 subidas simultáneas tienen que dejar
 * exactamente 10**. Es la prueba que justifica el `FOR UPDATE`. Si alguien saca
 * el bloqueo y deja el `count` solo, este script falla, y esa es exactamente la
 * razón de que esté en `npm run verificar` y no en una suite opcional.
 *
 * Uso: npx tsx scripts/verificar-galeria.ts
 */

import { PrismaClient } from '@prisma/client'

import { limpiarMock, registrarSubidaMock } from '../src/lib/cloudinary'
import { LIMITE_IMAGENES } from '../src/lib/imagen'
import {
  eliminarImagen,
  listarImagenes,
  ocultarImagen,
  reordenarImagenes,
  registrarImagen,
} from '../src/services/galeria'
import { sincronizarPublicacion } from '../src/services/publicacion'

/**
 * Cliente propio, y no el singleton de `lib/prisma`.
 *
 * Igual que en `verificar-whatsapp.ts`: el script corre una sola vez y termina,
 * así que el singleton de desarrollo no aporta nada y sí complica el
 * `disconnect` del final.
 */
const prisma = new PrismaClient()

let fallos = 0
let pruebas = 0

function comprobar(descripcion: string, condicion: boolean, detalle?: string): void {
  pruebas += 1

  if (condicion) {
    console.log(`  ok   ${descripcion}`)
    return
  }

  fallos += 1
  console.log(`  FALLA ${descripcion}${detalle ? ` — ${detalle}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n--- ${texto} ---`)
}

let contador = 0

/**
 * Crea un perfil limpio y devuelve su id.
 *
 * El teléfono sale del contador y no de un azar: `whatsappE164` es único en la
 * base, y dos correos con sufijo parecido pueden caer en el mismo número si el
 * azar coopera. Con el contador no hay forma de que choquen.
 */
async function crearPerfil(sufijo: string): Promise<string> {
  contador += 1

  const marca = `${sufijo}-${contador}`

  const user = await prisma.user.create({
    data: {
      email: `galeria-${marca}@test.local`,
      emailVerified: new Date(),
      passwordHash: 'x',
      role: 'PROFESSIONAL',
      profile: {
        create: {
          name: `Galería ${marca}`,
          slug: `galeria-${marca}`,
          // 10 dígitos después del 54, todos distintos porque el contador es
          // incremental y arranca en 100000.
          whatsappE164: `54938${String(10000000 + contador).padStart(8, '0')}`,
          whatsappVerifiedAt: new Date(),
        },
      },
    },
    select: { profile: { select: { id: true } } },
  })

  const id = user.profile?.id

  if (!id) throw new Error('No se pudo crear el perfil de prueba')

  return id
}

/** Sube una foto al mock de Cloudinary y la registra en la galería. */
async function subir(
  profileId: string,
  indice: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const publicId = `perfiles/${profileId}/foto-${indice}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  registrarSubidaMock(publicId, { width: 1200, height: 800 })

  const resultado = await registrarImagen(profileId, { publicId })

  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error }
}

/**
 * Deja el perfil con suscripción activa.
 *
 * Sale del plan que creó el seed en vez de inventar uno: si el seed no llegara a
 * correr, el `planId` queda en null y la suscripción sigue valiendo igual, así
 * que esta comprobación no depende del orden en que se corren los pasos.
 */
async function activarSuscripcion(profileId: string): Promise<void> {
  const plan = await prisma.plan.findFirst({ where: { isActive: true }, select: { id: true } })

  await prisma.subscription.upsert({
    where: { profileId },
    create: {
      profileId,
      planId: plan?.id ?? null,
      planAmount: 0,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })
}

/** Le asigna un rubro principal, tomando cualquiera del catálogo del seed. */
async function ponerRubroPrincipal(profileId: string): Promise<void> {
  const categoria = await prisma.category.findFirst({
    where: { isActive: true },
    select: { id: true },
  })

  if (!categoria) throw new Error('El seed no dejó ninguna categoría activa')

  await prisma.profileCategory.upsert({
    where: { profileId_categoryId: { profileId, categoryId: categoria.id } },
    create: { profileId, categoryId: categoria.id, isPrimary: true },
    update: { isPrimary: true },
  })
}

async function main(): Promise<void> {
  limpiarMock()

  // -------------------------------------------------------------------------
  titulo('Registro normal')

  const perfil = await crearPerfil('normal')

  const primera = await subir(perfil, 1)
  comprobar('la primera foto se registra', primera.ok)

  const imagenes = await listarImagenes(perfil)
  comprobar('la galería tiene 1 foto', imagenes.length === 1, `tiene ${imagenes.length}`)
  comprobar('la primera foto arranca en sortOrder 0', imagenes[0]?.sortOrder === 0)

  // -------------------------------------------------------------------------
  titulo('12 subidas simultáneas dejan exactamente 10')

  const perfilConcurrente = await crearPerfil('concurrente')

  /**
   * Se lanzan las 12 de golpe con `Promise.all` y no una por una.
   *
   * Es lo que hace que la prueba signifique algo: si se fueran una a una, cada
   * una vería el estado que dejó la anterior y las 12 pasarían el límite sin
   * ejercitar el bloqueo. El `FOR UPDATE` solo se nota cuando dos transacciones
   * leen el mismo snapshot, y eso solo pasa si hay concurrencia real.
   */
  const resultados = await Promise.all(
    Array.from({ length: 12 }, (_, indice) => subir(perfilConcurrente, indice)),
  )

  const exitos = resultados.filter((r) => r.ok).length
  const rechazadas = resultados.filter((r) => !r.ok)
  const enBase = await prisma.image.count({ where: { profileId: perfilConcurrente } })

  comprobar(
    `12 subidas simultáneas dejan ${LIMITE_IMAGENES} (no ${enBase})`,
    enBase === LIMITE_IMAGENES,
    `quedaron ${enBase}`,
  )
  comprobar(
    `exactamente 2 tienen que ser rechazadas (${exitos} aceptadas)`,
    exitos === LIMITE_IMAGENES && rechazadas.length === 2,
    `aceptadas ${exitos}, rechazadas ${rechazadas.length}`,
  )
  comprobar(
    'el rechazo es por límite, con mensaje que lo dice',
    rechazadas.every((r) => !r.ok && r.error.includes('Borrá alguna')),
    rechazadas.map((r) => (r.ok ? '' : r.error)).join(' | '),
  )

  // El orden tiene que quedar sin huecos ni repetidos.
  const ordenFinal = await prisma.image.findMany({
    where: { profileId: perfilConcurrente },
    orderBy: { sortOrder: 'asc' },
    select: { sortOrder: true },
  })
  comprobar(
    'el orden queda 0..9 sin huecos ni repetidos',
    ordenFinal.every((imagen, indice) => imagen.sortOrder === indice),
    ordenFinal.map((i) => i.sortOrder).join(','),
  )

  // -------------------------------------------------------------------------
  titulo('Una imagen que no existe')

  const perfilFantasma = await crearPerfil('fantasma')

  const fantasma = await registrarImagen(perfilFantasma, {
    publicId: `perfiles/${perfilFantasma}/nunca-se-subio`,
  })

  comprobar('una imagen inexistente se rechaza', !fantasma.ok)
  comprobar(
    'el mensaje no revela que el archivo no existe',
    !fantasma.ok && fantasma.error === 'No encontramos esa imagen. Volvé a subirla.',
    fantasma.ok ? '' : fantasma.error,
  )

  // -------------------------------------------------------------------------
  titulo('IDOR: reclamo de una foto de otro perfil')

  const perfilA = await crearPerfil('idor-a')
  const perfilB = await crearPerfil('idor-b')

  await subir(perfilA, 1)
  const fotosDeA = await listarImagenes(perfilA)
  const fotoDeA = fotosDeA[0]

  if (!fotoDeA) {
    comprobar('la foto del perfil A existe', false, 'no se creó la foto de A')
  } else {
    // El perfil B intenta registrar la foto que ya es de A.
    const claim = await registrarImagen(perfilB, { publicId: fotoDeA.publicId })

    comprobar('no se puede reclamar una foto de otro perfil', !claim.ok)
    comprobar(
      'el mensaje es el mismo que el de "no existe"',
      !claim.ok && claim.error === 'No encontramos esa imagen. Volvé a subirla.',
      claim.ok ? '' : claim.error,
    )

    comprobar(
      'la foto ajena no aparece en la galería de B',
      (await listarImagenes(perfilB)).length === 0,
    )
  }

  // -------------------------------------------------------------------------
  titulo('IDOR: borrar y reordenar fotos ajenas')

  if (fotoDeA) {
    const borrado = await eliminarImagen(perfilB, fotoDeA.id)
    comprobar('no se puede borrar una foto ajena', !borrado.ok)

    const reordenado = await reordenarImagenes(perfilB, { ids: [fotoDeA.id] })
    comprobar('no se puede reordenar con una foto ajena', !reordenado.ok)

    comprobar(
      'la foto de A sigue existiendo después de los dos intentos',
      (await listarImagenes(perfilA)).length === 1,
    )

    // Y el mismo reordenamiento, hecho por su dueño, funciona.
    const propio = await reordenarImagenes(perfilA, { ids: [fotoDeA.id] })
    comprobar('el dueño sí puede reordenar su foto', propio.ok)
  }

  // -------------------------------------------------------------------------
  titulo('Traversal en el publicId')

  const traversal = await registrarImagen(perfil, {
    publicId: `perfiles/${perfil}/../../../perfiles/otro/foto`,
  })
  comprobar('un publicId con traversal se rechaza', !traversal.ok)

  // -------------------------------------------------------------------------
  titulo('Borrado')

  const paraBorrar = await subir(perfil, 99)
  comprobar('se sube una foto para borrar', paraBorrar.ok)

  const antes = await listarImagenes(perfil)
  const ultima = antes[antes.length - 1]

  if (ultima) {
    const borrado = await eliminarImagen(perfil, ultima.id)
    comprobar('el dueño sí puede borrar su foto', borrado.ok)

    const despues = await listarImagenes(perfil)
    comprobar('la galería queda con una foto menos', despues.length === antes.length - 1)

    comprobar(
      'el orden se renumera sin huecos',
      despues.every((imagen, indice) => imagen.sortOrder === indice),
      despues.map((i) => i.sortOrder).join(','),
    )

    // La foto borrada no se puede borrar dos veces.
    const repetido = await eliminarImagen(perfil, ultima.id)
    comprobar('borrar dos veces la misma foto falla limpio', !repetido.ok)
  }

  // -------------------------------------------------------------------------
  titulo('Ocultar por administración')

  const paraOcultar = await subir(perfil, 100)
  comprobar('se sube una foto para ocultar', paraOcultar.ok)

  const conOcultar = await listarImagenes(perfil)
  const aOcultar = conOcultar[0]

  if (aOcultar) {
    const ocultada = await ocultarImagen(perfil, aOcultar.id, true, 'No es un trabajo propio', 'admin-test')
    comprobar('el admin puede ocultar una foto', ocultada.ok)

    const guardada = await prisma.image.findUnique({
      where: { id: aOcultar.id },
      select: { isHidden: true, hiddenReason: true, hiddenBy: true },
    })

    comprobar('queda marcada como oculta', guardada?.isHidden === true)
    comprobar('guarda el motivo del ocultado', guardada?.hiddenReason === 'No es un trabajo propio')
    comprobar('guarda quién la ocultó', guardada?.hiddenBy === 'admin-test')

    const mostrada = await ocultarImagen(perfil, aOcultar.id, false, '', 'admin-test')
    comprobar('se puede volver a mostrar', mostrada.ok)
  }

  // -------------------------------------------------------------------------
  titulo('Publicación: la foto es requisito')

  const perfilSinFoto = await crearPerfil('sin-foto')

  /**
   * Se deja el perfil listo para publicar salvo la foto.
   *
   * No es decoración: `unpublishedReason` guarda **un solo** motivo, el primero
   * de la lista, y la lista está ordenada por prioridad en `evaluarPublicacion`
   * (bloqueos duros antes que contenido). Con un perfil recién creado el primer
   * motivo es `SIN_SUSCRIPCION`, y `SIN_IMAGENES` queda más abajo en la lista.
   *
   * O sea que sin este setup la comprobación no fallaría por un defecto de la
   * galería sino por el orden de los motivos, y pasaría por la razón
   * equivocada en el momento en que el orden cambie. Con suscripción activa y
   * rubro principal, `SIN_IMAGENES` queda primero, que es lo que de verdad ve
   * en el panel un profesional que tiene todo lo demás listo.
   */
  await activarSuscripcion(perfilSinFoto)
  await ponerRubroPrincipal(perfilSinFoto)

  await sincronizarPublicacion(perfilSinFoto)

  const sinFoto = await prisma.profile.findUnique({
    where: { id: perfilSinFoto },
    select: { isPublished: true, unpublishedReason: true },
  })

  comprobar('un perfil sin fotos no se publica', sinFoto?.isPublished === false)
  comprobar('el motivo es SIN_IMAGENES', sinFoto?.unpublishedReason === 'SIN_IMAGENES')

  await subir(perfilSinFoto, 1)
  await sincronizarPublicacion(perfilSinFoto)

  const conFoto = await prisma.profile.findUnique({
    where: { id: perfilSinFoto },
    select: { isPublished: true, unpublishedReason: true },
  })

  // Aunque con foto sigue sin publicar: también necesita suscripción. Lo que
  // importa acá es que el motivo ya no sea SIN_IMAGENES.
  comprobar(
    'con una foto, SIN_IMAGENES deja de ser el motivo',
    conFoto?.unpublishedReason !== 'SIN_IMAGENES',
    conFoto?.unpublishedReason ?? '',
  )

  // -------------------------------------------------------------------------
  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

  if (fallos > 0) {
    console.log(`${fallos} FALLAS`)
    process.exitCode = 1
  }
}

main()
  .catch((error: unknown) => {
    console.error('\nError en la verificación de galería:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })