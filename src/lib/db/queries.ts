/**
 * Controles de propiedad centralizados para prevenir IDOR.
 *
 * Ninguna consulta que reciba un `id` desde el cliente debe filtrar solo por
 * ese id: siempre debe filtrar también por el `userId` del dueño. Estas
 * funciones se usan en cada service que expone un recurso propiedad de un
 * usuario.
 *
 * Todas reciben un cliente Prisma dentro de una transacción (con RLS activo
 * vía `withUser`), y lanzan un error si el recurso no existe o no pertenece al
 * usuario. Así se evita que un usuario lea o modifique datos de otro
 * cambiando un id en la URL o el body.
 *
 * Estas funciones NO llevan `import 'server-only'` (ver D9): se importan desde
 * Server Actions y la directiva rompe el build. Corren solo en el servidor.
 */

import { Prisma } from '@prisma/client'

import { NotFoundError, PropiedadDenegadaError } from '@/types/resultado'

/** Límite máximo de registros por consulta paginada. */
export const LIMITE_PAGINACION_MAX = 50

/**
 * Valida que un `take` de paginación no exceda el máximo.
 */
export function validarTake(take?: number): number {
  const valor = take ?? 20
  if (valor < 1) return 1
  if (valor > LIMITE_PAGINACION_MAX) return LIMITE_PAGINACION_MAX
  return valor
}

/**
 * Obtiene el perfil del usuario autenticado. Lanza error si no existe o no
 * pertenece al userId.
 */
export async function getOwnedProfile(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{
  id: string
  userId: string
  type: string
  name: string
  slug: string
  moderationStatus: string
  isPublished: boolean
}> {
  const perfil = await tx.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      type: true,
      name: true,
      slug: true,
      moderationStatus: true,
      isPublished: true,
    },
  })

  if (!perfil) {
    throw new NotFoundError('Perfil no encontrado para este usuario.')
  }

  // RLS ya filtra por owner, pero esta verificación adicional es defensa en
  // profundidad por si RLS no estuviera activo en algún entorno.
  if (perfil.userId !== userId) {
    throw new PropiedadDenegadaError('El perfil no pertenece al usuario autenticado.')
  }

  return perfil
}

/**
 * Obtiene la suscripción del perfil del usuario. Lanza error si no existe o
 * no pertenece al userId.
 */
export async function getOwnedSubscription(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{
  id: string
  profileId: string
  status: string
  planId: string | null
  planAmount: Prisma.Decimal
}> {
  const perfil = await getOwnedProfile(tx, userId)

  const suscripcion = await tx.subscription.findUnique({
    where: { profileId: perfil.id },
    select: {
      id: true,
      profileId: true,
      status: true,
      planId: true,
      planAmount: true,
    },
  })

  if (!suscripcion) {
    throw new NotFoundError('Suscripción no encontrada para este perfil.')
  }

  return suscripcion
}

/**
 * Obtiene un pago y verifica que pertenece al perfil del usuario.
 */
export async function getOwnedPayment(
  tx: Prisma.TransactionClient,
  userId: string,
  paymentId: string,
): Promise<{
  id: string
  subscriptionId: string
  amount: Prisma.Decimal
  status: string
}> {
  const suscripcion = await getOwnedSubscription(tx, userId)

  const pago = await tx.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      subscriptionId: true,
      amount: true,
      status: true,
    },
  })

  if (!pago) {
    throw new NotFoundError('Pago no encontrado.')
  }

  if (pago.subscriptionId !== suscripcion.id) {
    throw new PropiedadDenegadaError('El pago no pertenece al perfil del usuario.')
  }

  return pago
}

/**
 * Obtiene una factura y verifica que pertenece al perfil del usuario.
 */
export async function getOwnedInvoice(
  tx: Prisma.TransactionClient,
  userId: string,
  invoiceId: string,
): Promise<{
  id: string
  paymentId: string
  status: string
  total: Prisma.Decimal
}> {
  const suscripcion = await getOwnedSubscription(tx, userId)

  const pago = await tx.payment.findFirst({
    where: { subscriptionId: suscripcion.id },
    select: { id: true },
  })

  if (!pago) {
    throw new NotFoundError('No hay pagos para este perfil.')
  }

  const factura = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      paymentId: true,
      status: true,
      total: true,
    },
  })

  if (!factura) {
    throw new NotFoundError('Factura no encontrada.')
  }

  if (factura.paymentId !== pago.id) {
    throw new PropiedadDenegadaError('La factura no pertenece al perfil del usuario.')
  }

  return factura
}

/**
 * Obtiene una verificación de WhatsApp y verifica que pertenece al perfil del
 * usuario.
 */
export async function getOwnedWhatsAppVerification(
  tx: Prisma.TransactionClient,
  userId: string,
  verificationId: string,
): Promise<{
  id: string
  profileId: string
  status: string
}> {
  const perfil = await getOwnedProfile(tx, userId)

  const verificacion = await tx.whatsAppVerification.findUnique({
    where: { id: verificationId },
    select: {
      id: true,
      profileId: true,
      status: true,
    },
  })

  if (!verificacion) {
    throw new NotFoundError('Verificación de WhatsApp no encontrada.')
  }

  if (verificacion.profileId !== perfil.id) {
    throw new PropiedadDenegadaError(
      'La verificación de WhatsApp no pertenece al perfil del usuario.',
    )
  }

  return verificacion
}

/**
 * Obtiene un contacto (ContactIntent) y verifica que pertenece al cliente
 * autenticado.
 */
export async function getOwnedContactIntent(
  tx: Prisma.TransactionClient,
  clientId: string,
  contactIntentId: string,
): Promise<{
  id: string
  profileId: string
  clientId: string
}> {
  const contacto = await tx.contactIntent.findUnique({
    where: { id: contactIntentId },
    select: {
      id: true,
      profileId: true,
      clientId: true,
    },
  })

  if (!contacto) {
    throw new NotFoundError('Contacto no encontrado.')
  }

  if (contacto.clientId !== clientId) {
    throw new PropiedadDenegadaError(
      'El contacto no pertenece al cliente autenticado.',
    )
  }

  return contacto
}

/**
 * Obtiene un voto y verifica que pertenece al cliente autenticado.
 */
export async function getOwnedVote(
  tx: Prisma.TransactionClient,
  clientId: string,
  voteId: string,
): Promise<{
  id: string
  profileId: string
  clientId: string
}> {
  const voto = await tx.profileVote.findUnique({
    where: { id: voteId },
    select: {
      id: true,
      profileId: true,
      clientId: true,
    },
  })

  if (!voto) {
    throw new NotFoundError('Voto no encontrado.')
  }

  if (voto.clientId !== clientId) {
    throw new PropiedadDenegadaError('El voto no pertenece al cliente autenticado.')
  }

  return voto
}

/**
 * Verifica que el usuario autenticado es ADMIN. Lanza PropiedadDenegadaError
 * si no lo es.
 */
export function exigirAdmin(role: string): void {
  if (role !== 'ADMIN') {
    throw new PropiedadDenegadaError('Solo el administrador puede realizar esta acción.')
  }
}

/**
 * Verifica que el usuario autenticado es ADMIN o MODERADOR.
 */
export function exigirStaff(role: string): void {
  if (role !== 'ADMIN' && role !== 'MODERADOR') {
    throw new PropiedadDenegadaError('Solo el personal de administración puede realizar esta acción.')
  }
}
