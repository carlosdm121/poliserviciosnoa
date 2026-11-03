import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exportarDatosPerfil } from '@/services/privacidad'

export const dynamic = 'force-dynamic'

/**
 * Exporta los datos personales del usuario logueado (derecho de acceso).
 *
 * Devuelve un JSON que el navegador guarda como archivo. Solo incluye datos
 * del titular: nunca emails ni nombres de terceros.
 */
export async function GET(): Promise<Response> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return NextResponse.json(
      { error: 'No tienes un perfil asociado a esta cuenta.' },
      { status: 404 },
    )
  }

  const resultado = await exportarDatosPerfil(perfil.id)

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 404 })
  }

  const json = JSON.stringify(resultado.data, null, 2)
  const nombreArchivo = `poliserviciosnoa-datos-${new Date().toISOString().slice(0, 10)}.json`

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
