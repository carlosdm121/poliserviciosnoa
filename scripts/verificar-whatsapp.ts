/**
 * Verificación del flujo de verificación de WhatsApp.
 *
 * Corre contra la base que levantó `scripts/verificar.ts` y no usa un runner de
 * tests: los casos necesitan una base de verdad (índices únicos, transacciones)
 * y el proyecto ya tiene el Postgres embebido montado para eso.
 *
 * Lo que se comprueba acá es lo que no se puede probar con funciones puras:
 * que un código sirva una sola vez, que el remitente tenga que ser el titular,
 * que dos perfiles no puedan tomar el mismo número, y que reenviar el mismo
 * webhook no verifique dos veces.
 *
 * Uso: npx tsx scripts/verificar-whatsapp.ts
 */

import { PrismaClient } from '@prisma/client'

import { hashTelefono } from '../src/lib/hash'
import { digitoVerificador } from '../src/lib/cuit'
import { setWhatsAppProvider } from '../src/lib/whatsapp'
import { firmar, firmaValida } from '../src/lib/whatsapp/firma'
import { MockWhatsAppProvider } from '../src/lib/whatsapp/mock'
import {
  bloquearIdentificador,
  desbloquearIdentificador,
  estaBloqueado,
} from '../src/services/bloqueo'
import { exigeAprobacionManual } from '../src/services/ajustes'
import {
  aprobarPerfil,
  setExigeAprobacionManual,
  suspenderPerfil,
} from '../src/services/moderacion'
import { guardarPerfil } from '../src/services/perfil'
import type { PerfilInput } from '../src/schemas/perfil'
import { sincronizarPublicacion } from '../src/services/publicacion'
import {
  obtenerEstado,
  procesarMensajeEntrante,
  solicitarCodigo,
  verificarManualmente,
} from '../src/services/verificacion-whatsapp'

const prisma = new PrismaClient()
const mock = new MockWhatsAppProvider()

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

/** Fecha en el futuro, para la suscripción de prueba. */
function futuro(dias: number): Date {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
}

/** Primer rubro del catálogo, para armar un perfil publicable. */
async function primerRubro(): Promise<string> {
  const rubro = await prisma.category.findFirst({ select: { id: true } })

  if (!rubro) throw new Error('El catálogo está vacío: corré el seed antes.')

  return rubro.id
}

/** Primera ciudad del catálogo. */
async function primerCiudad(): Promise<string> {
  const ciudad = await prisma.city.findFirst({ select: { id: true } })

  if (!ciudad) throw new Error('El catálogo está vacío: corré el seed antes.')

  return ciudad.id
}

/** Plan activo para la suscripción de prueba. */
async function planActivo(): Promise<string> {
  const plan = await prisma.plan.findFirst({ where: { isActive: true }, select: { id: true } })

  if (!plan) throw new Error('No hay plan activo: corré el seed antes.')

  return plan.id
}

/**
 * Crea un profesional con perfil. El número se pasa ya normalizado.
 *
 * Los slugs llevan un sufijo aleatorio porque son únicos y los tests pueden
 * correr varias veces sobre la misma base.
 */
async function crearProfesional(
  email: string,
  numero: string,
): Promise<{ userId: string; profileId: string }> {
  const sufijo = Math.random().toString(36).slice(2, 8)

  const usuario = await prisma.user.create({
    data: {
      email,
      passwordHash: 'hash-falso-para-pruebas',
      role: 'PROFESSIONAL',
      emailVerified: new Date(),
      profile: {
        create: {
          name: `Profesional ${email}`,
          slug: `profesional-${email}-${sufijo}`,
          whatsappE164: numero,
          type: 'PERSON',
        },
      },
    },
    select: { id: true, profile: { select: { id: true } } },
  })

  return { userId: usuario.id, profileId: usuario.profile?.id ?? '' }
}

async function main(): Promise<void> {
  // El mock evita llamadas de red y deja el registro de lo enviado, que es lo
  // que usa un caso para comprobar que se respondió al remitente.
  setWhatsAppProvider(mock)

  const prefijo = Math.random().toString(36).slice(2, 8)
  const numeroUno = '5493814123456'
  const numeroDos = '5492615223344'

  const profeUno = await crearProfesional(`p1-${prefijo}@test.com`, numeroUno)
  const profeDos = await crearProfesional(`p2-${prefijo}@test.com`, numeroDos)

  // -------------------------------------------------------------------------
  titulo('El remitente tiene que ser el titular del número')

  const pedido = await solicitarCodigo(profeUno.profileId, '3814123456')

  if (!pedido.ok) {
    comprobar('se genera un código', false, pedido.error)
    return
  }

  comprobar('se genera un código', true)
  comprobar('el código tiene 6 caracteres', pedido.data.codigo.length === 6)

  const codigoUno = pedido.data.codigo
  const codigoHash = hashTelefono(codigoUno)

  // Mismo código, remitente que no es el del perfil.
  const ajeno = await procesarMensajeEntrante(
    '5491111111111',
    `Código: ${codigoUno}`,
    `wamid.ajeno.${prefijo}`,
  )

  comprobar('con un número ajeno no verifica', ajeno.ok && ajeno.data.accion === 'ignorado')

  const trasAjeno = await obtenerEstado(profeUno.profileId)
  comprobar(
    'el intento ajeno cuenta como intento fallido',
    trasAjeno !== null && trasAjeno.intentosRestantes === 4,
    `intentos restantes: ${trasAjeno?.intentosRestantes}`,
  )

  const desdeElDueño = await procesarMensajeEntrante(
    numeroUno,
    `Verifico mi número. Código: ${codigoUno}`,
    `wamid.bien.${prefijo}`,
  )

  comprobar(
    'desde el número correcto sí verifica',
    desdeElDueño.ok && desdeElDueño.data.accion === 'verificado',
  )

  const perfilVerificado = await prisma.profile.findUnique({
    where: { id: profeUno.profileId },
    select: { whatsappVerifiedAt: true, whatsappHash: true },
  })

  comprobar(
    'el perfil queda con whatsappVerifiedAt',
    perfilVerificado?.whatsappVerifiedAt !== null,
  )
  comprobar(
    'el perfil guarda el hash del número',
    perfilVerificado?.whatsappHash === hashTelefono(numeroUno),
  )
  comprobar('se le respondió al remitente', mock.enviados.length > 0)

  // -------------------------------------------------------------------------
  titulo('Un código sirve una sola vez')

  const repetido = await procesarMensajeEntrante(
    numeroUno,
    `Código: ${codigoUno}`,
    `wamid.bien.${prefijo}`,
  )

  comprobar(
    'el mismo wamid repetido no verifica de nuevo',
    repetido.ok && repetido.data.accion === 'duplicado',
  )

  const otroWamidMismoCodigo = await procesarMensajeEntrante(
    numeroUno,
    `Código: ${codigoUno}`,
    `wamid.otro.${prefijo}`,
  )

  comprobar(
    'otro mensaje con el código ya usado no verifica',
    otroWamidMismoCodigo.ok && otroWamidMismoCodigo.data.accion === 'ignorado',
  )

  // -------------------------------------------------------------------------
  titulo('Las dos variantes del mismo número funcionan')

  const pedidoDos = await solicitarCodigo(profeDos.profileId, numeroDos)

  if (!pedidoDos.ok) {
    comprobar('se genera un segundo código', false, pedidoDos.error)
  } else {
    comprobar('se genera un segundo código', true)

    const sinNueve = await procesarMensajeEntrante(
      '54' + numeroDos.slice(3),
      `Código: ${pedidoDos.data.codigo}`,
      `wamid.sin9.${prefijo}`,
    )

    comprobar(
      'Meta puede entregar el remitente sin el 9 y sigue funcionando',
      sinNueve.ok && sinNueve.data.accion === 'verificado',
    )
  }

  // -------------------------------------------------------------------------
  titulo('Cinco intentos con números ajenos bloquean la verificación')

  const profeTres = await crearProfesional(`p3-${prefijo}@test.com`, '5493814777888')
  const pedidoTres = await solicitarCodigo(profeTres.profileId, '3814777888')

  if (!pedidoTres.ok) {
    comprobar('se genera el tercer código', false, pedidoTres.error)
  } else {
    for (let intento = 1; intento <= 5; intento++) {
      await procesarMensajeEntrante(
        '5491111111111',
        `Código: ${pedidoTres.data.codigo}`,
        `wamid.intento${intento}.${prefijo}`,
      )
    }

    const bloqueado = await prisma.whatsAppVerification.findFirst({
      where: { profileId: profeTres.profileId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, attempts: true },
    })

    comprobar('queda LOCKED tras 5 intentos', bloqueado?.status === 'LOCKED')
    comprobar('quedan los 5 intentos registrados', bloqueado?.attempts === 5)
  }

  // -------------------------------------------------------------------------
  titulo('Dos perfiles no pueden tomar el mismo número')

  const profeCuatro = await crearProfesional(`p4-${prefijo}@test.com`, '5493814555666')
  const codigoOriginal = await solicitarCodigo(profeCuatro.profileId, '3814555666')

  comprobar('el perfil 4 arranca con su propio número', codigoOriginal.ok)

  // El profesional 4 escribe el número que ya tiene el perfil 1 verificado.
  const intentoRobo = await solicitarCodigo(profeCuatro.profileId, numeroUno)

  comprobar('no puede pedir código para el número de otro', !intentoRobo.ok)
  comprobar(
    'y se le dice por qué',
    !intentoRobo.ok && intentoRobo.code === 'DUPLICADO',
    intentoRobo.ok ? 'aceptó el número' : intentoRobo.error,
  )

  const perfilCuatro = await prisma.profile.findUnique({
    where: { id: profeCuatro.profileId },
    select: { whatsappE164: true, whatsappVerifiedAt: true },
  })

  comprobar(
    'el perfil 4 conserva su número y no queda verificado',
    perfilCuatro?.whatsappE164 === '5493814555666' && perfilCuatro?.whatsappVerifiedAt === null,
  )

  const yaRegistrado = await prisma.profile.count({
    where: { whatsappHash: hashTelefono(numeroUno) },
  })

  comprobar(
    'el hash del número sigue siendo único',
    yaRegistrado === 1,
    `encontrados: ${yaRegistrado}`,
  )

  // -------------------------------------------------------------------------
  titulo('Verificación manual del administrador')

  const profeCinco = await crearProfesional(`p5-${prefijo}@test.com`, '5493814333444')
  const sinMotivo = await verificarManualmente(profeCinco.profileId, 'admin@test.com', '  ')

  comprobar('sin motivo no se verifica', !sinMotivo.ok)

  const manual = await verificarManualmente(
    profeCinco.profileId,
    'admin@test.com',
    'Meta no tenía el número configurado',
  )

  comprobar('con motivo se verifica', manual.ok)

  const auditoria = await prisma.auditLog.findFirst({
    where: { entityId: profeCinco.profileId, action: 'whatsapp.verificacion_manual' },
    select: { actorEmail: true, after: true },
  })

  comprobar('queda en el AuditLog', auditoria !== null)
  comprobar(
    'el AuditLog no guarda el teléfono en claro',
    auditoria !== null && !JSON.stringify(auditoria.after).includes('5493814333444'),
  )

  // -------------------------------------------------------------------------
  titulo('Firma del webhook')

  const cuerpo = '{"object":"whatsapp_business_account"}'
  const firmaBuena = firmar(cuerpo, 'secreto-de-meta')

  comprobar('una firma correcta pasa', firmaValida(cuerpo, firmaBuena, 'secreto-de-meta'))
  comprobar('una firma falsa se rechaza', !firmaValida(cuerpo, 'sha256=' + 'a'.repeat(64), 'secreto-de-meta'))
  comprobar('sin header se rechaza', !firmaValida(cuerpo, null, 'secreto-de-meta'))
  comprobar('con otro secreto se rechaza', !firmaValida(cuerpo, firmaBuena, 'otro-secreto'))

  // El cuerpo cambia una coma y la firma deja de servir. Es exactamente el
  // caso que rompe si se parsea y se reserializa antes de comparar.
  comprobar(
    'el cuerpo tiene que ser exactamente el que firmó Meta',
    !firmaValida(`${cuerpo} `, firmaBuena, 'secreto-de-meta'),
  )

  comprobar(
    'una firma con formato inválido no revienta',
    !firmaValida(cuerpo, 'sha256=corto', 'secreto-de-meta'),
  )

  // -------------------------------------------------------------------------
  titulo('Un código vencido no verifica')

  const profeSeis = await crearProfesional(`p6-${prefijo}@test.com`, '5493814222111')
  const pedidoSeis = await solicitarCodigo(profeSeis.profileId, '3814222111')

  if (!pedidoSeis.ok) {
    comprobar('se genera el sexto código', false, pedidoSeis.error)
  } else {
    const verificacionSeis = await prisma.whatsAppVerification.findFirst({
      where: { profileId: profeSeis.profileId, status: 'PENDING' },
      select: { id: true },
    })

    await prisma.whatsAppVerification.update({
      where: { id: verificacionSeis?.id ?? '' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const vencido = await procesarMensajeEntrante(
      '5493814222111',
      `Código: ${pedidoSeis.data.codigo}`,
      `wamid.vencido.${prefijo}`,
    )

    comprobar('un código vencido no verifica', vencido.ok && vencido.data.accion === 'ignorado')

    const perfilSeis = await prisma.profile.findUnique({
      where: { id: profeSeis.profileId },
      select: { whatsappVerifiedAt: true },
    })

    comprobar('el perfil queda sin verificar', perfilSeis?.whatsappVerifiedAt === null)
  }

  // -------------------------------------------------------------------------
  titulo('Límite de códigos por hora')

  const profeSiete = await crearProfesional(`p7-${prefijo}@test.com`, '5493814111222')
  let pedidos = 0
  let limitado = false

  // El perfil pide más de lo permitido en la ventana de una hora.
  for (let intento = 0; intento < 7; intento++) {
    const resultado = await solicitarCodigo(profeSiete.profileId, '3814111222')
    if (resultado.ok) pedidos += 1
    if (!resultado.ok && resultado.code === 'RATE_LIMIT') limitado = true
  }

  comprobar('pide hasta 5 códigos por hora', pedidos === 5, `pedidos: ${pedidos}`)
  comprobar('del sexto en adelante lo bloquea', limitado)

  // -------------------------------------------------------------------------
  titulo('Aviso al titular y respuesta "NO FUI YO"')

  const numeroTitular = '5493814777000'
  const impostor = await crearProfesional(`impostor-${prefijo}@test.com`, '5493814666000')
  const codigoImpostor = await solicitarCodigo(impostor.profileId, '3814666000')

  if (!codigoImpostor.ok) {
    comprobar('el impostor pide un código', false, codigoImpostor.error)
  } else {
    // El impostor carga el número de otra persona y le pide que mande el código.
    // La titular obedece sin saber para qué.
    await prisma.profile.update({
      where: { id: impostor.profileId },
      data: { whatsappE164: numeroTitular },
    })

    const codigoDeLaVictima = await solicitarCodigo(impostor.profileId, numeroTitular)

    if (!codigoDeLaVictima.ok) {
      comprobar('el impostor pide código para el número ajeno', false, codigoDeLaVictima.error)
    } else {
      await procesarMensajeEntrante(
        numeroTitular,
        `Código: ${codigoDeLaVictima.data.codigo}`,
        `wamid.impostor.${prefijo}`,
      )

      const verificado = await prisma.profile.findUnique({
        where: { id: impostor.profileId },
        select: { whatsappVerifiedAt: true },
      })

      comprobar('el impostor logra verificar el número ajeno', verificado?.whatsappVerifiedAt !== null)

      // Se mandó el aviso al titular. Es el punto: sin este mensaje el
      // impostor publica con su número y nadie se entera.
      const aviso = mock.enviados.find((e) => e.cuerpo.includes('NO FUI YO'))

      comprobar('se le avisó al titular que su número quedó verificado', aviso !== undefined)

      // La titular responde.
      const antesDeLiberar = mock.enviados.length

      const respuesta = await procesarMensajeEntrante(
        numeroTitular,
        'NO FUI YO',
        `wamid.nofuiyo.${prefijo}`,
      )

      comprobar('procesa el "NO FUI YO"', respuesta.ok && respuesta.data.accion === 'liberado')

      const despues = await prisma.profile.findUnique({
        where: { id: impostor.profileId },
        select: { whatsappVerifiedAt: true, whatsappHash: true, moderationStatus: true },
      })

      comprobar('el impostor pierde la verificación', despues?.whatsappVerifiedAt === null)
      comprobar('el impostor pierde el hash del número', despues?.whatsappHash === null)
      comprobar('el impostor vuelve a PENDING_REVIEW', despues?.moderationStatus === 'PENDING_REVIEW')

      const senales = await prisma.riskSignal.count({
        where: { profileId: impostor.profileId, type: 'NO_FUI_YO' },
      })

      comprobar('queda registrado como señal de riesgo', senales === 1)

      comprobar(
        'se le responde a la titular',
        mock.enviados.length > antesDeLiberar,
      )

      // El perfil quedó sin verificar, así que la regla de publicación lo saca
      // de línea aunque tenga todo lo demás.
      const publicado = await prisma.profile.findUnique({
        where: { id: impostor.profileId },
        select: { isPublished: true },
      })

      comprobar('el impostor queda despublicado', publicado?.isPublished === false)
    }
  }

  // -------------------------------------------------------------------------
  titulo('Lista de bloqueo')

  const numeroBloqueado = '5493814333555'

  const sinMotivoBloqueo = await bloquearIdentificador(
    'WHATSAPP_HASH',
    numeroBloqueado,
    '   ',
    'admin@test.com',
  )

  comprobar('sin motivo no bloquea', !sinMotivoBloqueo.ok)

  const bloqueado = await bloquearIdentificador(
    'WHATSAPP_HASH',
    numeroBloqueado,
    'Perfil suspendido por fraude.',
    'admin@test.com',
  )

  comprobar('con motivo bloquea', bloqueado.ok)
  comprobar('consulta que está bloqueado', await estaBloqueado('WHATSAPP_HASH', numeroBloqueado))
  comprobar('otro tipo no se confunde', !(await estaBloqueado('EMAIL', numeroBloqueado)))

  const profeBloqueado = await crearProfesional(
    `bloq-${prefijo}@test.com`,
    '3814333555',
  )
  const codigoBloqueado = await solicitarCodigo(profeBloqueado.profileId, '3814333555')

  comprobar(
    'un número bloqueado no genera código',
    !codigoBloqueado.ok && codigoBloqueado.code === 'SIN_PERMISOS',
    codigoBloqueado.ok ? 'lo generó igual' : codigoBloqueado.error,
  )

  // La lista guarda hashes, no el número.
  const fila = await prisma.blockedIdentifier.findFirst({ select: { valueHash: true } })
  comprobar(
    'la lista guarda el hash y no el teléfono',
    fila !== null && !fila.valueHash.includes(numeroBloqueado.slice(0, 6)),
  )

  const auditoriaBloqueo = await prisma.auditLog.count({
    where: { action: 'bloqueo.agregar', entityId: fila?.valueHash },
  })

  comprobar('el bloqueo queda en el AuditLog', auditoriaBloqueo === 1)

  const desbloqueado = await desbloquearIdentificador(
    'WHATSAPP_HASH',
    numeroBloqueado,
    'admin@test.com',
  )

  comprobar('se puede desbloquear', desbloqueado.ok)
  comprobar('ya no está bloqueado', !(await estaBloqueado('WHATSAPP_HASH', numeroBloqueado)))

  // -------------------------------------------------------------------------
  titulo('Revisión manual configurable')

  const flagOff = await exigeAprobacionManual()
  comprobar('la bandera arranca apagada', flagOff === false)

  // Con la bandera apagada, un perfil PENDING_REVIEW se publica igual.
  const profeOcho = await crearProfesional(`aprob-${prefijo}@test.com`, '5493814900011')
  await prisma.profile.update({
    where: { id: profeOcho.profileId },
    data: {
      whatsappVerifiedAt: new Date(),
      whatsappHash: hashTelefono('5493814900011'),
      description: 'Electricista con quince años de oficio en la zona.',
      baseCityId: await primerCiudad(),
      subscription: {
        create: {
          planId: await planActivo(),
          planAmount: 10000,
          status: 'ACTIVE',
          currentPeriodEnd: futuro(30),
        },
      },
    },
  })
  await prisma.profileCategory.create({
    data: { profileId: profeOcho.profileId, categoryId: await primerRubro(), isPrimary: true },
  })

  // Sin foto el perfil no se publica (la regla de publicación la exige), así
  // que hay que dársela para que la prueba mida lo de la aprobación y no lo de
  // la galería.
  await prisma.image.create({
    data: {
      profileId: profeOcho.profileId,
      publicId: `prueba/${prefijo}`,
      url: `https://res.cloudinary.com/prueba/image/upload/prueba-${prefijo}.jpg`,
      width: 800,
      height: 600,
    },
  })

  await sincronizarPublicacion(profeOcho.profileId)

  const sinAprobacion = await prisma.profile.findUnique({
    where: { id: profeOcho.profileId },
    select: { isPublished: true, unpublishedReason: true },
  })

  comprobar(
    'sin la bandera, un perfil pendiente se publica',
    sinAprobacion?.isPublished === true,
    `motivo: ${sinAprobacion?.unpublishedReason}`,
  )

  // Prendo la bandera.
  await setExigeAprobacionManual(true, 'admin@test.com')

  const despuesDePrender = await prisma.profile.findUnique({
    where: { id: profeOcho.profileId },
    select: { isPublished: true, unpublishedReason: true },
  })

  comprobar(
    'con la bandera prendida, deja de aparecer',
    despuesDePrender?.isPublished === false,
  )
  comprobar(
    'y el motivo dice que falta la aprobación',
    despuesDePrender?.unpublishedReason === 'APROBACION_PENDIENTE',
    `motivo: ${despuesDePrender?.unpublishedReason}`,
  )

  const aprobado = await aprobarPerfil(profeOcho.profileId, 'admin@test.com', 'Revisado a mano')

  comprobar('aprobar devuelve ok', aprobado.ok)

  const trasAprobar = await prisma.profile.findUnique({
    where: { id: profeOcho.profileId },
    select: { isPublished: true, moderationStatus: true },
  })

  comprobar('aprobado vuelve a la búsqueda', trasAprobar?.isPublished === true)
  comprobar('queda APPROVED', trasAprobar?.moderationStatus === 'APPROVED')

  // Y apagar la bandera devuelve el comportamiento anterior.
  await setExigeAprobacionManual(false, 'admin@test.com')

  const flagOffAgain = await exigeAprobacionManual()
  comprobar('se puede volver a apagar', flagOffAgain === false)

  // -------------------------------------------------------------------------
  titulo('Suspensión')

  const suspendido = await suspenderPerfil(
    profeOcho.profileId,
    'admin@test.com',
    'Reclamos de varios clientes.',
  )

  comprobar('suspender devuelve ok', suspendido.ok)

  const sinMotivoSuspension = await suspenderPerfil(profeOcho.profileId, 'admin@test.com', '')

  comprobar('suspender sin motivo no se deja', !sinMotivoSuspension.ok)

  const trasSuspender = await prisma.profile.findUnique({
    where: { id: profeOcho.profileId },
    select: { isPublished: true, moderationStatus: true, moderationReason: true },
  })

  comprobar('suspendido desaparece de la búsqueda', trasSuspender?.isPublished === false)
  comprobar('queda SUSPENDED', trasSuspender?.moderationStatus === 'SUSPENDED')
  comprobar(
    'el motivo queda guardado',
    trasSuspender?.moderationReason === 'Reclamos de varios clientes.',
  )

  // -------------------------------------------------------------------------
  titulo('Guardado de perfil')

  const perfil = await crearProfesional(`edicion-${prefijo}@test.com`, '5493814555000')
  const ciudadTucuman = await prisma.city.findFirst({
    where: { province: 'TUCUMAN' },
    select: { id: true },
  })
  const ciudadSalta = await prisma.city.findFirst({
    where: { province: 'SALTA' },
    select: { id: true },
  })
  const rubroGas = await prisma.category.findFirst({
    where: { slug: 'gas-matriculado' },
    select: { id: true },
  })
  const rubroPlomeria = await prisma.category.findFirst({
    where: { slug: 'plomeria' },
    select: { id: true },
  })

  const subPlomeria = await prisma.subcategory.findFirst({
    where: { categoryId: rubroPlomeria?.id },
    select: { id: true },
  })
  const subGas = await prisma.subcategory.findFirst({
    where: { categoryId: rubroGas?.id },
    select: { id: true },
  })

const formularioValido: PerfilInput = {
    type: 'PERSON',
    name: 'Carlos Ramírez',
    description: 'Plomero con quince años de oficio en Tucumán. Hago averías e instalaciones.',
    company: {},
    ubicacion: {
      province: 'TUCUMAN',
      baseCityId: ciudadTucuman?.id ?? '',
      coversWholeProvince: false,
      otherProvinces: [],
      cityIds: [],
    },
    catalogo: {
      primaryCategoryId: rubroPlomeria?.id ?? '',
      secondaryCategoryId: '',
      subcategoryIds: subPlomeria ? [subPlomeria.id] : [],
      licenseNumber: '',
    },
  }

  const guardado = await guardarPerfil(perfil.profileId, formularioValido)

  comprobar('guarda un perfil válido', guardado.ok, guardado.ok ? '' : guardado.error)

  const guardadoEnBase = await prisma.profile.findUnique({
    where: { id: perfil.profileId },
    select: { name: true, baseCityId: true, categories: true, subcategories: true },
  })

  comprobar('persiste el nombre', guardadoEnBase?.name === 'Carlos Ramírez')
  comprobar('persiste la ciudad base', guardadoEnBase?.baseCityId === (ciudadTucuman?.id ?? null))
  comprobar('persiste el rubro principal', guardadoEnBase?.categories.length === 1)

  // --- Ciudad de otra provincia ---
  const ciudadIncorrecta = await guardarPerfil(perfil.profileId, {
    ...formularioValido,
    ubicacion: { ...formularioValido.ubicacion, baseCityId: ciudadSalta?.id ?? '' },
  })

  comprobar(
    'rechaza una ciudad de otra provincia',
    !ciudadIncorrecta.ok && ciudadIncorrecta.error.includes('provincia'),
    ciudadIncorrecta.ok ? 'la aceptó' : ciudadIncorrecta.error,
  )

  // --- Subcategoría ajena al rubro ---
  if (subGas) {
    const subAjena = await guardarPerfil(perfil.profileId, {
      ...formularioValido,
      catalogo: { ...formularioValido.catalogo, subcategoryIds: [subGas.id] },
    })

    comprobar(
      'rechaza una subcategoría de otro rubro',
      !subAjena.ok && subAjena.error.includes('rubro'),
      subAjena.ok ? 'la aceptó' : subAjena.error,
    )
  }

// --- Más de 2 rubros por API ---
  // El secundario tiene que ser un rubro no regulado: si fuera el gas, el
  // guardado fallaría por la matrícula y no por el límite de rubros, y la
  // prueba no mediría lo que dice medir.
  const rubroSecundario = await prisma.category.findFirst({
    where: { isActive: true, requiresLicense: false, id: { not: rubroPlomeria?.id ?? '' } },
    select: { id: true },
  })

  const dosRubros = await guardarPerfil(perfil.profileId, {
    ...formularioValido,
    catalogo: {
      primaryCategoryId: rubroPlomeria?.id ?? '',
      secondaryCategoryId: rubroSecundario?.id ?? '',
      subcategoryIds: [],
      licenseNumber: '',
    },
  })

  comprobar(
    'guarda con dos rubros',
    dosRubros.ok,
    dosRubros.ok ? '' : dosRubros.error,
  )

  const cantidadRubros = await prisma.profileCategory.count({
    where: { profileId: perfil.profileId },
  })

  comprobar('quedan 2 rubros como máximo', cantidadRubros <= 2, `encontrados: ${cantidadRubros}`)

  // --- Matrícula obligatoria en rubro regulado ---
  if (rubroGas) {
    const sinMatricula = await guardarPerfil(perfil.profileId, {
      ...formularioValido,
      catalogo: {
        primaryCategoryId: rubroGas.id,
        secondaryCategoryId: '',
        subcategoryIds: [],
        licenseNumber: '',
      },
    })

    comprobar(
      'exige matrícula en un rubro regulado',
      !sinMatricula.ok && sinMatricula.error.includes('Matr'),
      sinMatricula.ok ? 'la aceptó sin matrícula' : sinMatricula.error,
    )

    const conMatricula = await guardarPerfil(perfil.profileId, {
      ...formularioValido,
      catalogo: {
        primaryCategoryId: rubroGas.id,
        secondaryCategoryId: '',
        subcategoryIds: [],
        licenseNumber: '12345',
      },
    })

    comprobar('con matrícula, guarda', conMatricula.ok, conMatricula.ok ? '' : conMatricula.error)

    const conMatriculaEnBase = await prisma.profile.findUnique({
      where: { id: perfil.profileId },
      select: { licenseNumber: true },
    })

    comprobar('persiste la matrícula', conMatriculaEnBase?.licenseNumber === '12345')
  }

  // --- CUIT duplicado ---
  const prefijoCuit = '3355550000'
  const cuitUno = `${prefijoCuit}${digitoVerificador(`${prefijoCuit}0`)}`
  const cuitDos = `3477770000${digitoVerificador('34777700000')}`
  const empresaA = await crearProfesional(`emp-a-${prefijo}@test.com`, '5493814666001')
  const empresaB = await crearProfesional(`emp-b-${prefijo}@test.com`, '5493814666002')

const empresa: PerfilInput = {
    ...formularioValido,
    type: 'COMPANY',
    company: { companyName: 'El service SRL', cuit: cuitUno },
  }

  const primeraEmpresa = await guardarPerfil(empresaA.profileId, empresa)

  comprobar('guarda una empresa con CUIT válido', primeraEmpresa.ok, primeraEmpresa.ok ? '' : primeraEmpresa.error)

  const cuitRepetido = await guardarPerfil(empresaB.profileId, {
    ...empresa,
    company: { companyName: 'Otra SRL', cuit: cuitUno },
  })

  comprobar(
    'rechaza un CUIT ya usado',
    !cuitRepetido.ok && cuitRepetido.error.includes('CUIT'),
    cuitRepetido.ok ? 'lo aceptó' : cuitRepetido.error,
  )

  const cuitDistinto = await guardarPerfil(empresaB.profileId, {
    ...empresa,
    company: { companyName: 'Otra SRL', cuit: cuitDos },
  })

  comprobar('acepta un CUIT distinto', cuitDistinto.ok, cuitDistinto.ok ? '' : cuitDistinto.error)

  // Cambiar de persona a empresa borra los datos de empresa: dejarlo cargado
  // hace que un perfil que dice "persona" tenga un CUIT ocupando el índice.
  const volverAPersona = await guardarPerfil(empresaA.profileId, formularioValido)

  comprobar('vuelve a perfil de persona', volverAPersona.ok)

  const sinCuit = await prisma.profile.findUnique({
    where: { id: empresaA.profileId },
    select: { cuit: true, cuitHash: true },
  })

  comprobar('al volver a persona, borra el CUIT', sinCuit?.cuit === null && sinCuit?.cuitHash === null)

  // -------------------------------------------------------------------------
  console.log('\n=========================')
  console.log(`Verificación de WhatsApp: ${pruebas - fallos}/${pruebas} pruebas OK`)
  console.log(fallos === 0 ? 'RESULTADO: OK' : `RESULTADO: ${fallos} FALLAS`)
  console.log('=========================')

  if (fallos > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error('\nError en la verificación de WhatsApp:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })