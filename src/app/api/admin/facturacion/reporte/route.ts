import { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { reporteMensualCsv } from '@/services/facturacion'
import { NextResponse } from 'next/server'

/**
 * Reporte mensual en CSV para el contador.
 *
 * Se sirve como descarga y no como Server Action porque el navegador tiene que
 * guardar un archivo, no recibir RSC. Lleva BOM UTF-8 para que Excel abra bien
 * los acentos, que es el único cliente de CSV que le importa al contador.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  if (sesion.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const ahora = new Date()
  const anio = Number(searchParams.get('anio') ?? ahora.getUTCFullYear())
  const mes = Number(searchParams.get('mes') ?? ahora.getUTCMonth() + 1)

  if (!Number.isInteger(anio) || anio < 2024 || anio > 2100) {
    return NextResponse.json({ error: 'Año inválido' }, { status: 400 })
  }

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
  }

  const csv = await reporteMensualCsv(anio, mes)
  const nombre = `facturacion-${anio}-${String(mes).padStart(2, '0')}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
