import 'server-only'

import type { UserRole } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { puedeVerSeccion, type SeccionAdmin } from '@/lib/admin'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Autorización real del panel.
 *
 * El middleware ya bloquea la ruta, pero corre en el Edge con el token de la
 * sesión, que puede tener hasta 30 días. Acá se vuelve a leer el rol **de la
 * base** en cada página y en cada server action: si a alguien se le quitó el
 * rol, deja de entrar en el siguiente request y no dentro de un mes.
 */

export type ActorAdmin = {
  id: string
  email: string
  role: UserRole
}

/** Actor con rol de panel, o el error que corresponde. */
export async function exigirAdmin(): Promise<Resultado<ActorAdmin>> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return err('Iniciá sesión para continuar.', ERROR_CODES.NO_AUTENTICADO)
  }

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, email: true, role: true },
  })

  if (!usuario || (usuario.role !== 'ADMIN' && usuario.role !== 'MODERADOR')) {
    logger.warn('admin: acción rechazada por rol', { email: usuario?.email })
    return err('No tenés permisos para hacer esto.', ERROR_CODES.SIN_PERMISOS)
  }

  return ok(usuario)
}

/** Actor con rol ADMIN. Para dinero, catálogo, configuración y auditoría. */
export async function exigirSuperAdmin(): Promise<Resultado<ActorAdmin>> {
  const actor = await exigirAdmin()

  if (!actor.ok) return actor

  if (actor.data.role !== 'ADMIN') {
    logger.warn('admin: sección solo para ADMIN', { email: actor.data.email })
    return err('Esta sección es solo para administración.', ERROR_CODES.SIN_PERMISOS)
  }

  return actor
}

/**
 * Verificación de página. Redirige en vez de devolver un error porque una
 * página no tiene dónde mostrar un `Resultado`.
 *
 * - Sin sesión: al login con `callbackUrl`.
 * - Con sesión sin permiso: al resumen del panel, que sí puede ver.
 */
export async function exigirAccesoPagina(seccion: SeccionAdmin): Promise<ActorAdmin> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(rutaDe(seccion))}`)
  }

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, email: true, role: true },
  })

  if (!usuario) {
    redirect('/login')
  }

  if (!puedeVerSeccion(usuario.role, seccion)) {
    logger.warn('admin: página rechazada por rol', {
      email: usuario.email,
      seccion,
      rol: usuario.role,
    })

    redirect('/admin?error=sin-permisos')
  }

  return usuario
}

/** Ruta de la sección, para el `callbackUrl` del login. */
function rutaDe(seccion: SeccionAdmin): string {
  return seccion === 'inicio' ? '/admin' : `/admin/${seccion}`
}
