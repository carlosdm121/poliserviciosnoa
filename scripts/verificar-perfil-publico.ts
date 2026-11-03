/**
 * Verificación del perfil público (módulo 3.4).
 *
 * Corre contra la base real del script de verificación, sin navegador. Lo que
 * se prueba es lo que decide el negocio:
 *
 * - un perfil que no cumple la condición pública no se puede abrir;
 * - la consulta no selecciona el número de WhatsApp;
 * - la galería trae solo imágenes visibles, ordenadas y hasta 10;
 * - la visita suma el contador y la estadística diaria, y no suma para el
 *   dueño ni para un bot;
 * - el JSON-LD no publica teléfono ni rating.
 *
 * Uso: npx tsx scripts/verificar-perfil-publico.ts
 */

import { PrismaClient } from '@prisma/client'

import { construirJsonLd } from '../src/lib/perfil-publico'
import { obtenerPerfilPublico } from '../src/services/perfil-publico'
import { registrarVista } from '../src/services/vistas'

const prisma = new PrismaClient()

let pruebas = 0
let fallos = 0

function comprobar(descripcion: string, condicion: boolean, detalle?: string): void {
  pruebas += 1

  if (condicion) {
    console.log(`  ok   ${descripcion}`)
    return
  }

  fallos += 1
  console.log(`  FALLA ${descripcion}${detalle ? ` - ${detalle}` : ''}`)
}

function titulo(texto: string): void {
  console.log(`\n--- ${texto} ---`)
}

function sufijo(): string {
  return Math.random().toString(36).slice(2, 8)
}

async function catalogo(): Promise<{
  rubroPrincipal: string
  rubroSecundario: string
  ciudadBase: string
  ciudadCobertura: string
}> {
  const [categorias, ciudades] = await Promise.all([
    prisma.category.findMany({ take: 2, select: { id: true } }),
    prisma.city.findMany({ take: 2, select: { id: true } }),
  ])

  const [rubroPrincipal, rubroSecundario] = categorias.map((c) => c.id)
  const [ciudadBase, ciudadCobertura] = ciudades.map((c) => c.id)

  if (!rubroPrincipal || !rubroSecundario || !ciudadBase || !ciudadCobertura) {
    throw new Error('El seed no dejó catálogo suficiente. Corré el seed antes de este script.')
  }

  return { rubroPrincipal, rubroSecundario, ciudadBase, ciudadCobertura }
}

type PerfilCreado = {
  profileId: string
  userId: string
  slug: string
}

async function crearProfesional(params?: {
  publicado?: boolean
  moderacion?: 'APPROVED' | 'SUSPENDED'
}): Promise<PerfilCreado> {
  const id = sufijo()
  const { rubroPrincipal, rubroSecundario, ciudadBase, ciudadCobertura } = await catalogo()

  const usuario = await prisma.user.create({
    data: {
      email: `perfil-${id}@example.com`,
      name: `Perfil ${id}`,
      emailVerified: new Date(),
      role: 'PROFESSIONAL',
    },
    select: { id: true },
  })

  const perfil = await prisma.profile.create({
    data: {
      userId: usuario.id,
      type: 'PERSON',
      name: `Profesional ${id}`,
      slug: `perfil-${id}`,
      description: 'Perfil de prueba del módulo de perfil público.',
      shortBio: 'Electricista de prueba.',
      whatsappE164: `549381${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      baseCityId: ciudadBase,
      coversWholeProvince: true,
      coversOtherProvinces: ['SALTA'],
      moderationStatus: params?.moderacion ?? 'APPROVED',
      isPublished: params?.publicado ?? true,
      categories: {
        create: [
          { categoryId: rubroPrincipal, isPrimary: true },
          { categoryId: rubroSecundario, isPrimary: false },
        ],
      },
      coverage: {
        create: [{ cityId: ciudadCobertura }],
      },
      images: {
        create: [
          {
            publicId: `perfil/${id}/tercera`,
            url: `https://res.cloudinary.com/demo/image/upload/v1/${id}-3.jpg`,
            width: 800,
            height: 600,
            sortOrder: 2,
          },
          {
            publicId: `perfil/${id}/primera`,
            url: `https://res.cloudinary.com/demo/image/upload/v1/${id}-1.jpg`,
            width: 800,
            height: 600,
            sortOrder: 0,
          },
          {
            publicId: `perfil/${id}/oculta`,
            url: `https://res.cloudinary.com/demo/image/upload/v1/${id}-oculta.jpg`,
            width: 800,
            height: 600,
            sortOrder: 1,
            isHidden: true,
          },
        ],
      },
    },
    select: { id: true, slug: true },
  })

  return { profileId: perfil.id, userId: usuario.id, slug: perfil.slug }
}

async function main(): Promise<void> {
  const creados: string[] = []
  const hoy = new Date()
  const dia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))

  try {
    const publicado = await crearProfesional()
    creados.push(publicado.userId)

    titulo('Consulta del perfil')
    const perfil = await obtenerPerfilPublico(publicado.slug)

    comprobar('El perfil publicado se encuentra', Boolean(perfil))
    comprobar(
      'La consulta no selecciona el número de WhatsApp',
      perfil !== null && !('whatsappE164' in perfil),
    )
    comprobar(
      'Las imágenes visibles llegan ordenadas',
      Boolean(
        perfil &&
          perfil.images.length === 2 &&
          perfil.images[0]?.url.endsWith('-1.jpg') &&
          perfil.images[1]?.url.endsWith('-3.jpg'),
      ),
      perfil ? perfil.images.map((i) => i.url).join(', ') : 'sin perfil',
    )
    comprobar(
      'El rubro principal va primero',
      Boolean(perfil && perfil.categories[0]?.isPrimary),
    )
    comprobar(
      'Trae la provincia entera y la otra provincia',
      Boolean(
        perfil &&
          perfil.coversWholeProvince &&
          perfil.coversOtherProvinces.includes('SALTA'),
      ),
    )

    const sinPublicar = await crearProfesional({ publicado: false })
    creados.push(sinPublicar.userId)

    const suspendido = await crearProfesional({ moderacion: 'SUSPENDED' })
    creados.push(suspendido.userId)

    titulo('Condición pública')
    comprobar(
      'Un perfil no publicado no se encuentra',
      (await obtenerPerfilPublico(sinPublicar.slug)) === null,
    )
    comprobar(
      'Un perfil suspendido no se encuentra',
      (await obtenerPerfilPublico(suspendido.slug)) === null,
    )

    titulo('Visitas')
    const primera = await registrarVista({ slug: publicado.slug, ahora: hoy })
    const segunda = await registrarVista({ slug: publicado.slug, ahora: hoy })

    comprobar('La primera visita se cuenta', primera.ok && primera.data.contado)
    comprobar('La segunda visita se cuenta como otra vista', segunda.ok && segunda.data.contado)

    const trasVisitas = await prisma.profile.findUniqueOrThrow({
      where: { id: publicado.profileId },
      select: { viewsCount: true },
    })
    const estadistica = await prisma.profileDailyStat.findUnique({
      where: { profileId_date: { profileId: publicado.profileId, date: dia } },
    })

    comprobar('viewsCount sube una por visita', trasVisitas.viewsCount === 2)
    comprobar('La estadística diaria suma las dos', estadistica?.views === 2)

    const delDueno = await registrarVista({
      slug: publicado.slug,
      viewerUserId: publicado.userId,
      ahora: hoy,
    })
    const delBot = await registrarVista({
      slug: publicado.slug,
      contar: false,
      ahora: hoy,
    })
    const sinPublicarVista = await registrarVista({
      slug: sinPublicar.slug,
      ahora: hoy,
    })

    comprobar('La visita del dueño no suma', delDueno.ok && delDueno.data.contado === false)
    comprobar('La visita de un bot no suma', delBot.ok && delBot.data.contado === false)
    comprobar(
      'Una visita a un perfil no publicado devuelve NO_ENCONTRADO',
      !sinPublicarVista.ok && sinPublicarVista.code === 'NO_ENCONTRADO',
    )

    const trasExcluidas = await prisma.profile.findUniqueOrThrow({
      where: { id: publicado.profileId },
      select: { viewsCount: true },
    })
    comprobar('El contador quedó en 2 tras dueño y bot', trasExcluidas.viewsCount === 2)

    titulo('Datos estructurados')
    if (perfil) {
      const datos = construirJsonLd(perfil, 'https://poliservicios-noa.com.ar')
      const areas = datos.areaServed as { name: string }[]

      comprobar(
        'No hay aggregateRating',
        !('aggregateRating' in datos) && !JSON.stringify(datos).includes('aggregateRating'),
      )
      comprobar('No hay teléfono', !('telephone' in datos))
      comprobar(
        'areaServed incluye ciudad y provincia',
        areas.length >= 3 && areas.some((a) => a.name === 'Salta'),
      )
    } else {
      comprobar('No se pudo armar el JSON-LD sin perfil', false)
    }
  } finally {
    if (creados.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: creados } } })
    }

    await prisma.$disconnect()
  }

  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

  if (fallos > 0) {
    console.log(`${fallos} FALLARON`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error('\nError en la verificación:', error)
  process.exit(1)
})
