import { PrismaClient } from '@prisma/client'

/**
 * Instancia única de Prisma.
 *
 * En desarrollo, Next.js recarga los módulos en cada cambio de archivo y
 * abriría una conexión nueva a la base en cada recarga: con el pool por
 * defecto de Postgres eso agota las conexiones en minutos. Guardar el cliente
 * en `globalThis` evita el problema.
 *
 * En producción hay una sola instancia porque el módulo se carga una vez.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}