'use server'

import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { registrarReclamo } from '@/services/reclamos'
import { solicitarArrepentimiento, solicitarBaja } from '@/services/cancelaciones'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Server Actions de baja, arrepentimiento y libro de quejas.
 *
 * El `profileId` sale de la sesión. En arrepentimiento y baja eso no es
 * opcional: un id por parámetro permitiría reembolsar el pago de otro.
 *
 * La baja y el arrepentimiento devuelven el trámite porque la pantalla lo
 * muestra y porque el email de constancia puede fallar sin que la operación
 * falle.
 */

const MOTIVO_MAX = 1000

const esquemaMotivo = z.object({
  motivo: z.string().trim().max(MOTIVO_MAX).optional(),
})

/** Da de baja la suscripción. No devuelve dinero: corta la renovación. */
export async function darDeBaja(entrada: unknown): Promise<Resultado<{ tramite: string }>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return err(perfil.error, perfil.code)

  const datos = esquemaMotivo.safeParse(entrada ?? {})

  if (!datos.success) {
    return err('El motivo es demasiado largo.', ERROR_CODES.VALIDACION)
  }

  const resultado = await solicitarBaja(perfil.data, datos.data.motivo)

  if (!resultado.ok) return err(resultado.error, resultado.code)

  return ok({ tramite: resultado.data.tramite })
}

/** Revoca la contratación dentro de los 10 días y devuelve el dinero. */
export async function arrepentirme(
  entrada: unknown,
): Promise<Resultado<{ tramite: string; monto: number }>> {
  const perfil = await perfilDeLaSesion()

  if (!perfil.ok) return err(perfil.error, perfil.code)

  const datos = esquemaMotivo.safeParse(entrada ?? {})

  if (!datos.success) {
    return err('El motivo es demasiado largo.', ERROR_CODES.VALIDACION)
  }

  const resultado = await solicitarArrepentimiento(perfil.data, datos.data.motivo)

  if (!resultado.ok) return err(resultado.error, resultado.code)

  return ok({ tramite: resultado.data.tramite, monto: resultado.data.monto })
}

const esquemaReclamo = z.object({
  nombre: z.string().trim().min(2, 'Poné tu nombre.').max(120),
  email: z.string().trim().toLowerCase().email('Revisá el email.'),
  telefono: z.string().trim().max(40).optional(),
  referencia: z.string().trim().max(120).optional(),
  mensaje: z
    .string()
    .trim()
    .min(20, 'Contanos un poco más: al menos 20 caracteres.')
    .max(4000, 'El reclamo es demasiado largo.'),
  // Campo trampa: un humano no lo ve ni lo completa. Si viene con algo, es un
  // bot y se descarta sin decirle por qué.
  sitioWeb: z.string().max(0).optional(),
})

/** Registra un reclamo en el libro de quejas. Es público, sin sesión. */
export async function enviarReclamo(entrada: unknown): Promise<Resultado<{ numero: string }>> {
  const datos = esquemaReclamo.safeParse(entrada)

  if (!datos.success) {
    return err(datos.error.issues[0]?.message ?? 'Revisá los datos.', ERROR_CODES.VALIDACION)
  }

  if (datos.data.sitioWeb) {
    return err('No pudimos registrar el reclamo.', ERROR_CODES.VALIDACION)
  }

  return registrarReclamo({
    nombre: datos.data.nombre,
    email: datos.data.email,
    telefono: datos.data.telefono,
    referencia: datos.data.referencia,
    mensaje: datos.data.mensaje,
  })
}

async function perfilDeLaSesion(): Promise<Resultado<string>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  return ok(perfil.id)
}
