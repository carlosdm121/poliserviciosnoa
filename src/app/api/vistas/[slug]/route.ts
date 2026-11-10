import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { esBot } from '@/lib/bots'
import { ipHasheada } from '@/lib/peticion'
import { rateLimit } from '@/lib/ratelimit'
import { registrarVista } from '@/services/vistas'
import { ERROR_CODES } from '@/types/resultado'

/**
 * Ventana de deduplicación.
 *
 * Media hora por IP y perfil. Sin esto, recargar la página diez veces suma diez
 * visitas y el ranking deja de reflejar interés real. No se usa una cookie
 * porque el contador no debe escribir nada en el navegador del visitante.
 */
const VENTANA_VISTA_SEGUNDOS = 30 * 60

/** La ruta no se cachea: cada visita tiene que evaluarse. */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  // Un bot no tiene que llegar ni al rate limit: no suma y no hay nada que
  // responderle.
  if (esBot(request.headers.get('user-agent'))) {
    return new NextResponse(null, { status: 204 })
  }

  const { slug } = await params

  const limite = await rateLimit(
    `vista:ip:${await ipHasheada()}:${slug}`,
    1,
    VENTANA_VISTA_SEGUNDOS,
  )

  // Ya contada: 204 igual. Devolver 429 llenaría la consola del visitante por
  // una acción que él no pidió y que no puede resolver.
  if (limite.limitado) {
    return new NextResponse(null, { status: 204 })
  }

  const session = await getServerSession(authOptions)

  const resultado = await registrarVista({
    slug,
    viewerUserId: session?.user.id ?? null,
  })

  if (!resultado.ok) {
    if (resultado.code === ERROR_CODES.NO_ENCONTRADO) {
      return NextResponse.json({ error: resultado.error }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'No pudimos registrar la visita. Probá de nuevo.' },
      { status: 500 },
    )
  }

  return new NextResponse(null, { status: 204 })
}
