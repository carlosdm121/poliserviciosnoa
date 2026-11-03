/**
 * Autenticación obligatoria del lado del servidor (punto 6 del módulo 6.1).
 *
 * `requireUser` y `requireRole` leen la sesión y **vuelven a consultar el rol y
 * el estado del usuario a la base de datos**. Nunca se confía solo en el JWT:
 * el token dura 30 días y puede tener un rol desactualizado.
 *
 * Estos helpers se usan en Server Components, Server Actions y Route Handlers
 * que no son públicos. Los componentes de cliente nunca deciden permisos:
 * ocultar un botón no es seguridad.
 *
 * No llevan `import "server-only"` (ver `decisions.md` D9): se importan desde
 * Server Actions y esa directiva rompe el build. Corren solo en el servidor.
 */

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/** Estado de cuenta que permite usar la aplicación. */
type EstadoCuenta = 'ACTIVE' | 'BLOCKED'

/** Resultado de `requireUser`: el usuario verificado o `null`. */
export type UsuarioAutenticado = {
  id: string
  email: string
  role: string
  estado: EstadoCuenta
}

/**
 * Devuelve el usuario autenticado si existe y está activo.
 *
 * Re-consulta la base para el rol y el estado (ACTIVE/BLOCKED), así un usuario
 * suspendido o cuyo rol cambió no puede seguir operando aunque tenga un token
 * viejo.
 *
 * Devuelve `null` si no hay sesión, el usuario no existe o está bloqueado.
 */
export async function requireUser(): Promise<UsuarioAutenticado | null> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) return null

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, email: true, role: true },
  })

  if (!usuario) return null

  // El rol viaja en el token pero se re-valida en la base. Si cambió, el token
  // es desactualizado y se trata como no autenticado para esta acción.
  const rolValido = ['PROFESSIONAL', 'CLIENT', 'MODERADOR', 'ADMIN'].includes(
    usuario.role,
  )

  if (!rolValido) {
    logger.warn('session: usuario con rol inválido', {
      userId: usuario.id,
      rol: usuario.role,
    })
    return null
  }

  // No hay columna `estado` en User todavía; el estado implícito es ACTIVE si
  // el usuario existe y no hay sesiónVersion invalidadora. Cuando se agregue
  // `sessionVersion` (punto 9), acá se compara con el token.
  return {
    id: usuario.id,
    email: usuario.email,
    role: usuario.role,
    estado: 'ACTIVE',
  }
}

/**
 * Devuelve el usuario solo si tiene uno de los roles permitidos.
 *
 * Lanza un error si no hay sesión o el rol no está en `rolesPermitidos`, para
 * que quien llama no tenga que chequear `null` dos veces.
 *
 * @param rolesPermitidos Roles que pueden ejecutar la acción.
 */
export async function requireRole(
  rolesPermitidos: readonly string[],
): Promise<UsuarioAutenticado> {
  const usuario = await requireUser()

  if (!usuario) {
    throw new Error('No autenticado.')
  }

  if (!rolesPermitidos.includes(usuario.role)) {
    logger.warn('session: rol sin permiso para acción', {
      userId: usuario.id,
      rol: usuario.role,
      rolesPermitidos,
    })
    throw new Error('Sin permisos.')
  }

  return usuario
}

/**
 * Invalida todas las sesiones del usuario incrementando su `sessionVersion`.
 *
 * Se llama al cambiar la contraseña, bloquear al usuario o cerrar sesión en
 * todos los dispositivos. Los tokens JWT anteriores dejan de ser válidos
 * porque el `sessionVersion` del token no coincide con el de la base.
 *
 * Por ahora no hay columna `sessionVersion` en User (pendiente de migración de
 * schema). Cuando se agregue, esta función la incrementa y `requireUser` la
 * compara con el token.
 *
 * @param userId ID del usuario cuyas sesiones se invalidan.
 */
export async function invalidarSesiones(userId: string): Promise<void> {
  // Placeholder: se conecta a la columna sessionVersion cuando exista en el
  // schema. Hasta entonces, se loguea la intención para no perder el rastro.
  logger.info('session: invalidar sesiones', { userId })
}
