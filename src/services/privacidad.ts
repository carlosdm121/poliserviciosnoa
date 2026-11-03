import { createHmac, timingSafeEqual } from 'node:crypto'

import { SubscriptionStatus } from '@prisma/client'

import { borrarRecurso } from '@/lib/cloudinary'
import { hashValor } from '@/lib/hash'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { getProveedor } from '@/lib/mp'
import { prisma } from '@/lib/prisma'
import {
  debeConservarHashEnBloqueo,
  PoliticaRetencion,
  politicasRetencion,
} from '@/lib/retention'
import { registrarAuditoria } from '@/services/auditoria'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/** Firma HMAC-SHA256 del enlace de confirmación de supresión. */
function firmarToken(dataRequestId: string): string {
  return createHmac('sha256', env.CRON_SECRET)
    .update(`supresion:cuenta:${dataRequestId}`)
    .digest('hex')
}

/** Verifica la firma de un enlace de confirmación en tiempo constante. */
function verificarFirmaToken(dataRequestId: string, sig: string): boolean {
  const esperado = firmarToken(dataRequestId)

  if (sig.length !== esperado.length) return false

  return timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(esperado, 'utf8'))
}

/** Valor irreversible que reemplaza un dato personal borrado. */
const ANONIMIZADO = 'borrado'

// ---------------------------------------------------------------------------
// Tipos locales para las filas de exportación.
// Los selecciona Prisma con campos reducidos; estos tipos reflejan exactamente
// lo que se pide en cada `select`, así los `.map` no necesitan tipos de Prisma
// completos.
// ---------------------------------------------------------------------------

/**
 * Datos exportables de un perfil, para el derecho de acceso (Ley 25.326).
 *
 * Solo incluye datos del propio titular: nunca emails ni nombres de clientes
 * que votaron o contactaron, porque esos son datos personales de otros.
 * Los pagos se incluyen porque el titular tiene derecho a saber qué se cobró,
 * aunque la ley los exige conservar por el plazo fiscal.
 */
export type DatosExportables = {
  perfil: {
    id: string
    name: string | null
    slug: string | null
    type: string | null
    companyName: string | null
    tradeName: string | null
    cuit: string | null
    whatsappE164: string | null
    whatsappVerifiedAt: string | null
    description: string | null
    shortBio: string | null
    moderationStatus: string | null
    moderationReason: string | null
    isPublished: boolean | null
    createdAt: string | null
    updatedAt: string | null
  } | null
  user: {
    id: string
    email: string | null
    name: string | null
    role: string | null
    createdAt: string | null
  } | null
  datosFiscales: {
    tipoPersona: string | null
    nombreORazonSocial: string | null
    documento: string | null
    condicionIva: string | null
    domicilioFiscal: string | null
    createdAt: string | null
  } | null
  imagenes: Array<{ id: string; url: string; publicId: string; sortOrder: number }>
  suscripciones: Array<{
    id: string
    status: string | null
    planAmount: number | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    graceUntil: string | null
    cancelAtPeriodEnd: boolean | null
    priceFrozen: boolean | null
    createdAt: string | null
  }>
  pagos: Array<{
    id: string
    amount: number | null
    status: string | null
    feeAmount: number | null
    netAmount: number | null
    paidAt: string | null
    createdAt: string | null
  }>
  contactos: Array<{ id: string; creadoEn: string }>
  votos: Array<{ id: string; creadoEn: string }>
  verificacionesWhatsapp: Array<{
    id: string
    phoneE164: string | null
    status: string | null
    createdAt: string | null
    verifiedAt: string | null
  }>
  reclamosRecibidos: Array<{
    id: string
    tramiteNumber: string
    motivo: string
    estado: string
    creadoEn: string
  }>
  solicitudesDeDatos: Array<{
    id: string
    tipo: string
    estado: string
    tramiteNumber: string
    creadoEn: string
  }>
}

/**
 * Exporta todos los datos personales de un perfil (derecho de acceso).
 */
export async function exportarDatosPerfil(
  profileId: string,
): Promise<Resultado<DatosExportables>> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true },
  })

  if (!perfil) {
    return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  const perfilCompleto = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      id: true, name: true, slug: true, type: true, companyName: true,
      tradeName: true, cuit: true, whatsappE164: true, whatsappVerifiedAt: true,
      description: true, shortBio: true, moderationStatus: true,
      moderationReason: true, isPublished: true, createdAt: true, updatedAt: true,
    },
  })

  const user = await prisma.user.findUnique({
    where: { id: perfil.userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })

  const fiscalData = await prisma.fiscalData.findUnique({
    where: { profileId },
    select: {
      tipoPersona: true, nombreORazonSocial: true, documento: true,
      condicionIva: true, domicilioFiscal: true, createdAt: true,
    },
  })

  const imagenes = await prisma.image.findMany({
    where: { profileId },
    select: { id: true, url: true, publicId: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })

  const suscripciones = await prisma.subscription.findMany({
    where: { profileId },
    select: {
      id: true, status: true, planAmount: true, currentPeriodStart: true,
      currentPeriodEnd: true, graceUntil: true, cancelAtPeriodEnd: true,
      priceFrozen: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const pagos = await prisma.payment.findMany({
    where: { subscription: { profileId } },
    select: {
      id: true, amount: true, status: true, feeAmount: true, netAmount: true,
      paidAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const contactos = await prisma.contactIntent.findMany({
    where: { profileId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const votos = await prisma.profileVote.findMany({
    where: { profileId },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const verificaciones = await prisma.whatsAppVerification.findMany({
    where: { profileId },
    select: {
      id: true, phoneE164: true, status: true, createdAt: true, verifiedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const reclamosRecibidos = await prisma.reclamo.findMany({
    where: { profileId },
    select: { id: true, tramiteNumber: true, motivo: true, estado: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const solicitudes = await prisma.dataRequest.findMany({
    where: { profileId },
    select: { id: true, tipo: true, estado: true, tramiteNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return ok({
    perfil: {
      id: perfilCompleto!.id,
      name: perfilCompleto!.name,
      slug: perfilCompleto!.slug,
      type: perfilCompleto!.type ?? null,
      companyName: perfilCompleto!.companyName,
      tradeName: perfilCompleto!.tradeName,
      cuit: perfilCompleto!.cuit,
      whatsappE164: perfilCompleto!.whatsappE164,
      whatsappVerifiedAt: perfilCompleto!.whatsappVerifiedAt?.toISOString() ?? null,
      description: perfilCompleto!.description,
      shortBio: perfilCompleto!.shortBio,
      moderationStatus: perfilCompleto!.moderationStatus,
      moderationReason: perfilCompleto!.moderationReason,
      isPublished: perfilCompleto!.isPublished,
      createdAt: perfilCompleto!.createdAt.toISOString(),
      updatedAt: perfilCompleto!.updatedAt.toISOString(),
    },
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        }
      : null,
    datosFiscales: fiscalData
      ? {
          tipoPersona: fiscalData.tipoPersona,
          nombreORazonSocial: fiscalData.nombreORazonSocial,
          documento: fiscalData.documento,
          condicionIva: fiscalData.condicionIva,
          domicilioFiscal: fiscalData.domicilioFiscal,
          createdAt: fiscalData.createdAt.toISOString(),
        }
      : null,
    imagenes: imagenes.map((i) => ({
      id: i.id,
      url: i.url,
      publicId: i.publicId,
      sortOrder: i.sortOrder,
    })),
    suscripciones: suscripciones.map((s) => ({
      id: s.id,
      status: s.status,
      planAmount: s.planAmount ? Number(s.planAmount) : null,
      currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      graceUntil: s.graceUntil?.toISOString() ?? null,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      priceFrozen: s.priceFrozen,
      createdAt: s.createdAt.toISOString(),
    })),
    pagos: pagos.map((p) => ({
      id: p.id,
      amount: p.amount ? Number(p.amount) : null,
      status: p.status,
      feeAmount: p.feeAmount ? Number(p.feeAmount) : null,
      netAmount: p.netAmount ? Number(p.netAmount) : null,
      paidAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    contactos: contactos.map((c) => ({ id: c.id, creadoEn: c.createdAt.toISOString() })),
    votos: votos.map((v) => ({ id: v.id, creadoEn: v.createdAt.toISOString() })),
    verificacionesWhatsapp: verificaciones.map((v) => ({
      id: v.id,
      phoneE164: v.phoneE164,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
      verifiedAt: v.verifiedAt?.toISOString() ?? null,
    })),
    reclamosRecibidos: reclamosRecibidos.map((r) => ({
      id: r.id,
      tramiteNumber: r.tramiteNumber,
      motivo: r.motivo,
      estado: r.estado,
      creadoEn: r.createdAt.toISOString(),
    })),
    solicitudesDeDatos: solicitudes.map((s) => ({
      id: s.id,
      tipo: s.tipo,
      estado: s.estado,
      tramiteNumber: s.tramiteNumber,
      creadoEn: s.createdAt.toISOString(),
    })),
  })
}

/**
 * Pide la supresión de una cuenta.
 *
 * Crea un `DataRequest` tipo SUPRESION en `PENDIENTE` y envía un email de
 * confirmación con un enlace firmado. El titular tiene 30 días de gracia para
 * confirmar; pasado eso, el pedido se rechaza.
 */
export async function solicitarSupresionCuenta(params: {
  profileId: string | null
  email: string
  nombre: string | null
}): Promise<Resultado<{ id: string; tramiteNumber: string }>> {
  const { profileId, email, nombre } = params

  const yaPendiente = await prisma.dataRequest.findFirst({
    where: {
      profileId: profileId ?? undefined,
      email,
      tipo: 'SUPRESION',
      estado: { in: ['PENDIENTE', 'EN_PROCESO'] },
    },
    select: { id: true, tramiteNumber: true },
  })

  if (yaPendiente) {
    return ok({ id: yaPendiente.id, tramiteNumber: yaPendiente.tramiteNumber })
  }

  const ahora = new Date()
  const tramite = `SU-${ahora.getUTCFullYear()}${String(ahora.getUTCMonth() + 1).padStart(2, '0')}${String(ahora.getUTCDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  try {
    const solicitud = await prisma.dataRequest.create({
      data: {
        profileId: profileId ?? undefined,
        email,
        nombre: nombre?.trim() || null,
        tipo: 'SUPRESION',
        estado: 'PENDIENTE',
        tramiteNumber: tramite,
      },
      select: { id: true, tramiteNumber: true },
    })

    const sig = firmarToken(solicitud.id)

    await import('@/lib/email').then(({ enviarEmailConfirmarSupresion }) =>
      enviarEmailConfirmarSupresion({
        email,
        nombre: nombre ?? '',
        tramite,
        dataRequestId: solicitud.id,
        firma: sig,
      }).catch((error: unknown) => {
        logger.warn('privacidad: no se pudo enviar email de confirmación de supresión', {
          dataRequestId: solicitud.id,
          tramite,
          error: error instanceof Error ? error.message : String(error),
        })
      }),
    )

    await registrarAuditoria({
      actor: { id: 'sistema', email: 'sistema@poliserviciosnoa.com' },
      accion: 'privacidad.solicitarSupresion',
      entidad: 'DataRequest',
      entidadId: solicitud.id,
      despues: { tipo: 'SUPRESION', email, tramite },
    })

    return ok({ id: solicitud.id, tramiteNumber: tramite })
  } catch (error: unknown) {
    logger.error('privacidad: no se pudo crear la solicitud de supresión', {
      profileId,
      email,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos registrar tu pedido de supresión. Probá de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

/**
 * Ejecuta la supresión de una cuenta tras confirmación por enlace firmado.
 *
 * El proceso es irreversible para los datos personales:
 * - Cancela la suscripción en Mercado Pago (corta cobros futuros).
 * - Borra imágenes de Cloudinary y documentos de empresa privados.
 * - Borra registros de WhatsAppVerification.
 * - Anonimiza User y Profile: email y nombre reemplazados por valores
 *   irreversibles, whatsappE164 borrado.
 * - Borra votos y contactos del titular.
 * - Conserva facturas y pagos (plazo fiscal), desvinculados de datos
 *   personales innecesarios.
 * - Conserva el hash en la lista de bloqueo solo si el perfil fue suspendido
 *   por fraude.
 */
export async function ejecutarSupresionCuenta(params: {
  dataRequestId: string
  firma: string
}): Promise<Resultado<ResumenSupresion>> {
  const { dataRequestId, firma } = params

  const solicitud = await prisma.dataRequest.findUnique({
    where: { id: dataRequestId },
    select: {
      id: true, estado: true, tipo: true, profileId: true, email: true,
      nombre: true, requestedAt: true, tramiteNumber: true,
    },
  })

  if (!solicitud) {
    return err('No encontramos esa solicitud de supresión.', ERROR_CODES.NO_ENCONTRADO)
  }

  if (!verificarFirmaToken(dataRequestId, firma)) {
    return err('El enlace de confirmación no es válido.', ERROR_CODES.SIN_PERMISOS)
  }

  if (solicitud.estado !== 'PENDIENTE') {
    return err(
      `Esta solicitud ya fue ${solicitud.estado.toLowerCase()}.`,
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  // Plazo de gracia: 30 días para confirmar.
  const gracia = new Date(
    solicitud.requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
  )

  if (new Date() > gracia) {
    await prisma.dataRequest.update({
      where: { id: dataRequestId },
      data: {
        estado: 'RECHAZADO',
        resolvedAt: new Date(),
        resolucion: 'Plazo de gracia vencido sin confirmación.',
      },
    })

    return err(
      'El plazo para confirmar la supresión venció. Pedí un nuevo pedido si todavía querés borrar tu cuenta.',
      ERROR_CODES.ESTADO_INVALIDO,
    )
  }

  const profileId = solicitud.profileId

  try {
    const resumen = await prisma.$transaction(async (tx) => {
      let perfilAnonimizado = false
      let hashConservado = false
      let imagenesBorradas = 0
      let votosBorrados = 0
      let contactosBorrados = 0
      let verificacionesBorradas = 0

      if (profileId) {
        const perfil = await tx.profile.findUnique({
          where: { id: profileId },
          select: {
            id: true, userId: true, whatsappE164: true, whatsappHash: true,
            cuitHash: true, moderationStatus: true, moderationReason: true,
            companyDocumentKey: true, isPublished: true,
          },
        })

        if (!perfil) {
          throw new Error('Perfil no encontrado al ejecutar supresión.')
        }

        // 1. Cancelar suscripción en Mercado Pago.
        const suscripcion = await tx.subscription.findUnique({
          where: { profileId },
          select: { id: true, mpPreapprovalId: true, status: true },
        })

        if (suscripcion?.mpPreapprovalId && suscripcion.status !== SubscriptionStatus.CANCELLED) {
          try {
            const proveedor = getProveedor()
            await proveedor.cancelarPreapproval(suscripcion.mpPreapprovalId)
          } catch (error: unknown) {
            logger.warn('privacidad: no se pudo cancelar el preapproval en la supresión', {
              profileId,
              subscriptionId: suscripcion.id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // 2. Borrar imágenes de Cloudinary.
        const imagenes = await tx.image.findMany({
          where: { profileId },
          select: { id: true, publicId: true },
        })

        for (const imagen of imagenes) {
          try {
            await borrarRecurso(imagen.publicId)
            imagenesBorradas += 1
          } catch {
            // Best-effort: la fila se borra igual.
          }
        }

        await tx.image.deleteMany({ where: { profileId } })

        // 3. Borrar documentos de empresa privados.
        if (perfil.companyDocumentKey) {
          try {
            await borrarRecurso(perfil.companyDocumentKey)
          } catch {
            // Best-effort.
          }
        }

        // 4. Borrar registros de WhatsAppVerification.
        const verificaciones = await tx.whatsAppVerification.deleteMany({
          where: { profileId },
        })
        verificacionesBorradas = verificaciones.count

        // 5. Borrar votos del titular sobre otros perfiles y restar contadores.
        const votosDelTitular = await tx.profileVote.findMany({
          where: { clientId: perfil.userId },
          select: { id: true, profileId: true },
        })

        for (const voto of votosDelTitular) {
          await tx.profile.update({
            where: { id: voto.profileId },
            data: { heartsCount: { decrement: 1 } },
          })
        }

        await tx.profileVote.deleteMany({ where: { clientId: perfil.userId } })
        votosBorrados = votosDelTitular.length

        // 6. Borrar contactos del titular (como cliente que contactó).
        const contactos = await tx.contactIntent.deleteMany({
          where: { clientId: perfil.userId },
        })
        contactosBorrados = contactos.count

        // 7. Borrar reclamos que el titular hizo como cliente (evidencias incluidas).
        const reclamosTitular = await tx.reclamo.findMany({
          where: { clientId: perfil.userId },
          select: { id: true },
        })

        for (const reclamo of reclamosTitular) {
          await tx.evidenciaReclamo.deleteMany({ where: { reclamoId: reclamo.id } })
        }

        await tx.reclamo.deleteMany({ where: { clientId: perfil.userId } })

        // 8. Decidir si conserva el hash en la lista de bloqueo.
        hashConservado = debeConservarHashEnBloqueo(
          perfil.moderationStatus,
          perfil.moderationReason,
        )

        // 9. Anonimizar Profile.
        const datosProfile: Record<string, unknown> = {
          name: ANONIMIZADO,
          slug: `${ANONIMIZADO}-${perfil.id}`,
          description: null,
          shortBio: null,
          whatsappVerifiedAt: null,
          whatsappVerifiedBy: null,
          moderationStatus: 'SUSPENDED',
          moderationReason: 'Cuenta suprimida por el titular (Ley 25.326)',
          moderationReviewedAt: new Date(),
          moderationReviewedBy: 'sistema@poliserviciosnoa.com',
          licenseNumber: null,
          licenseReviewedAt: null,
          licenseReviewedBy: null,
          companyDocumentKey: null,
          companyDocumentReviewedAt: null,
          companyVerifiedAt: null,
          companyVerifiedBy: null,
          companyRejectionReason: null,
        }

        if (!hashConservado) {
          datosProfile.whatsappE164 = null
          datosProfile.whatsappHash = null
          datosProfile.cuitHash = null
          datosProfile.cuit = null
        } else {
          datosProfile.whatsappE164 = null
          datosProfile.cuit = null
        }

        await tx.profile.update({
          where: { id: profileId },
          data: datosProfile,
        })

        // 10. Anonimizar User.
        const hashUsuario = hashValor(`${perfil.userId}-${Date.now()}`)

        await tx.user.update({
          where: { id: perfil.userId },
          data: {
            email: `${ANONIMIZADO}-${hashUsuario}@borrado.local`,
            name: null,
            phone: null,
            image: null,
          },
        })

        perfilAnonimizado = true
      }

      // 11. Borrar solicitudes de datos del titular.
      await tx.dataRequest.deleteMany({
        where: { profileId: profileId ?? undefined, email: solicitud.email },
      })

      // 12. Si no hay profile (cliente puro), anonimizar el User directamente.
      if (!profileId) {
        const usuario = await tx.user.findUnique({
          where: { email: solicitud.email },
          select: { id: true },
        })

        if (usuario) {
          const hashUsuario = hashValor(`${usuario.id}-${Date.now()}`)
          await tx.user.update({
            where: { id: usuario.id },
            data: {
              email: `${ANONIMIZADO}-${hashUsuario}@borrado.local`,
              name: null,
              phone: null,
              image: null,
            },
          })
          perfilAnonimizado = true
        }
      }

      // 13. Marcar la solicitud como completada.
      await tx.dataRequest.update({
        where: { id: dataRequestId },
        data: {
          estado: 'COMPLETADO',
          resolvedAt: new Date(),
          resolucion: 'Cuenta suprimida y datos personales anonimizados.',
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: 'sistema',
          actorEmail: 'sistema@poliserviciosnoa.com',
          action: 'privacidad.ejecutarSupresion',
          entityType: 'DataRequest',
          entityId: dataRequestId,
          before: { estado: 'PENDIENTE', email: solicitud.email },
          after: {
            estado: 'COMPLETADO',
            perfilAnonimizado,
            hashConservado,
            imagenesBorradas,
            votosBorrados,
            contactosBorrados,
            verificacionesBorradas,
          },
        },
      })

      return {
        perfilAnonimizado,
        hashConservado,
        imagenesBorradas,
        votosBorrados,
        contactosBorrados,
        verificacionesBorradas,
      }
    })

    // `isPublished` solo se escribe a través de sincronizarPublicacion (D4).
    // Tras anonimizar y suspender, el sincronizador deja el perfil no visible.
    if (profileId) {
      await sincronizarPublicacion(profileId).catch((error: unknown) => {
        logger.warn('privacidad: no se pudo sincronizar la publicación tras la supresión', {
          profileId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    logger.info('privacidad: supresión ejecutada', {
      dataRequestId,
      email: solicitud.email,
      perfilAnonimizado: resumen.perfilAnonimizado,
      hashConservado: resumen.hashConservado,
      imagenesBorradas: resumen.imagenesBorradas,
    })

    return ok({
      id: dataRequestId,
      tramiteNumber: solicitud.tramiteNumber,
      ...resumen,
    })
  } catch (error: unknown) {
    logger.error('privacidad: falló la ejecución de la supresión', {
      dataRequestId,
      error: error instanceof Error ? error.message : String(error),
    })

    return err(
      'No pudimos completar la supresión en este momento. Tus datos siguen protegidos y lo intentamos de nuevo.',
      ERROR_CODES.DESCONOCIDO,
    )
  }
}

export type ResumenSupresion = {
  id: string
  tramiteNumber: string
  perfilAnonimizado: boolean
  hashConservado: boolean
  imagenesBorradas: number
  votosBorrados: number
  contactosBorrados: number
  verificacionesBorradas: number
}
