import { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generarPdfDeFactura, perfilDeFactura } from '@/services/facturacion'
import { NextResponse } from 'next/server'

/**
 * Descarga del comprobante en PDF.
 *
 * El PDF no se guarda en ningún lado: se arma desde la fila de `Invoice`, que
 * tiene los datos fiscales congelados al momento de la emisión. Una factura de
 * marzo sigue imprimiendo el precio de marzo aunque la suscripción ya valga
 * otra cosa.
 *
 * Un profesional solo puede bajar sus propias facturas; el admin, cualquiera.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const duenio = await perfilDeFactura(params.id)

  if (!duenio) {
    return NextResponse.json({ error: 'No encontramos el comprobante.' }, { status: 404 })
  }

  if (sesion.user.role !== UserRole.ADMIN) {
    const perfil = await prisma.profile.findUnique({
      where: { userId: sesion.user.id },
      select: { id: true },
    })

    if (perfil?.id !== duenio) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
  }

  const archivo = await generarPdfDeFactura(params.id)

  if (!archivo) {
    return NextResponse.json(
      { error: 'El comprobante todavía no está emitido.' },
      { status: 404 },
    )
  }

  // Copia a un `Uint8Array` nuevo: `Buffer` no entra en el tipo `BodyInit` de
  // `NextResponse` porque puede estar respaldado por memoria compartida.
  const cuerpo = new Uint8Array(archivo.pdf.byteLength)
  cuerpo.set(archivo.pdf)

  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
