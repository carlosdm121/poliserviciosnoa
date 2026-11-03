/**
 * Verificación del flujo de suscripción con Mercado Pago.
 *
 * El módulo 2.3 tiene criterios que no se pueden probar en memoria: que dos
 * altas simultáneas no dejen dos cobros abiertos, que el precio congelado
 * sobreviva a un reintento, y que cancelar no despublique el perfil. Los tres
 * son afirmaciones sobre lo que escribe la base, así que van acá y no en
 * Vitest. Lo puro —el importe que va a la pasarela, el fin del período, los
 * requisitos— sí está en `tests/suscripcion.test.ts`.
 *
 * Corre contra el proveedor **mock**: el script no puede abrir checkouts reales
 * ni depender de credenciales. Lo que se verifica es lo que es nuestro, no lo
 * que hace Mercado Pago. Que la API real acepte el preapproval se prueba una vez
 * a mano con las tarjetas de prueba de `docs/mercadopago-config.md`.
 *
 * Uso: npx tsx scripts/verificar-suscripcion.ts
 */

import { Prisma, PrismaClient, SubscriptionStatus } from '@prisma/client'

import { limpiarMockMercadoPago, estadoPreapprovalMock, preapprovalsVivosMock } from '../src/lib/mp'
import { limpiarCachePlan, montoVigente } from '../src/services/planes'
import { sincronizarPublicacion } from '../src/services/publicacion'
import {
  cancelarRenovacion,
  crearSuscripcion,
  guardarDatosFiscales,
  obtenerSuscripcion,
  requisitosDePago,
} from '../src/services/suscripcion'

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

/**
 * CUITs válidos, calculados con el módulo 11 de `lib/cuit.ts`.
 *
 * Van escritos y no generados en el script a propósito: el hash del documento es
 * único en la base, así que si dos profesionales de prueba usaran el mismo
 * CUIT el segundo sería rechazado y la comprobación siguiente estaría probando
 * el hash en lugar de lo que dice. Los prefijos alternan 30, 33 y 34 para que
 * el script también recorra los dos caminos del validador.
 */
const CUITS = [
  '30123456781',
  '33123456780',
  '34123456787',
  '30234567892',
  '33234567891',
  '34234567898',
  '30345678901',
  '33345678900',
  '34345678907',
] as const

/** El siguiente CUIT libre de la lista. Falla antes que devolver uno repetido. */
let siguienteCuit = 0

function tomarCuit(): string {
  const cuit = CUITS[siguienteCuit]

  if (!cuit) throw new Error('Se usaron más CUITs de prueba de los que hay en la lista.')

  siguienteCuit += 1

  return cuit
}

const ACEPTACION = { aceptaTerminos: true }

// ---------------------------------------------------------------------------
// Helpers de escenario
// ---------------------------------------------------------------------------

type PerfilDePrueba = {
  userId: string
  profileId: string
}

/**
 * Crea un profesional listo para pagar: email verificado, WhatsApp verificado,
 * rubro principal, descripción larga, ciudad y una foto.
 *
 * La foto está porque `evaluarPublicacion` la exige. Sin ella el perfil no es
 * publicable nunca y `sincronizarPublicacion` lo despublica siempre, lo que hace
 * imposible comprobar lo que este módulo importa: que **cancelar** la renovación
 * no despublica. Un perfil que ya estaba despublicado no demuestra nada.
 *
 * Se arma con escrituras directas y no con `services/perfil.ts` a propósito:
 * este script prueba la suscripción, y atar el perfil a la lógica de perfiles
 * haría que un cambio en `perfil.ts` rompiera las pruebas de un módulo que no es
 * el suyo.
 */
async function crearProfesionalListo(nombre: string): Promise<PerfilDePrueba> {
  const sufijo = Math.random().toString(36).slice(2, 8)

  const user = await prisma.user.create({
    data: {
      email: `suscripcion-${nombre}-${sufijo}@example.com`,
      emailVerified: new Date(),
      name: nombre,
    },
    select: { id: true },
  })

  const rubro = await prisma.category.findFirst({ select: { id: true } })
  const ciudad = await prisma.city.findFirst({ select: { id: true } })

  if (!rubro || !ciudad) {
    throw new Error('El seed no dejó catálogo. Corré el seed antes de este script.')
  }

  const slug = `suscripcion-${nombre}-${sufijo}`

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      type: 'PERSON',
      name: nombre,
      slug,
      description: 'Prueba del flujo de suscripción con Mercado Pago en la base real.',
      baseCityId: ciudad.id,
      whatsappE164: `549381${Math.floor(1000000 + Math.random() * 8999999)}`,
      whatsappVerifiedAt: new Date(),
      categories: { create: { categoryId: rubro.id, isPrimary: true } },
      images: {
        create: {
          publicId: `perfiles/${slug}/trabajo`,
          url: `https://res.cloudinary.com/demo/image/upload/perfiles/${slug}/trabajo.jpg`,
          width: 1200,
          height: 800,
          sortOrder: 0,
        },
      },
    },
    select: { id: true },
  })

  return { userId: user.id, profileId: profile.id }
}

/**
 * Carga datos fiscales válidos para el perfil.
 *
 * El tipo de persona se deduce del prefijo del documento en vez de pasarlo por
 * parámetro: con un 33 o un 34 el validador exige empresa, y si el script
 * mandara siempre `PERSONA_HUMANA` la mitad de los casos fallaría por un motivo
 * que no es el que se está probando.
 */
async function cargarDatosFiscales(profileId: string, documento = tomarCuit()): Promise<void> {
  const esEmpresa = documento.startsWith('33') || documento.startsWith('34')

  const resultado = await guardarDatosFiscales(profileId, {
    tipoPersona: esEmpresa ? 'EMPRESA' : 'PERSONA_HUMANA',
    nombreORazonSocial: 'Prueba Suscripción',
    documento,
    condicionIva: esEmpresa ? 'RESPONSABLE_INSCRIPTO' : 'RESPONSABLE_MONOTRIBUTO',
    domicilioFiscal: 'Belgrano 1234, San Miguel de Tucumán, Tucumán',
  })

  if (!resultado.ok) throw new Error(`No se pudieron cargar los datos fiscales: ${resultado.error}`)
}

/** Deja la suscripción ACTIVE como la dejaría el webhook del 2.4. */
async function activarSuscripcion(profileId: string): Promise<void> {
  const suscripcion = await obtenerSuscripcion(profileId)

  if (!suscripcion?.mpPreapprovalId) {
    throw new Error('La suscripción no tiene preapproval. El alta no llegó a completarse.')
  }

  await prisma.subscription.update({
    where: { profileId },
    data: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })
}

async function borrarPerfiles(perfiles: PerfilDePrueba[]): Promise<void> {
  if (perfiles.length === 0) return

  await prisma.user.deleteMany({ where: { id: { in: perfiles.map((p) => p.userId) } } })
}

/** Si el perfil está visible para el público, según el flag cacheado. */
async function estaPublicado(profileId: string): Promise<boolean> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { isPublished: true },
  })

  return perfil?.isPublished ?? false
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  limpiarMockMercadoPago()
  limpiarCachePlan()

  const creados: PerfilDePrueba[] = []
  const nuevo = async (nombre: string): Promise<PerfilDePrueba> => {
    const perfil = await crearProfesionalListo(nombre)
    creados.push(perfil)
    return perfil
  }

  try {
    // -----------------------------------------------------------------------
    titulo('Los requisitos de pago')

    const sinNada = await nuevo('requisitos')

    const todosFaltantes = await requisitosDePago(sinNada.profileId)

    comprobar(
      'un perfil sin datos fiscales no puede pagar',
      todosFaltantes.includes('DATOS_FISCALES_INCOMPLETOS'),
      todosFaltantes.join(', '),
    )
    comprobar('y no pide nada más', todosFaltantes.length === 1, todosFaltantes.join(', '))

    await prisma.profile.update({
      where: { id: sinNada.profileId },
      data: { whatsappVerifiedAt: null },
    })

    const sinWhatsapp = await requisitosDePago(sinNada.profileId)

    comprobar(
      'sin WhatsApp verificado aparece el motivo',
      sinWhatsapp.includes('WHATSAPP_SIN_VERIFICAR'),
      sinWhatsapp.join(', '),
    )
    comprobar(
      'y sigue pidiendo los datos fiscales',
      sinWhatsapp.includes('DATOS_FISCALES_INCOMPLETOS'),
    )

    // -----------------------------------------------------------------------
    titulo('No se abre un checkout si falta un requisito')

    const intentoSinDatos = await crearSuscripcion(sinNada.profileId, ACEPTACION)

    comprobar('el alta se rechaza', !intentoSinDatos.ok)
    comprobar(
      'con un motivo de estado, no un error técnico',
      !intentoSinDatos.ok && intentoSinDatos.code === 'ESTADO_INVALIDO',
    )
    comprobar(
      'y no quedó ningún preapproval abierto en Mercado Pago',
      (await prisma.subscription.count({ where: { profileId: sinNada.profileId } })) === 0,
    )
    comprobar('ni uno solo en el proveedor', preapprovalsVivosMock() === 0)

    // -----------------------------------------------------------------------
    titulo('El alta con todo en su lugar')

    const listo = await nuevo('alta')
    await cargarDatosFiscales(listo.profileId)

    comprobar('ya cumple los requisitos', (await requisitosDePago(listo.profileId)).length === 0)

    const montoVigenteAntes = await montoVigente()
    const alta = await crearSuscripcion(listo.profileId, ACEPTACION)

    comprobar('el alta devuelve una URL de checkout', alta.ok && alta.data.urlCheckout.includes('preapprovalId'))
    comprobar('y es de Mercado Pago', alta.ok && alta.data.urlCheckout.startsWith('https://'))

    const trasAlta = await obtenerSuscripcion(listo.profileId)

    comprobar('queda una suscripción', trasAlta !== null)
    comprobar(
      'en estado PENDING, no ACTIVE',
      trasAlta?.status === SubscriptionStatus.PENDING,
      trasAlta?.status,
    )
    comprobar('con el preapproval guardado', (trasAlta?.mpPreapprovalId ?? '').length > 0)
    comprobar(
      'el monto congelado es el del plan',
      trasAlta?.planAmount.toNumber() === (montoVigenteAntes?.toNumber() ?? -1),
      `${trasAlta?.planAmount} vs ${montoVigenteAntes}`,
    )
    comprobar('guarda la versión de los términos', (trasAlta?.termsVersion ?? '').length > 0)
    comprobar('y la fecha de aceptación', trasAlta?.termsAcceptedAt !== null)
    comprobar('pero todavía no hay período', trasAlta?.currentPeriodEnd === null)
    comprobar('ni el perfil está publicado', trasAlta !== null && (await prisma.profile.findUnique({
      where: { id: listo.profileId },
      select: { isPublished: true },
    }))?.isPublished === false)

    // -----------------------------------------------------------------------
    titulo('Sin aceptar los términos no se cobra')

    const sinAceptar = await nuevo('terminos')
    await cargarDatosFiscales(sinAceptar.profileId)

    comprobar(
      'con la casilla en false se rechaza',
      !(await crearSuscripcion(sinAceptar.profileId, { aceptaTerminos: false })).ok,
    )
    comprobar('con la casilla ausente también', !(await crearSuscripcion(sinAceptar.profileId, {})).ok)
    comprobar(
      'y sin fila en la base',
      (await prisma.subscription.count({ where: { profileId: sinAceptar.profileId } })) === 0,
    )

    // -----------------------------------------------------------------------
    titulo('Sin plan vigente no se cobra')

    const sinPlan = await nuevo('sinplan')
    await cargarDatosFiscales(sinPlan.profileId)

    await prisma.plan.updateMany({ data: { isActive: false } })
    limpiarCachePlan()

    const sinPlanResultado = await crearSuscripcion(sinPlan.profileId, ACEPTACION)

    comprobar('el alta falla sin plan', !sinPlanResultado.ok)
    comprobar(
      'y no inventa un monto de respaldo',
      !sinPlanResultado.ok && sinPlanResultado.error.includes('No hay ningún plan'),
    )

    await prisma.plan.update({ where: { id: 'plan_mensual_inicial' }, data: { isActive: true } })
    limpiarCachePlan()

    // -----------------------------------------------------------------------
    titulo('Una suscripción ACTIVE no se puede volver a cobrar')

    await activarSuscripcion(listo.profileId)

    const preapprovalActivo = (await obtenerSuscripcion(listo.profileId))?.mpPreapprovalId ?? ''
    const vivosAntes = preapprovalsVivosMock()

    const segundoIntento = await crearSuscripcion(listo.profileId, ACEPTACION)

    comprobar('el segundo alta se rechaza', !segundoIntento.ok)
    comprobar('como duplicado, no como error', !segundoIntento.ok && segundoIntento.code === 'DUPLICADO')
    comprobar(
      'sigue habiendo una sola suscripción',
      (await prisma.subscription.count({ where: { profileId: listo.profileId } })) === 1,
    )
    comprobar(
      'y no se abrió un checkout nuevo',
      preapprovalsVivosMock() === vivosAntes,
      `${vivosAntes} -> ${preapprovalsVivosMock()}`,
    )

    /**
     * La carrera que de verdad importa: cinco Requests de alta al mismo tiempo
     * sobre una suscripción ya activa.
     *
     * Si acá dos de las cinco pasaran el chequeo, el profesional tendría dos
     * cobros recurrentes abiertos y una sola fila en la base que diga cuál
     * manda. Por eso se mira el conteo de preapprovals vivos y no solo el de
     * filas.
     */
    const carreraActiva = await Promise.all(
      Array.from({ length: 5 }, () => crearSuscripcion(listo.profileId, ACEPTACION)),
    )

    comprobar(
      'cinco altas simultáneas sobre una ACTIVE: ninguna pasa',
      carreraActiva.every((r) => !r.ok),
      `${carreraActiva.filter((r) => r.ok).length} pasaron`,
    )
    comprobar(
      'y no queda ningún checkout abierto de más',
      preapprovalsVivosMock() === vivosAntes,
      `${vivosAntes} -> ${preapprovalsVivosMock()}`,
    )

    // -----------------------------------------------------------------------
    titulo('Una suscripción PENDING se reabre, no se duplica')

    const pendiente = await nuevo('pendiente')
    await cargarDatosFiscales(pendiente.profileId)

    comprobar('el primer intento abre un checkout', (await crearSuscripcion(pendiente.profileId, ACEPTACION)).ok)

    const primerPreapproval = (await obtenerSuscripcion(pendiente.profileId))?.mpPreapprovalId ?? ''

    comprobar('el segundo intento también', (await crearSuscripcion(pendiente.profileId, ACEPTACION)).ok)

    const trasReabrir = await obtenerSuscripcion(pendiente.profileId)

    comprobar(
      'sigue siendo la misma fila, no una segunda',
      (await prisma.subscription.count({ where: { profileId: pendiente.profileId } })) === 1,
    )
    comprobar('con un preapproval nuevo', trasReabrir?.mpPreapprovalId !== primerPreapproval)
    comprobar(
      'y el anterior quedó cancelado en Mercado Pago',
      estadoPreapprovalMock(primerPreapproval) === 'cancelled',
      estadoPreapprovalMock(primerPreapproval) ?? 'no existe',
    )

    // -----------------------------------------------------------------------
    titulo('Siete altas simultáneas sobre una PENDING dejan un solo cobro')

    /**
     * Siete a la vez y no dos, y el criterio NO es "una solaalta se completa".
     *
     * Sobre una PENDING, reintentar es lo correcto: las siete llamadas legítimas
     * se resuelven en serie y cada una cancela el preapproval de la anterior. Lo
     * que no se puede tolerar es que queden dos cobros recurrentes abiertos, y
     * eso es lo que se mide acá: un solo preapproval vivo.
     */
    const simultaneas = await nuevo('carrera')
    await cargarDatosFiscales(simultaneas.profileId)

    const vivosAntesCarrera = preapprovalsVivosMock()

    await Promise.all(
      Array.from({ length: 7 }, () => crearSuscripcion(simultaneas.profileId, ACEPTACION)),
    )

    const vivosDespues = preapprovalsVivosMock()

    comprobar('queda una sola fila de suscripción', (await prisma.subscription.count({ where: { profileId: simultaneas.profileId } })) === 1)
    comprobar(
      'y un solo cobro recurrente abierto',
      vivosDespues === vivosAntesCarrera + 1,
      `${vivosAntesCarrera} -> ${vivosDespues}`,
    )

    const ganador = (await obtenerSuscripcion(simultaneas.profileId))?.mpPreapprovalId ?? ''

    comprobar('ese cobro es el que quedó en la base', estadoPreapprovalMock(ganador) !== 'cancelled')

    // -----------------------------------------------------------------------
    titulo('El precio congelado sobrevive a un reintento')

    await prisma.subscription.update({
      where: { profileId: pendiente.profileId },
      data: { priceFrozen: true, planAmount: new Prisma.Decimal(8000) },
    })

    await prisma.plan.update({
      where: { id: 'plan_mensual_inicial' },
      data: { amount: new Prisma.Decimal(20000) },
    })
    limpiarCachePlan()

    comprobar('el reintento se completa', (await crearSuscripcion(pendiente.profileId, ACEPTACION)).ok)
    comprobar(
      'un congelado conserva su monto y no toma el del plan',
      (await obtenerSuscripcion(pendiente.profileId))?.planAmount.toNumber() === 8000,
      String((await obtenerSuscripcion(pendiente.profileId))?.planAmount),
    )

    const sinCongelar = await nuevo('nuevo-precio')
    await cargarDatosFiscales(sinCongelar.profileId)

    await crearSuscripcion(sinCongelar.profileId, ACEPTACION)

    comprobar(
      'uno sin congelamiento paga el precio vigente',
      (await obtenerSuscripcion(sinCongelar.profileId))?.planAmount.toNumber() === 20000,
      String((await obtenerSuscripcion(sinCongelar.profileId))?.planAmount),
    )

    await prisma.plan.update({
      where: { id: 'plan_mensual_inicial' },
      data: { amount: new Prisma.Decimal(10000) },
    })
    limpiarCachePlan()

    // -----------------------------------------------------------------------
    titulo('Cancelar la renovación')

    /**
     * Se publica con el sincronizador y no escribiendo el flag a mano.
     *
     * `isPublished` es la caché de `evaluarPublicacion` (D4) y este script no
     * puede escribirla. Si la escribiera, la comprobación de abajo probaría que
     * `cancelarRenovacion` no toca el flag, que es distinto de lo que importa:
     * que cancelar no despublica a un perfil que era publicable.
     */
    await sincronizarPublicacion(listo.profileId)

    const publicadoAntes = await estaPublicado(listo.profileId)

    comprobar('con la suscripción activa el perfil queda publicado', publicadoAntes)

    const baja = await cancelarRenovacion(listo.profileId)

    comprobar('la baja se acepta', baja.ok)
    comprobar(
      'el preapproval queda cancelado en Mercado Pago',
      estadoPreapprovalMock(preapprovalActivo) === 'cancelled',
      estadoPreapprovalMock(preapprovalActivo) ?? 'no existe',
    )

    const trasBaja = await obtenerSuscripcion(listo.profileId)

    comprobar('queda marcada la cancelación al fin del período', trasBaja?.cancelAtPeriodEnd === true)
    comprobar('con la fecha en que se pidió', trasBaja?.cancelledAt !== null)
    comprobar(
      'pero el estado sigue siendo ACTIVE',
      trasBaja?.status === SubscriptionStatus.ACTIVE,
      trasBaja?.status,
    )
    comprobar(
      'y el perfil sigue publicado hasta que termine el período pagado',
      await estaPublicado(listo.profileId),
    )

    // -----------------------------------------------------------------------
    titulo('La baja es idempotente y no toca a otros perfiles')

    comprobar('cancelar dos veces no es un error', (await cancelarRenovacion(listo.profileId)).ok)

    const sinSuscripcion = await nuevo('sin-suscripcion')

    comprobar(
      'sin suscripción no hay nada que cancelar',
      !(await cancelarRenovacion(sinSuscripcion.profileId)).ok,
    )

    const pendienteBaja = await nuevo('baja-invalida')
    await cargarDatosFiscales(pendienteBaja.profileId)
    await crearSuscripcion(pendienteBaja.profileId, ACEPTACION)

    comprobar(
      'una PENDING no se puede dar de baja todavía',
      !(await cancelarRenovacion(pendienteBaja.profileId)).ok,
    )

    const trasIntentoFallido = await obtenerSuscripcion(pendienteBaja.profileId)

    comprobar('su suscripción quedó como estaba', trasIntentoFallido?.cancelAtPeriodEnd === false)
    comprobar(
      'y su preapproval sigue vivo',
      estadoPreapprovalMock(trasIntentoFallido?.mpPreapprovalId ?? '') !== 'cancelled',
    )

    // -----------------------------------------------------------------------
    titulo('Los datos fiscales')

    const datosIncompletos = await guardarDatosFiscales(sinSuscripcion.profileId, {
      tipoPersona: 'PERSONA_HUMANA',
      nombreORazonSocial: 'X',
      documento: '123',
      condicionIva: 'RESPONSABLE_MONOTRIBUTO',
      domicilioFiscal: 'corto',
    })

    comprobar('unos datos incompletos se rechazan', !datosIncompletos.ok)
    comprobar(
      'con el motivo de validación',
      !datosIncompletos.ok && datosIncompletos.code === 'VALIDACION',
    )
    comprobar(
      'y no se guardó nada a medias',
      (await prisma.fiscalData.count({ where: { profileId: sinSuscripcion.profileId } })) === 0,
    )

    await cargarDatosFiscales(sinSuscripcion.profileId)

    comprobar(
      'el mismo documento en dos perfiles se rechaza',
      !(await guardarDatosFiscales(pendienteBaja.profileId, {
        tipoPersona: 'PERSONA_HUMANA',
        nombreORazonSocial: 'Otro profesional',
        documento: CUITS[0],
        condicionIva: 'RESPONSABLE_MONOTRIBUTO',
        domicilioFiscal: 'Belgrano 1234, Salta, Salta',
      })).ok,
    )

    comprobar(
      'una empresa con CUIT de persona se rechaza',
      !(await guardarDatosFiscales(sinSuscripcion.profileId, {
        tipoPersona: 'EMPRESA',
        nombreORazonSocial: 'Empresa S.R.L.',
        documento: CUITS[0],
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        domicilioFiscal: 'Belgrano 1234, Salta, Salta',
      })).ok,
    )

    // -----------------------------------------------------------------------
    console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`)

    if (fallos > 0) {
      console.log(`${fallos} FALLAS`)
      process.exitCode = 1
    }
  } finally {
    limpiarMockMercadoPago()

    try {
      await borrarPerfiles(creados)
    } catch (error: unknown) {
      console.warn(
        '\nAviso: no se pudieron borrar los perfiles de prueba.',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('\nError en la verificación de suscripción:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })