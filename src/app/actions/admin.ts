'use server'

import type { InvoiceStatus, Province } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { exigirAdmin, exigirSuperAdmin } from '@/lib/admin-auth'
import { validarTokenCsrf } from '@/lib/csrf'
import { logger } from '@/lib/logger'
import { ipHasheada } from '@/lib/peticion'
import { prisma } from '@/lib/prisma'
import {
  marcarMatriculaRevisada,
  rechazarDesdePanel,
  reactivarPerfil,
  resolverEmpresa,
  suspenderDesdePanel,
  verificarWhatsappManual,
} from '@/services/admin'
import {
  actualizarCiudad,
  actualizarRubro,
  crearCiudad,
  crearRubro,
  reasignarLocalidad,
} from '@/services/admin-catalogo'
import { guardarConfiguracion } from '@/services/admin-config'
import { resolverQueja, resolverReporte } from '@/services/admin-moderacion'
import { registrarAuditoria } from '@/services/auditoria'
import {
  bloquearIdentificador,
  desbloquearIdentificador,
  type TipoBloqueo,
} from '@/services/bloqueo'
import { reintentarFactura } from '@/services/facturacion'
import { ocultarImagen } from '@/services/galeria'
import { aprobarPerfil, rechazarPerfil, setExigeAprobacionManual, suspenderPerfil } from '@/services/moderacion'
import { resolverRiesgo } from '@/services/riesgo'
import { anularVoto } from '@/services/votos'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Acciones del panel de administración.
 *
 * Todas revalidan el rol **contra la base** en cada llamada (`exigirAdmin` o
 * `exigirSuperAdmin`). El middleware es solo la barrera de entrada: el token
 * de sesión dura 30 días y no sirve para autorizar una escritura.
 *
 * Hay dos familias de acciones:
 * - Las que devuelven `Resultado`, para componentes cliente que muestran el
 *   error al lado del botón (el reintento de factura).
 * - Las que reciben `FormData` y redirigen con `?ok=`/`?error=`, para que los
 *   formularios del panel funcionen sin JavaScript.
 */

function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave)

  return typeof valor === 'string' ? valor.trim() : ''
}

function numero(datos: FormData, clave: string): number {
  const valor = Number(texto(datos, clave))

  return Number.isFinite(valor) ? valor : 0
}

function marcado(datos: FormData, clave: string): boolean {
  const valor = datos.get(clave)

  return valor === 'on' || valor === 'true' || valor === '1'
}

/** Vuelve a la pantalla de origen con un mensaje legible. */
function volver(datos: FormData, correcto: boolean, mensaje: string): never {
  const ruta = texto(datos, 'ruta')
  const destino = ruta.startsWith('/admin') ? ruta : '/admin'
  const separador = destino.includes('?') ? '&' : '?'

  redirect(`${destino}${separador}${correcto ? 'ok' : 'error'}=${encodeURIComponent(mensaje)}`)
}

/** Revalida las rutas que muestran el estado que acaba de cambiar. */
function refrescarPanel(): void {
  revalidatePath('/admin')
  revalidatePath('/admin/perfiles')
  revalidatePath('/admin/aprobaciones')
  revalidatePath('/admin/empresas')
  revalidatePath('/admin/matriculas')
  revalidatePath('/admin/riesgos')
  revalidatePath('/admin/moderacion')
}

// ---------------------------------------------------------------------------
// Perfiles y moderación
// ---------------------------------------------------------------------------

/** Aprueba un perfil y lo publica. */
export async function adminAprobarPerfil(
  profileId: string,
  nota?: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  return aprobarPerfil(profileId, admin.data.email, nota)
}

/** Rechaza un perfil. El motivo es obligatorio: se lo muestra al profesional. */
export async function adminRechazarPerfil(
  profileId: string,
  motivo: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  return rechazarPerfil(profileId, admin.data.email, motivo)
}

/** Suspende un perfil ya publicado. */
export async function adminSuspenderPerfil(
  profileId: string,
  motivo: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  return suspenderPerfil(profileId, admin.data.email, motivo)
}

/** Acción única de los formularios de perfil. */
export async function adminAccionPerfil(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const profileId = texto(datos, 'profileId')
  const accion = texto(datos, 'accion')
  const motivo = texto(datos, 'motivo')

  if (!profileId) return volver(datos, false, 'Falta el perfil.')

  let resultado: Resultado<null>

  switch (accion) {
    case 'aprobar':
      resultado = await aprobarPerfil(profileId, admin.data.email, motivo || undefined)
      break
    case 'rechazar':
      resultado = await rechazarDesdePanel(profileId, admin.data, motivo)
      break
    case 'suspender':
      resultado = await suspenderDesdePanel(profileId, admin.data, motivo)
      break
    case 'reactivar':
      resultado = await reactivarPerfil(profileId, admin.data, motivo || undefined)
      break
    default:
      return volver(datos, false, 'Acción desconocida.')
  }

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Listo.' : resultado.error)
}

/** Marca el número como verificado a mano. */
export async function adminVerificarWhatsapp(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await verificarWhatsappManual({
    profileId: texto(datos, 'profileId'),
    motivo: texto(datos, 'motivo'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Número verificado a mano.' : resultado.error)
}

/** Aprueba o rechaza una constancia de inscripción. */
export async function adminResolverEmpresa(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await resolverEmpresa({
    profileId: texto(datos, 'profileId'),
    aprobar: texto(datos, 'decision') === 'aprobar',
    motivo: texto(datos, 'motivo'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Constancia resuelta.' : resultado.error)
}

/** Deja constancia de la revisión manual de una matrícula. */
export async function adminRevisarMatricula(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await marcarMatriculaRevisada({
    profileId: texto(datos, 'profileId'),
    nota: texto(datos, 'nota'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Matrícula revisada.' : resultado.error)
}

// ---------------------------------------------------------------------------
// Reportes, quejas, fotos y votos
// ---------------------------------------------------------------------------

export async function adminResolverReporte(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const estado = texto(datos, 'estado')

  if (estado !== 'EN_REVISION' && estado !== 'RESUELTO' && estado !== 'DESCARTADO') {
    return volver(datos, false, 'Estado inválido.')
  }

  const resultado = await resolverReporte({
    reportId: texto(datos, 'reportId'),
    estado,
    resolucion: texto(datos, 'resolucion'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Reporte actualizado.' : resultado.error)
}

export async function adminResolverQueja(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const estado = texto(datos, 'estado')

  if (estado !== 'EN_REVISION' && estado !== 'RESUELTO') {
    return volver(datos, false, 'Estado inválido.')
  }

  const resultado = await resolverQueja({
    complaintId: texto(datos, 'complaintId'),
    estado,
    resolucion: texto(datos, 'resolucion'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Queja actualizada.' : resultado.error)
}

export async function adminOcultarImagen(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const profileId = texto(datos, 'profileId')
  const imageId = texto(datos, 'imageId')
  const ocultar = texto(datos, 'ocultar') !== 'false'
  const motivo = texto(datos, 'motivo')

  if (ocultar && motivo.length < 5) {
    return volver(datos, false, 'Escribí por qué ocultás la foto.')
  }

  const resultado = await ocultarImagen(profileId, imageId, ocultar, motivo, admin.data.id)

  if (resultado.ok) {
    await registrarAuditoria({
      actor: admin.data,
      accion: ocultar ? 'imagen.ocultar' : 'imagen.mostrar',
      entidad: 'Image',
      entidadId: imageId,
      antes: { oculta: !ocultar },
      despues: { oculta: ocultar, motivo: motivo || null },
      ipHash: await ipHasheada(),
    })
  }

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Foto actualizada.' : resultado.error)
}

export async function adminAnularVoto(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await anularVoto({
    voteId: texto(datos, 'voteId'),
    motivo: texto(datos, 'motivo'),
    actor: admin.data,
  })

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Voto anulado.' : resultado.error)
}

/** Marca una señal de riesgo como vista, con su resolución. */
export async function adminResolverRiesgo(
  signalId: string,
  resolucion: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  const limpia = resolucion.trim()

  if (limpia.length < 5) {
    return err('Escribí cómo se resolvió la señal.', ERROR_CODES.VALIDACION)
  }

  await resolverRiesgo(signalId, limpia)

  await registrarAuditoria({
    actor: admin.data,
    accion: 'riesgo.resolver',
    entidad: 'RiskSignal',
    entidadId: signalId,
    despues: { resolucion: limpia },
    ipHash: await ipHasheada(),
  })

  return ok(null)
}

/** Versión de formulario de la resolución de una señal. */
export async function adminResolverRiesgoForm(datos: FormData): Promise<void> {
  const resultado = await adminResolverRiesgo(
    texto(datos, 'signalId'),
    texto(datos, 'resolucion'),
  )

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Señal resuelta.' : resultado.error)
}

// ---------------------------------------------------------------------------
// Bloqueos
// ---------------------------------------------------------------------------

export async function adminBloquear(
  tipo: TipoBloqueo,
  valor: string,
  motivo: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  return bloquearIdentificador(tipo, valor, motivo, admin.data.email)
}

export async function adminDesbloquear(
  tipo: TipoBloqueo,
  valor: string,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  return desbloquearIdentificador(tipo, valor, admin.data.email)
}

export async function adminBloquearForm(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const tipo = texto(datos, 'tipo') as TipoBloqueo
  const resultado = await bloquearIdentificador(
    tipo,
    texto(datos, 'valor'),
    texto(datos, 'motivo'),
    admin.data.email,
  )

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Identificador bloqueado.' : resultado.error)
}

export async function adminDesbloquearForm(datos: FormData): Promise<void> {
  const admin = await exigirAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await desbloquearIdentificador(
    texto(datos, 'tipo') as TipoBloqueo,
    texto(datos, 'valor'),
    admin.data.email,
  )

  refrescarPanel()
  volver(datos, resultado.ok, resultado.ok ? 'Bloqueo levantado.' : resultado.error)
}

/**
 * Suspende y bloquea en una sola operación.
 *
 * Es el flujo real de un fraude: el perfil sale de línea y sus identificadores
 * quedan en la lista. Separarlo en dos llamadas deja la ventana en la que el
 * perfil ya está suspendido pero el número todavía sirve para otra cuenta.
 */
export async function adminSuspenderYBloquear(
  profileId: string,
  motivo: string,
  incluirEmail = true,
  incluirWhatsapp = true,
): Promise<Resultado<null>> {
  const admin = await exigirAdmin()
  if (!admin.ok) return admin

  const suspension = await suspenderPerfil(profileId, admin.data.email, motivo)

  if (!suspension.ok) return suspension

  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { whatsappE164: true, user: { select: { email: true } } },
  })

  if (!perfil) return ok(null)

  if (incluirWhatsapp && perfil.whatsappE164) {
    await bloquearIdentificador('WHATSAPP_HASH', perfil.whatsappE164, motivo, admin.data.email)
  }

  if (incluirEmail) {
    await bloquearIdentificador('EMAIL', perfil.user.email, motivo, admin.data.email)
  }

  return ok(null)
}

// ---------------------------------------------------------------------------
// Aprobación manual del sitio
// ---------------------------------------------------------------------------

/**
 * Prende o apaga la revisión manual de todos los perfiles.
 *
 * Resincroniza el sitio entero, así que puede tardar: con 500 perfiles son 500
 * escrituras. Por eso no se llama desde un toggle rápido de la interfaz.
 */
export async function adminSetExigeAprobacion(activo: boolean): Promise<Resultado<null>> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return admin

  return setExigeAprobacionManual(activo, admin.data.email)
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export async function adminGuardarConfiguracion(datos: FormData): Promise<void> {
  const csrfToken = datos.get('csrfToken')
  if (!await validarTokenCsrf(csrfToken as string | null)) {
    return volver(datos, false, 'Token CSRF inválido')
  }
  
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await guardarConfiguracion(
    {
      aprobacionManual: marcado(datos, 'aprobacionManual'),
      minPerfiles: numero(datos, 'minPerfiles'),
      diasGracia: numero(datos, 'diasGracia'),
      dominios: texto(datos, 'dominios')
        .split(/[\s,;]+/)
        .filter(Boolean),
    },
    admin.data,
  )

  revalidatePath('/admin/configuracion')
  revalidatePath('/')
  volver(datos, resultado.ok, resultado.ok ? 'Configuración guardada.' : resultado.error)
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export async function adminCrearRubro(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await crearRubro(
    {
      groupId: texto(datos, 'groupId'),
      name: texto(datos, 'name'),
      icon: texto(datos, 'icon'),
      requiresLicense: marcado(datos, 'requiresLicense'),
      licenseLabel: texto(datos, 'licenseLabel') || null,
    },
    admin.data,
  )

  revalidatePath('/admin/catalogo')
  volver(datos, resultado.ok, resultado.ok ? 'Rubro creado.' : resultado.error)
}

export async function adminEditarRubro(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await actualizarRubro({
    id: texto(datos, 'id'),
    name: texto(datos, 'name') || undefined,
    isActive: marcado(datos, 'isActive'),
    sortOrder: numero(datos, 'sortOrder'),
    requiresLicense: marcado(datos, 'requiresLicense'),
    licenseLabel: texto(datos, 'licenseLabel') || null,
    actor: admin.data,
  })

  revalidatePath('/admin/catalogo')
  revalidatePath('/')
  volver(datos, resultado.ok, resultado.ok ? 'Rubro actualizado.' : resultado.error)
}

export async function adminCrearCiudad(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await crearCiudad({
    province: texto(datos, 'province') as Province,
    name: texto(datos, 'name'),
    actor: admin.data,
  })

  revalidatePath('/admin/catalogo')
  volver(datos, resultado.ok, resultado.ok ? 'Ciudad creada.' : resultado.error)
}

export async function adminEditarCiudad(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await actualizarCiudad({
    id: texto(datos, 'id'),
    name: texto(datos, 'name') || undefined,
    isActive: marcado(datos, 'isActive'),
    sortOrder: numero(datos, 'sortOrder'),
    actor: admin.data,
  })

  revalidatePath('/admin/catalogo')
  revalidatePath('/')
  volver(datos, resultado.ok, resultado.ok ? 'Ciudad actualizada.' : resultado.error)
}

export async function adminReasignarLocalidad(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const resultado = await reasignarLocalidad({
    origenId: texto(datos, 'origenId'),
    destinoId: texto(datos, 'destinoId'),
    actor: admin.data,
  })

  revalidatePath('/admin/catalogo')
  revalidatePath('/')
  volver(
    datos,
    resultado.ok,
    resultado.ok ? `Movimos ${resultado.data.movidos} perfiles.` : resultado.error,
  )
}

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------

/**
 * Reintenta la emisión de una factura que quedó en FAILED.
 *
 * Es la salida manual cuando ARCA estuvo caído más tiempo que el backoff o
 * cuando el problema era una credencial que ya se corrigió. Reinicia el
 * contador de intentos: el admin ya miró el error, merece un ciclo completo.
 */
export async function adminReintentarFactura(
  invoiceId: string,
): Promise<Resultado<InvoiceStatus>> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return admin

  if (!invoiceId) {
    return err('Falta la factura a reintentar.', ERROR_CODES.VALIDACION)
  }

  logger.info('admin: reintento manual de factura', {
    invoiceId,
    actor: admin.data.email,
  })

  return reintentarFactura(invoiceId)
}


