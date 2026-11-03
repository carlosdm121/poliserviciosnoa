'use server'

import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/ratelimit'
import { alternarVoto } from '@/services/votos'
import { ERROR_CODES, err, type Resultado } from '@/types/resultado'

const idSchema = z.string().min(10).max(40)

/**
 * Alterna el corazón desde la UI.
 *
 * Vuelve a leer el rol de la base: el token puede tener un rol viejo y esta
 * acción escribe. El rate limit es por cliente, no por IP: dos clientes en la
 * misma oficina no se tienen que pisar el límite.
 */
export async function votar(
  profileId: string,
): Promise<Resultado<{ votado: boolean; corazones: number }>> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    return err('Ingresá para valorar a este profesional.', ERROR_CODES.NO_AUTENTICADO)
  }

  const id = idSchema.safeParse(profileId)
  if (!id.success) {
    return err('Ese perfil no existe.', ERROR_CODES.NO_ENCONTRADO)
  }

  const usuario = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  })

  if (!usuario || usuario.role !== 'CLIENT') {
    return err('Necesitás una cuenta de cliente para valorar.', ERROR_CODES.SIN_PERMISOS)
  }

  const limite = await rateLimit(`votos:cliente:${usuario.id}`, 20, 60 * 60)

  if (limite.limitado) {
    return err(
      'Hiciste muchos votos en poco tiempo. Probá de nuevo más tarde.',
      ERROR_CODES.RATE_LIMIT,
    )
  }

  const resultado = await alternarVoto({ profileId: id.data, clientId: usuario.id })

  if (resultado.ok) {
    revalidatePath('/mis-contactos')
  }

  return resultado
}
