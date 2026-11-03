import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import { obtenerEstado } from '@/services/verificacion-whatsapp'

/**
 * Estado de la verificación, para el polling de la UI.
 *
 * Ruta aparte y no un Server Action porque el polling corre cada 3 segundos
 * durante 15 minutos: son 300 ida y vuelta. Una action obliga a serializar la
 * respuesta con RSC y arrastra el runtime entero; una route handler devuelve
 * cuatro campos y nada más.
 *
 * Solo devuelve el estado. Nunca el código ni el número en claro: si esta
 * respuesta se cachea o queda en un log del navegador, no tiene que filtrar
 * nada utilizable.
 */

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
    return NextResponse.json({ error: 'No tenés un perfil todavía.' }, { status: 404 })
  }

  return NextResponse.json(await obtenerEstado(perfil.id), {
    headers: { 'Cache-Control': 'no-store' },
  })
}