import { Prisma, type Profile } from '@prisma/client'

import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { normalizarWhatsapp } from '@/lib/phone'
import { estaBloqueado } from '@/services/bloqueo'
import { registrarRiesgo } from '@/services/riesgo'
import { sincronizarPublicacion } from '@/services/publicacion'
import { LIMITES_PERFIL, perfilSchema, type PerfilInput } from '@/schemas/perfil'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Guardado del perfil del profesional.
 *
 * Todas las reglas que dependen de la base se revalidan **dentro de la
 * transacción y con la fila bloqueada**. Es lo que separa un límite de una
 * sugerencia: sin `FOR UPDATE`, dos guardados simultáneos pueden pasar los dos
 * del límite de 2 rubros y dejar 3.
 */

/** Datos que se leen del perfil para armar el formulario. */
export async function obtenerPerfilParaEditar(userId: string): Promise<EditarPerfil | null> {
  const perfil = await prisma.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      type: true,
      name: true,
      description: true,
      companyName: true,
      tradeName: true,
      cuit: true,
      teamSize: true,
      yearFounded: true,
      website: true,
      licenseNumber: true,
      baseCityId: true,
      baseCity: { select: { province: true } },
      coversWholeProvince: true,
      coversOtherProvinces: true,
      categories: { select: { categoryId: true, isPrimary: true } },
      subcategories: { select: { subcategoryId: true } },
      coverage: { select: { cityId: true } },
    },
  })

  if (!perfil) return null

  const principal = perfil.categories.find((c) => c.isPrimary)?.categoryId
  const secundario = perfil.categories.find((c) => !c.isPrimary)?.categoryId

  return {
    id: perfil.id,
    type: perfil.type,
    name: perfil.name,
    description: perfil.description ?? '',
    company: {
      companyName: perfil.companyName ?? '',
      tradeName: perfil.tradeName ?? '',
      cuit: perfil.cuit ?? '',
      teamSize: perfil.teamSize,
      yearFounded: perfil.yearFounded,
      website: perfil.website ?? '',
    },
    province: perfil.baseCity?.province ?? null,
    baseCityId: perfil.baseCityId,
    coversWholeProvince: perfil.coversWholeProvince,
    otherProvinces: [...perfil.coversOtherProvinces],
    cityIds: perfil.coverage.map((c) => c.cityId),
    primaryCategoryId: principal ?? '',
    secondaryCategoryId: secundario ?? '',
    subcategoryIds: perfil.subcategories.map((s) => s.subcategoryId),
    licenseNumber: perfil.licenseNumber ?? '',
  }
}

export type EditarPerfil = {
  id: string
  type: 'PERSON' | 'COMPANY'
  name: string
  description: string
  company: {
    companyName: string
    tradeName: string
    cuit: string
    teamSize: string | null
    yearFounded: number | null
    website: string
  }
  province: string | null
  baseCityId: string | null
  coversWholeProvince: boolean
  otherProvinces: string[]
  cityIds: string[]
  primaryCategoryId: string
  secondaryCategoryId: string
  subcategoryIds: string[]
  licenseNumber: string
}

/**
 * Guarda el perfil.
 *
 * Orden dentro de la transacción, y no por casualidad:
 *
 * 1. Se bloquea la fila del perfil.
 * 2. Se revalidan los límites y las relaciones. Acá es donde se decide.
 * 3. Se escribe.
 *
 * Si se validara antes de abrir la transacción, el bloqueo no serviría de nada:
 * entre la validación y la escritura entra otra petición.
 *
 * @param ip del cliente, solo para la señal de riesgo. Va hasheada.
 */
export async function guardarPerfil(
  profileId: string,
  entrada: PerfilInput,
  ip?: string,
): Promise<Resultado<null>> {
  const parseado = perfilSchema.safeParse(entrada)

  if (!parseado.success) {
    const primero = parseado.error.issues[0]
    return err(primero?.message ?? 'Revisá los datos del formulario.', ERROR_CODES.VALIDACION)
  }

  const datos = parseado.data

  try {
    await prisma.$transaction(
      async (tx) => {
        /**
         * Bloqueo de la fila del perfil.
         *
         * `$queryRaw` y no `update` a pelo: `update` tomaría el bloqueo pero
         * escribiendo, y acá lo que se quiere es tomar el bloqueo **antes** de
         * contar. Es la diferencia entre "no hay dos guardados que vean el
         * mismo estado" y "no hay dos escrituras simultáneas".
         *
         * Sin este SELECT FOR UPDATE, dos peticiones que agregan un rubro
         * distinto al mismo perfil pueden leer 1 rubro cada una, pasar el
         * límite de 2 y dejar 3.
         */
        await tx.$queryRaw`
          SELECT id FROM "Profile" WHERE id = ${profileId} FOR UPDATE
        `

        const validacion = await validarRelaciones(tx, profileId, datos)

        if (!validacion.ok) {
          throw new ErrorValidacionPerfil(validacion.error)
        }

        await escribirPerfil(tx, profileId, datos)
      },
      // La validación hace varias consultas. Con el límite por defecto de
      // Postgres, una transacción corta como esta ya abre su propio snapshot,
      // y con el bloqueo FOR UPDATE las filas que importan no cambian.
      { timeout: 15000, maxWait: 5000 },
    )
  } catch (error: unknown) {
    if (error instanceof ErrorValidacionPerfil) {
      return err(error.message, ERROR_CODES.VALIDACION)
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err(
        'Ese CUIT ya está en otro perfil. Cada empresa puede tener un solo perfil.',
        ERROR_CODES.DUPLICADO,
      )
    }

    logger.error('perfil: error al guardar', { profileId, error })
    return err('No pudimos guardar tu perfil. Probá de nuevo.', ERROR_CODES.DESCONOCIDO)
  }

  /**
   * El tipo o el rubro pueden haber cambiado, y eso cambia si el perfil se
   * puede publicar: la matrícula pasa a ser obligatoria, o deja de serlo.
   */
  await sincronizarPublicacion(profileId)

  await registrarRiesgoDelCambio(profileId, datos, ip)

  return ok(null)
}

/**
 * Error de validación de negocio dentro de la transacción.
 *
 * Existe como tipo propio porque no se puede lanzar el `err` del proyecto: eso
 * es un objeto de resultado, no una excepción, y dentro de una transacción hay
 * que provocar el rollback con una excepción de verdad.
 */
class ErrorValidacionPerfil extends Error {}

/**
 * Revalida lo que Zod no puede: que los IDs existan, que pertenezcan al perfil
 * y que los límites se cumplan contra el estado real de la base.
 */
async function validarRelaciones(
  tx: Prisma.TransactionClient,
  profileId: string,
  datos: ReturnType<typeof perfilSchema.parse>,
): Promise<Resultado<null>> {
  // --- Ciudad base y su provincia ---
  const ciudad = await tx.city.findUnique({
    where: { id: datos.ubicacion.baseCityId },
    select: { id: true, province: true, isActive: true },
  })

  if (!ciudad || !ciudad.isActive) {
    return err('Elegí una ciudad válida.', ERROR_CODES.VALIDACION)
  }

  // La provincia del formulario tiene que coincidir con la de la ciudad.
  // Sin este chequeo, un perfil puede declararse en Tucumán con la ciudad de
  // Salta y aparecer en las dos búsquedas.
  if (ciudad.province !== datos.ubicacion.province) {
    return err(
      'La ciudad no pertenece a la provincia que elegiste.',
      ERROR_CODES.VALIDACION,
    )
  }

  // --- Cobertura ---
  const ciudadesUnicas = [...new Set(datos.ubicacion.cityIds)]

  if (ciudadesUnicas.length > LIMITES_PERFIL.ciudades) {
    return err(`Elegí hasta ${LIMITES_PERFIL.ciudades} ciudades.`, ERROR_CODES.LIMITE_ALCANZADO)
  }

  if (ciudadesUnicas.length > 0) {
    const existentes = await tx.city.count({
      where: { id: { in: ciudadesUnicas }, isActive: true },
    })

    if (existentes !== ciudadesUnicas.length) {
      return err('Alguna de las ciudades de cobertura no existe.', ERROR_CODES.VALIDACION)
    }
  }

  // --- Rubros ---
  const rubros = [datos.catalogo.primaryCategoryId, datos.catalogo.secondaryCategoryId].filter(
    (valor): valor is string => Boolean(valor),
  )

  const rubrosUnicos = [...new Set(rubros)]

  if (rubrosUnicos.length !== rubros.length) {
    return err(
      'El rubro secundario tiene que ser distinto del principal.',
      ERROR_CODES.VALIDACION,
    )
  }

  if (rubrosUnicos.length > LIMITES_PERFIL.rubros) {
    return err(`Elegí hasta ${LIMITES_PERFIL.rubros} rubros.`, ERROR_CODES.LIMITE_ALCANZADO)
  }

  const rubrosValidos = await tx.category.findMany({
    where: { id: { in: rubrosUnicos }, isActive: true },
    select: { id: true, requiresLicense: true, licenseLabel: true },
  })

  if (rubrosValidos.length !== rubrosUnicos.length) {
    return err('Alguno de los rubros no existe o está desactivado.', ERROR_CODES.VALIDACION)
  }

  // --- Subcategorías ---
  const subcategorias = [...new Set(datos.catalogo.subcategoryIds)]

  if (subcategorias.length > LIMITES_PERFIL.subcategorias) {
    return err(
      `Elegí hasta ${LIMITES_PERFIL.subcategorias} subcategorías.`,
      ERROR_CODES.LIMITE_ALCANZADO,
    )
  }

  if (subcategorias.length > 0) {
    // La subcategoría tiene que ser de uno de los rubros elegidos. Sin esto se
    // puede colgar "instalaciones eléctricas" de un perfil de plomería, que
    // después aparece en la búsqueda equivocada.
    const validas = await tx.subcategory.count({
      where: { id: { in: subcategorias }, isActive: true, categoryId: { in: rubrosUnicos } },
    })

    if (validas !== subcategorias.length) {
      return err(
        'Alguna subcategoría no pertenece a los rubros que elegiste.',
        ERROR_CODES.VALIDACION,
      )
    }
  }

  // --- Matrícula ---
  const exigeMatricula = rubrosValidos.some((rubro) => rubro.requiresLicense)
  const matricula = datos.catalogo.licenseNumber?.trim()

  if (exigeMatricula && !matricula) {
    const etiqueta = rubrosValidos.find((rubro) => rubro.requiresLicense)?.licenseLabel

    return err(
      etiqueta
        ? `Para el rubro que elegiste necesitás el dato de: ${etiqueta}.`
        : 'Este rubro necesita una matrícula. Escribí el número.',
      ERROR_CODES.VALIDACION,
    )
  }

  // --- CUIT ---
  if (datos.type === 'COMPANY' && datos.company.cuit) {
    const cuit = datos.company.cuit

    const yaUsado = await tx.profile.findFirst({
      where: { cuitHash: hashValor(cuit), NOT: { id: profileId } },
      select: { id: true },
    })

    if (yaUsado) {
      return err(
        'Ese CUIT ya está en otro perfil. Cada empresa puede tener un solo perfil.',
        ERROR_CODES.DUPLICADO,
      )
    }

    const bloqueado = await estaBloqueado('CUIT_HASH', cuit)

    if (bloqueado) {
      return err('Ese CUIT no se puede usar.', ERROR_CODES.SIN_PERMISOS)
    }
  }

  // --- Número de WhatsApp ---
  const perfil = await tx.profile.findUnique({
    where: { id: profileId },
    select: { whatsappE164: true },
  })

  if (perfil && perfil.whatsappE164 && normalizarWhatsapp(perfil.whatsappE164) !== perfil.whatsappE164) {
    // Ya está normalizado por el registro; si algún camino lo dejó sin
    // normalizar, se corrige acá en vez de confiar.
    await tx.profile.update({
      where: { id: profileId },
      data: { whatsappE164: perfil.whatsappE164 },
    })
  }

  return ok(null)
}

/** Escribe el perfil, ya validado. */
async function escribirPerfil(
  tx: Prisma.TransactionClient,
  profileId: string,
  datos: ReturnType<typeof perfilSchema.parse>,
): Promise<void> {
  const esEmpresa = datos.type === 'COMPANY'

  await tx.profile.update({
    where: { id: profileId },
    data: {
      type: datos.type,
      name: datos.name,
      description: datos.description,
      baseCityId: datos.ubicacion.baseCityId,
      coversWholeProvince: datos.ubicacion.coversWholeProvince,
      coversOtherProvinces: datos.ubicacion.otherProvinces as Profile['coversOtherProvinces'],
      // Los datos de empresa se borran al pasar a persona. Dejarlos cargados
      // significaría que un perfil que dice "persona" tiene un CUIT guardado que
      // nadie ve y que se usa para el índice único.
      companyName: esEmpresa ? datos.company.companyName || null : null,
      tradeName: esEmpresa ? datos.company.tradeName || null : null,
      cuit: esEmpresa ? datos.company.cuit || null : null,
      cuitHash: esEmpresa && datos.company.cuit ? hashValor(datos.company.cuit) : null,
      teamSize: esEmpresa ? datos.company.teamSize ?? null : null,
      yearFounded: esEmpresa ? datos.company.yearFounded ?? null : null,
      website: esEmpresa ? datos.company.website || null : null,
      licenseNumber: datos.catalogo.licenseNumber?.trim() || null,
    },
  })

  // Rubros. Se borra todo y se vuelve a escribir: son 2 filas como máximo y
  // hacerlo de otro modo obliga a calcular el diff sin ganar nada.
  await tx.profileCategory.deleteMany({ where: { profileId } })

  await tx.profileCategory.createMany({
    data: [
      { profileId, categoryId: datos.catalogo.primaryCategoryId, isPrimary: true },
      ...(datos.catalogo.secondaryCategoryId
        ? [
            {
              profileId,
              categoryId: datos.catalogo.secondaryCategoryId,
              isPrimary: false,
            },
          ]
        : []),
    ],
  })

  await tx.profileSubcategory.deleteMany({ where: { profileId } })

  if (datos.catalogo.subcategoryIds.length > 0) {
    await tx.profileSubcategory.createMany({
      data: datos.catalogo.subcategoryIds.map((subcategoryId) => ({ profileId, subcategoryId })),
    })
  }

  await tx.profileCoverage.deleteMany({ where: { profileId } })

  if (datos.ubicacion.cityIds.length > 0) {
    await tx.profileCoverage.createMany({
      data: [...new Set(datos.ubicacion.cityIds)].map((cityId) => ({ profileId, cityId })),
    })
  }
}

/**
 * Señales de riesgo del cambio del perfil.
 *
 * Cambiar el CUIT o la conexión de origen en un perfil ya publicado son los dos
 * patrones que aparecen cuando alguien quiere pasar una revisión sin ser quien
 * dice ser. Se dejan registrados para que alguien lo mire; no bloquean, porque
 * un bloqueo automático en este punto saca del portal a más gente legítima de
 * la que frena.
 */
async function registrarRiesgoDelCambio(
  profileId: string,
  datos: ReturnType<typeof perfilSchema.parse>,
  ip?: string,
): Promise<void> {
  const anterior = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { cuit: true, createdAt: true, user: { select: { signupIpHash: true } } },
  })

  if (!anterior) return

  const cuitNuevo = datos.type === 'COMPANY' ? datos.company.cuit || null : null

  // Solo tiene sentido si el perfil es viejo. Un alta que se completa en la
  // primera hora cambia el CUIT una vez y no es sospechoso.
  const esNuevo = Date.now() - anterior.createdAt.getTime() < 24 * 60 * 60 * 1000

  if (!esNuevo && cuitNuevo && cuitNuevo !== anterior.cuit) {
    await registrarRiesgo(profileId, 'CAMBIO_DE_CUIT_TARDIO', {
      cuitAnterior: anterior.cuit ? 'presente' : 'ausente',
      cuitNuevo: 'presente',
    })
  }

  if (ip && anterior.user.signupIpHash && anterior.user.signupIpHash !== hashValor(ip)) {
    await registrarRiesgo(profileId, 'CAMBIO_DE_IP_POSTERIOR_AL_ALTA', {
      desdeElAlta: 'conexion-distinta',
    })
  }
}