'use server'

import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { guardarPerfil } from '@/services/perfil'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'
import type { PerfilInput } from '@/schemas/perfil'

/**
 * Guardado del perfil.
 *
 * `"use server"` arriba del archivo, sin excepción (ver `decisions.md` D8): sin
 * la directiva, Prisma entra al bundle del cliente.
 */

/**
 * Guarda los datos del perfil.
 *
 * Toda la revalidación ocurre en el servidor, dentro de la transacción y con
 * la fila bloqueada. Lo que llega del cliente es solo una pista.
 */
export async function guardarDatosPerfil(entrada: PerfilInput): Promise<Resultado<null>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return err('No encontramos tu perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  return guardarPerfil(perfil.id, entrada, ipDelRequest())
}

/**
 * IP del cliente.
 *
 * Solo se hashea, para la señal de riesgo. Delante de Vercel hay proxies, así
 * que no sirve para ubicar a nadie, pero sí para detectar dos sesiones del
 * mismo perfil desde conexiones distintas.
 */
function ipDelRequest(): string | undefined {
  const headersList = headers()

  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    undefined
  )
}