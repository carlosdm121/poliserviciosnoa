import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { esBot } from '@/lib/bots'
import { ipHasheada } from '@/lib/peticion'
import { rateLimit } from '@/lib/ratelimit'
import { registrarContacto } from '@/services/contacto'
import { ERROR_CODES } from '@/types/resultado'

/** La ruta no se cachea: cada clic tiene que contar. */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params
  const limite = await rateLimit(`contacto:ip:${await ipHasheada()}`, 30, 60)

  if (limite.limitado) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Probá en un minuto.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limite.restante) },
      },
    )
  }

  const session = await getServerSession(authOptions)
  const clientId = session?.user.role === 'CLIENT' ? session.user.id : null
  const userAgent = request.headers.get('user-agent')

  const resultado = await registrarContacto({
    slug,
    clientId,
    contar: !esBot(userAgent),
  })

  if (!resultado.ok) {
    if (resultado.code === ERROR_CODES.NO_ENCONTRADO) {
      return NextResponse.json({ error: resultado.error }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'No pudimos abrir el contacto. Probá de nuevo.' },
      { status: 500 },
    )
  }

  return NextResponse.redirect(resultado.data.url, 302)
}
