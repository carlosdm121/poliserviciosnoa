/**
 * Helpers para Row Level Security (RLS) con variables de sesión de PostgreSQL.
 *
 * La app se conecta a la base con el rol `app_runtime`, que NO es dueño de las
 * tablas y NO tiene `BYPASSRLS`. Cada request establece al inicio de la
 * transacción:
 *
 *   set_config('app.user_id', '<id_del_usuario>', true)
 *   set_config('app.role', '<rol>', true)
 *
 * Las políticas de RLS leen estas variables con `current_setting()` para
 * decidir qué filas puede ver o modificar cada usuario. Así, incluso si la app
 * tiene un bug de IDOR, una consulta con el id de otro usuario devuelve 0
 * filas porque RLS la filtra a nivel de base de datos.
 *
 * `withUser` es para acciones de usuarios autenticados.
 * `withSystem` es para webhooks y cron (app.role = 'system', sin user_id).
 *
 * IMPORTANTE: estos helpers no están marcados con `import 'server-only'` a
 * propósito (ver `decisions.md` D9): se importan desde Server Actions y esa
 * directiva rompe el build. La protección real es que solo se usan en el
 * servidor, nunca en componentes de cliente.
 */

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

/** Roles válidos para la variable de sesión app.role. */
export type RolSesion = 'PROFESSIONAL' | 'CLIENT' | 'MODERADOR' | 'ADMIN' | 'system'

/**
 * Establece las variables de sesión de RLS dentro de una transacción Prisma.
 *
 * Debe llamarse al inicio de cada transacción que toca tablas con RLS.
 * `local: true` hace que el valor solo dure dentro de la transacción actual.
 *
 * @param tx Cliente Prisma dentro de una transacción ($transaction).
 * @param userId ID del usuario, o null para operaciones del sistema.
 * @param role Rol del usuario en la sesión.
 */
export async function setearVariablesSesion(
  tx: Prisma.TransactionClient,
  userId: string | null,
  role: RolSesion,
): Promise<void> {
  await tx.$queryRawUnsafe(
    `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`,
    [userId ?? '', role],
  )
}

/**
 * Ejecuta una función dentro de una transacción con variables de sesión de
 * usuario autenticado. Las políticas de RLS filtran las filas según el userId
 * y el rol.
 *
 * @param userId ID del usuario que ejecuta la acción.
 * @param role Rol del usuario.
 * @param fn Función que recibe un cliente Prisma dentro de la transacción.
 */
export async function withUser<T>(
  userId: string,
  role: Exclude<RolSesion, 'system'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setearVariablesSesion(tx, userId, role)
    return fn(tx)
  })
}

/**
 * Ejecuta una función dentro de una transacción con rol de sistema.
 * Se usa para webhooks y jobs del cron, que no actúan en nombre de un
 * usuario concreto. Las políticas de RLS para rol 'system' permiten acceso
 * completo a tablas necesarias (ver policies.sql).
 *
 * @param fn Función que recibe un cliente Prisma dentro de la transacción.
 */
export async function withSystem<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setearVariablesSesion(tx, null, 'system')
    return fn(tx)
  })
}

/**
 * Verifica que las variables de sesión de RLS estén seteadas dentro de una
 * transacción. Útil como defensa en profundidad en servicios que asumen que
 * RLS está activo.
 *
 * Lanza un error si app.user_id o app.role no están definidas.
 */
export async function requerirVariablesSesion(tx: Prisma.TransactionClient): Promise<void> {
  const resultado = await tx.$queryRaw<Array<{ [key: string]: string }>>`
    SELECT
      current_setting('app.user_id', true) AS user_id,
      current_setting('app.role', true) AS role
  `

  const fila = resultado[0]

  if (
    !fila ||
    fila.user_id === undefined ||
    fila.role === undefined
  ) {
    throw new Error('Variables de sesión de RLS no configuradas en esta transacción.')
  }
}
