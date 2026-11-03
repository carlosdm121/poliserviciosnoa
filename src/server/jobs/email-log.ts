import { prisma } from '@/lib/prisma'

/**
 * Reserva de un email en `EmailLog`.
 *
 * El cron puede correr dos veces el mismo día —un reintento de Vercel, una
 * ejecución manual desde el panel— y el aviso tiene que salir una sola vez. La
 * unicidad no se resuelve leyendo antes de escribir: dos ejecuciones
 * concurrentes leen "no existe" al mismo tiempo. Se intenta insertar y la base
 * decide.
 *
 * `null` significa "ya estaba enviado". No es un error.
 *
 * `createMany({ skipDuplicates: true })` y no `create` con catch del P2002: el
 * catch funciona, pero Prisma escribe el error en el log antes de devolverlo y
 * el cron de todos los días quedaría lleno de "unique constraint failed" que no
 * son fallas. Insertar con `ON CONFLICT DO NOTHING` no genera error.
 */
export async function reservarEmail(params: {
  profileId: string | null
  email: string
  template: string
  dedupeKey: string
}): Promise<string | null> {
  const creados = await prisma.emailLog.createMany({
    data: [params],
    skipDuplicates: true,
  })

  if (creados.count === 0) return null

  const registro = await prisma.emailLog.findUnique({
    where: {
      email_template_dedupeKey: {
        email: params.email,
        template: params.template,
        dedupeKey: params.dedupeKey,
      },
    },
    select: { id: true },
  })

  return registro?.id ?? null
}

/**
 * Libera la reserva cuando el envío falló.
 *
 * Sin esto, un error de Resend dejaría el email marcado como enviado para
 * siempre y el profesional no recibiría nunca el aviso de vencimiento.
 */
export async function liberarEmail(id: string): Promise<void> {
  await prisma.emailLog.delete({ where: { id } }).catch(() => undefined)
}
