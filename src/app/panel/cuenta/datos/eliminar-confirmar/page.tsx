import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { authOptions } from '@/lib/auth'
import { enviarEmailConstanciaSupresion } from '@/lib/email'
import { logger } from '@/lib/logger'
import { privacidadEjecutarSupresion } from '@/app/actions/privacidad'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaConfirmarSupresion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactElement> {
  const sp = await searchParams
  const requestId = uno(sp.request)
  const firma = uno(sp.sig)

  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    redirect('/login?callbackUrl=/panel/cuenta/datos')
  }

  if (!requestId || !firma) {
    redirect('/panel/cuenta/datos?error=Faltan los datos para confirmar la supresión.')
  }

  const resultado = await privacidadEjecutarSupresion({
    dataRequestId: requestId,
    firma,
  })

  if (!resultado.ok) {
    redirect(
      `/panel/cuenta/datos?error=${encodeURIComponent(resultado.error)}`,
    )
  }

  const tramite = resultado.data.tramiteNumber

  // Email de constancia al titular.
  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { name: true },
  })

  await enviarEmailConstanciaSupresion({
    email: sesion.user.email ?? '',
    nombre: perfil?.name ?? '',
    tramite,
  }).catch((error: unknown) => {
    // No falla la confirmación si el email no se envía.
    logger.error('privacidad: no se pudo enviar constancia de supresión', { error })
  })

  redirect(
    `/panel/cuenta/datos?ok=Tu cuenta fue suprimida y tus datos personales anonimizados (trámite ${tramite}).`,
  )
}
