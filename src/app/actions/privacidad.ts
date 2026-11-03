'use server'

import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { solicitarSupresionCuenta } from '@/services/privacidad'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave)

  return typeof valor === 'string' ? valor.trim() : ''
}

/** Usuario de la sesión actual, cualquiera sea su rol. */
async function usuarioSesion(): Promise<{ id: string; email: string } | null> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) return null

  return { id: sesion.user.id, email: sesion.user.email ?? '' }
}

/**
 * Pide la supresión de la cuenta del usuario logueado.
 *
 * Crea un DataRequest tipo SUPRESION en PENDIENTE y envía el email de
 * confirmación. El titular tiene 30 días para confirmar por el enlace del
 * email; pasado ese plazo, el pedido se rechaza.
 */
export async function privacidadSolicitarSupresion(datos: FormData): Promise<void> {
  const actor = await usuarioSesion()

  if (!actor) {
    redirect('/login?callbackUrl=/panel/cuenta/datos')
  }

  const perfil = await import('@/lib/prisma').then(({ prisma }) =>
    prisma.profile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    }),
  )

  const profileId = perfil ? perfil.id : null
  const nombre = actor.email.split('@')[0]

  const resultado = await solicitarSupresionCuenta({
    profileId: profileId ?? null,
    email: actor.email,
    nombre: nombre ?? null,
  })

  if (!resultado.ok) {
    redirect(`/panel/cuenta/datos?error=${encodeURIComponent(resultado.error)}`)
  }

  const tramite = resultado.data!.tramiteNumber

  redirect(
    `/panel/cuenta/datos?ok=Pedido de supresión registrado (trámite ${tramite}). Te enviamos un email para confirmar.`,
  )
}

/**
 * Ejecuta la supresión tras confirmación por enlace firmado.
 *
 * Se llama desde la página de confirmación (no es un form), por eso recibe
 * los parámetros directamente y no un FormData.
 */
export async function privacidadEjecutarSupresion(params: {
  dataRequestId: string
  firma: string
}): Promise<Resultado<{ tramiteNumber: string }>> {
  const { ejecutarSupresionCuenta } = await import('@/services/privacidad')

  return ejecutarSupresionCuenta(params)
}
