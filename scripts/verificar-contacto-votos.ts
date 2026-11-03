/**
 * Verificación del backend de contacto y corazón (módulo 3.1).
 *
 * Corre contra la base real del script de verificación, sin navegador y sin
 * proveedores externos. Lo que se prueba es la lógica que decide negocio:
 *
 * - el clic suma WhatsApp y estadística diaria, y los bots no suman;
 * - el ContactIntent solo existe con sesión CLIENT y no se duplica dentro de
 *   24 h;
 * - no se puede votar sin contacto, antes de la ventana o al propio perfil;
 * - el voto se alterna sin duplicar y el contador coincide siempre;
 * - la anulación admin corrige el contador y deja AuditLog;
 * - las dos señales de abuso se disparan;
 * - la lista de /mis-contactos deduplica y trae el estado del voto.
 *
 * Uso: npx tsx scripts/verificar-contacto-votos.ts
 */

import { PrismaClient } from '@prisma/client'

import { esBot } from '../src/lib/bots'
import { MENSAJE_CONTACTO } from '../src/lib/constantes'
import { registrarContacto } from '../src/services/contacto'
import {
  alternarVoto,
  anularVoto,
  estadoVoto,
  listarContactos,
} from '../src/services/votos'

const prisma = new PrismaClient()

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

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

async function catalogo(): Promise<{ categoryId: string; cityId: string }> {
  const [rubro, ciudad] = await Promise.all([
    prisma.category.findFirst({ select: { id: true } }),
    prisma.city.findFirst({ select: { id: true } }),
  ])

  if (!rubro || !ciudad) {
    throw new Error('El seed no dejó catálogo. Corré el seed antes de este script.')
  }

  return { categoryId: rubro.id, cityId: ciudad.id }
}

async function crearCliente(dominio = 'example.com'): Promise<{ id: string; email: string }> {
  const id = sufijo()
  const email = `cliente-${id}@${dominio}`

  const usuario = await prisma.user.create({
    data: {
      email,
      name: `Cliente ${id}`,
      emailVerified: new Date(),
      role: 'CLIENT',
    },
    select: { id: true, email: true },
  })

  return usuario
}

async function crearProfesional(params?: {
  publicado?: boolean
  conImagen?: boolean
  role?: 'PROFESSIONAL' | 'CLIENT'
}): Promise<{ profileId: string; userId: string; slug: string; email: string }> {
  const id = sufijo()
  const { categoryId, cityId } = await catalogo()
  const email = `profesional-${id}@example.com`

  const usuario = await prisma.user.create({
    data: {
      email,
      name: `Profesional ${id}`,
      emailVerified: new Date(),
      role: params?.role ?? 'PROFESSIONAL',
    },
    select: { id: true },
  })

  const perfil = await prisma.profile.create({
    data: {
      userId: usuario.id,
      type: 'PERSON',
      name: `Profesional ${id}`,
      slug: `contacto-${id}`,
      description: 'Perfil de prueba del módulo de contacto y votos.',
      whatsappE164: `549383${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      baseCityId: cityId,
      moderationStatus: 'APPROVED',
      isPublished: params?.publicado ?? true,
      categories: { create: { categoryId, isPrimary: true } },
      ...(params?.conImagen === false
        ? {}
        : {
            images: {
              create: {
                publicId: `contacto/${id}`,
                url: `https://res.cloudinary.com/demo/image/upload/v1/contacto-${id}.jpg`,
                width: 800,
                height: 600,
                sortOrder: 0,
              },
            },
          }),
    },
    select: { id: true, slug: true },
  })

  return { profileId: perfil.id, userId: usuario.id, slug: perfil.slug, email }
}

async function contactoPrevio(profileId: string, clientId: string, horas = 25): Promise<void> {
  const perfil = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    select: { slug: true },
  })

  const resultado = await registrarContacto({
    slug: perfil.slug,
    clientId,
    ahora: new Date(Date.now() - horas * HORA),
  })

  if (!resultado.ok) throw new Error(`No se pudo preparar el contacto: ${resultado.error}`)
}

async function main(): Promise<void> {
  titulo('Detección de bots')
  comprobar('WhatsApp preview es bot', esBot('WhatsApp/2.23 A'))
  comprobar('Googlebot es bot', esBot('Mozilla/5.0 (compatible; Googlebot/2.1)'))
  comprobar('Chrome de escritorio no es bot', !esBot('Mozilla/5.0 Chrome/120 Safari/537.36'))

  const profesional = await crearProfesional()
  const anonimo = new Date()

  titulo('Clic anónimo')
  const anonimoResultado = await registrarContacto({ slug: profesional.slug, ahora: anonimo })

  comprobar('El clic anónimo se registra', anonimoResultado.ok)
  comprobar(
    'La URL lleva el mensaje exacto',
    anonimoResultado.ok &&
      anonimoResultado.data.url ===
        `https://wa.me/${(await prisma.profile.findUniqueOrThrow({ where: { id: profesional.profileId }, select: { whatsappE164: true } })).whatsappE164}?text=${encodeURIComponent(MENSAJE_CONTACTO)}`,
  )

  const perfilTrasAnonimo = await prisma.profile.findUniqueOrThrow({
    where: { id: profesional.profileId },
    select: { whatsappClicks: true, contactsCount: true },
  })
  const intentsAnonimo = await prisma.contactIntent.count({
    where: { profileId: profesional.profileId },
  })
  const statsAnonimo = await prisma.profileDailyStat.findUnique({
    where: {
      profileId_date: {
        profileId: profesional.profileId,
        date: new Date(
          Date.UTC(anonimo.getUTCFullYear(), anonimo.getUTCMonth(), anonimo.getUTCDate()),
        ),
      },
    },
  })

  comprobar('whatsappClicks sube 1', perfilTrasAnonimo.whatsappClicks === 1)
  comprobar('contactsCount no cambia sin sesión', perfilTrasAnonimo.contactsCount === 0)
  comprobar('No se crea ContactIntent anónimo', intentsAnonimo === 0)
  comprobar('La estadística diaria registra el clic', statsAnonimo?.whatsappClicks === 1)

  const antesBot = perfilTrasAnonimo.whatsappClicks
  const botResultado = await registrarContacto({
    slug: profesional.slug,
    contar: false,
    ahora: anonimo,
  })
  const perfilTrasBot = await prisma.profile.findUniqueOrThrow({
    where: { id: profesional.profileId },
    select: { whatsappClicks: true },
  })

  comprobar('El bot igual recibe la redirección', botResultado.ok)
  comprobar('El bot no suma clics', perfilTrasBot.whatsappClicks === antesBot)

  titulo('Contacto de cliente y ventana de 24 h')
  const cliente = await crearCliente()
  const ahora = new Date()

  const primerContacto = await registrarContacto({
    slug: profesional.slug,
    clientId: cliente.id,
    ahora,
  })
  const segundoContacto = await registrarContacto({
    slug: profesional.slug,
    clientId: cliente.id,
    ahora: new Date(ahora.getTime() + 60 * 1000),
  })

  comprobar('El primer contacto crea intención', primerContacto.ok && primerContacto.data.intencionCreada)
  comprobar('El segundo contacto inmediato no crea otra', segundoContacto.ok && !segundoContacto.data.intencionCreada)

  const intentsCliente = await prisma.contactIntent.count({
    where: { profileId: profesional.profileId, clientId: cliente.id },
  })
  comprobar('Queda una sola intención en 24 h', intentsCliente === 1)

  await registrarContacto({
    slug: profesional.slug,
    clientId: cliente.id,
    ahora: new Date(ahora.getTime() + 25 * HORA),
  })
  const intentsDespues = await prisma.contactIntent.count({
    where: { profileId: profesional.profileId, clientId: cliente.id },
  })
  comprobar('Pasadas 24 h se puede volver a contar', intentsDespues === 2)

  titulo('Perfil no publicado')
  const oculto = await crearProfesional({ publicado: false })
  const contactoOculto = await registrarContacto({ slug: oculto.slug, clientId: cliente.id })

  comprobar('Contactar un perfil no publicado da NO_ENCONTRADO', !contactoOculto.ok && contactoOculto.code === 'NO_ENCONTRADO')
  comprobar('El perfil oculto no suma clics', (await prisma.profile.findUniqueOrThrow({ where: { id: oculto.profileId }, select: { whatsappClicks: true } })).whatsappClicks === 0)

  titulo('Reglas del voto')
  const sinContacto = await crearCliente()
  const votoSinContacto = await alternarVoto({
    profileId: profesional.profileId,
    clientId: sinContacto.id,
    ahora,
  })

  comprobar('Votar sin contacto devuelve SIN_PERMISOS', !votoSinContacto.ok && votoSinContacto.code === 'SIN_PERMISOS')

  const reciente = await crearCliente()
  await contactoPrevio(profesional.profileId, reciente.id, 2)
  const votoReciente = await alternarVoto({
    profileId: profesional.profileId,
    clientId: reciente.id,
    ahora,
  })

  comprobar('Votar antes de la ventana devuelve SIN_PERMISOS', !votoReciente.ok && votoReciente.code === 'SIN_PERMISOS')

  const estadoReciente = await estadoVoto({
    profileId: profesional.profileId,
    clientId: reciente.id,
    ahora,
  })
  comprobar('El estado explica que falta tiempo', estadoReciente.motivo === 'CONTACTO_RECIENTE')
  comprobar('El estado informa horas restantes', (estadoReciente.horasRestantes ?? 0) > 0)

  const elegible = await crearCliente()
  await contactoPrevio(profesional.profileId, elegible.id, 25)

  const estadoElegible = await estadoVoto({
    profileId: profesional.profileId,
    clientId: elegible.id,
    ahora,
  })
  comprobar('Con 25 h el cliente puede votar', estadoElegible.puedeVotar && estadoElegible.motivo === null)

  const primerVoto = await alternarVoto({
    profileId: profesional.profileId,
    clientId: elegible.id,
    ahora,
  })
  comprobar('El primer voto suma 1 corazón', primerVoto.ok && primerVoto.data.votado && primerVoto.data.corazones === 1)

  const segundoVoto = await alternarVoto({
    profileId: profesional.profileId,
    clientId: elegible.id,
    ahora: new Date(ahora.getTime() + 1000),
  })
  comprobar('El segundo toque retira el voto', segundoVoto.ok && !segundoVoto.data.votado && segundoVoto.data.corazones === 0)

  const tercerVoto = await alternarVoto({
    profileId: profesional.profileId,
    clientId: elegible.id,
    ahora: new Date(ahora.getTime() + 2000),
  })
  comprobar('El tercer toque vuelve a votar', tercerVoto.ok && tercerVoto.data.votado && tercerVoto.data.corazones === 1)

  const perfilVotado = await prisma.profile.findUniqueOrThrow({
    where: { id: profesional.profileId },
    select: { heartsCount: true },
  })
  const votosReales = await prisma.profileVote.count({
    where: { profileId: profesional.profileId },
  })
  comprobar('heartsCount coincide con ProfileVote', perfilVotado.heartsCount === votosReales && votosReales === 1)

  const propio = await crearProfesional({ role: 'CLIENT' })
  const votoPropio = await alternarVoto({
    profileId: propio.profileId,
    clientId: propio.userId,
    ahora,
  })
  comprobar('El dueño no puede votar su perfil', !votoPropio.ok && votoPropio.code === 'SIN_PERMISOS')

  titulo('Anulación administrativa')
  const voto = await prisma.profileVote.findUniqueOrThrow({
    where: { profileId_clientId: { profileId: profesional.profileId, clientId: elegible.id } },
    select: { id: true },
  })

  const anulacion = await anularVoto({
    voteId: voto.id,
    motivo: 'Prueba de anulación administrativa',
    actor: { id: 'admin-test', email: 'admin@example.com' },
  })
  const perfilAnulado = await prisma.profile.findUniqueOrThrow({
    where: { id: profesional.profileId },
    select: { heartsCount: true },
  })
  const audit = await prisma.auditLog.findFirst({
    where: { action: 'ANULAR_VOTO', entityId: voto.id },
    select: { id: true },
  })

  comprobar('La anulación borra el voto', anulacion.ok && (await prisma.profileVote.count({ where: { id: voto.id } })) === 0)
  comprobar('La anulación corrige el contador', perfilAnulado.heartsCount === 0)
  comprobar('La anulación deja AuditLog', Boolean(audit))

  titulo('Lista de /mis-contactos')
  const lista = await listarContactos({ clientId: cliente.id, ahora })
  comprobar('La lista trae el profesional contactado', lista.length === 1 && lista[0]?.profileId === profesional.profileId)
  comprobar('La lista deduplica contactos repetidos', intentsDespues === 2 && lista.length === 1)
  comprobar('La lista indica que todavía no puede votar', lista[0]?.puedeVotar === false)
  comprobar('La lista trae el rubro y la ciudad', Boolean(lista[0]?.rubro) && Boolean(lista[0]?.ciudad))

  titulo('Señal de muchos votos del mismo cliente')
  const votanteMasivo = await crearCliente()
  const perfilesMasivos: string[] = []

  for (let i = 0; i < 10; i++) {
    const perfil = await crearProfesional()
    perfilesMasivos.push(perfil.profileId)
    await contactoPrevio(perfil.profileId, votanteMasivo.id, 25)
    await alternarVoto({ profileId: perfil.profileId, clientId: votanteMasivo.id, ahora })
  }

  const senalMasiva = await prisma.riskSignal.findFirst({
    where: { profileId: perfilesMasivos[9], type: 'MUCHOS_VOTOS_MISMO_CLIENTE' },
    select: { id: true },
  })
  comprobar('Se registra la señal por votos en ráfaga', Boolean(senalMasiva))

  titulo('Señal de dominios desechables')
  const perfilDesechable = await crearProfesional()

  for (let i = 0; i < 3; i++) {
    const clienteDesechable = await crearCliente('mailinator.com')
    await contactoPrevio(perfilDesechable.profileId, clienteDesechable.id, 25)
    await alternarVoto({
      profileId: perfilDesechable.profileId,
      clientId: clienteDesechable.id,
      ahora,
    })
  }

  const senalDesechable = await prisma.riskSignal.findFirst({
    where: { profileId: perfilDesechable.profileId, type: 'VOTOS_DOMINIO_DESECHABLE' },
    select: { id: true, details: true },
  })
  comprobar('Se registra la señal por dominio desechable', Boolean(senalDesechable))

  titulo('Coherencia final')
  const incoherentes = await prisma.$queryRaw<{ id: string; guardado: number; real: bigint }[]>`
    SELECT p.id, p."heartsCount" AS guardado, COUNT(v.id) AS real
    FROM "Profile" p
    LEFT JOIN "ProfileVote" v ON v."profileId" = p.id
    GROUP BY p.id, p."heartsCount"
    HAVING p."heartsCount" <> COUNT(v.id)
  `

  comprobar('Ningún heartsCount quedó desfasado', incoherentes.length === 0, `desfasados: ${incoherentes.length}`)

  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

  if (fallos > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error: unknown) => {
    console.error('Error en la verificación:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
