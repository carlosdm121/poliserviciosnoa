import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { puedeVerEvidencias } from '@/services/reclamo'

/**
 * Acceso controlado a evidencias privadas de un reclamo.
 *
 * Las evidencias se guardan como URL directa (Cloudinary), pero no se devuelven
 * al cliente sin pasar por acá. La ruta exige:
 * 1. Sesión válida (cookie httpOnly de NextAuth).
 * 2. Rol autorizado: administrador, dueño del reclamo (cliente) o dueño del
 *    perfil afectado (profesional).
 *
 * Así el ID de la evidencia no es una URL filtrada: sin sesión y sin permiso
 * no se llega al archivo.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const evidencia = await prisma.evidenciaReclamo.findUnique({
    where: { id },
    select: { id: true, url: true, reclamoId: true },
  })

  if (!evidencia) {
    return NextResponse.json({ error: 'No encontramos esa evidencia.' }, { status: 404 })
  }

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, role: true },
  })

  if (!usuario) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const autorizado = await puedeVerEvidencias(
    evidencia.reclamoId,
    usuario.id,
    usuario.role,
  )

  if (!autorizado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Redirige a la URL real de la evidencia. El ID es un cuid (adivinarlo es
  // inviable) y la ruta ya verificó sesión y rol, así que filtrar por el
  // Location header no revela nada a quien no tiene acceso.
  return NextResponse.redirect(evidencia.url, 302)
}
