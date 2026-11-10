import { PrismaClient } from '@prisma/client'

import { logger } from '@/lib/logger'

/**
 * Instancia única de Prisma con pooling y listeners de error.
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
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, { emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'error' }],
    errorFormat: 'pretty',
    transactionOptions: {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel: 'Serializable',
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma

  // Utilizar any para bypassear el error de tipos con los listeners de Prisma
  ;(prisma.$on as any)('error', (e: any) => {
    logger.error('Prisma error', { error: e })
  })

  ;(prisma.$on as any)('query', (e: any) => {
    logger.debug('Prisma query', { query: e.query, duration: e.duration })
  })
}
