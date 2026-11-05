import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { obtenerPersonalizacionPublica } from '@/services/personalizacion'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return NextResponse.json({ error: 'No se encontró el perfil' }, { status: 404 })
  }

  const datos = await obtenerPersonalizacionPublica(perfil.id)

  return NextResponse.json({
    logoUrl: datos?.logoUrl ?? null,
    bannerUrl: datos?.bannerUrl ?? null,
    pageColors: datos?.pageColors ?? null,
  })
}
