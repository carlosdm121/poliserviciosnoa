import NextAuth from 'next-auth'

import { authOptions } from '@/lib/auth'

/**
 * Handler de Auth.js.
 *
 * Se exporta en un archivo separado y no desde `src/lib/auth.ts` porque el
 * Middleware corre en el Edge Runtime y no puede importar nada que use APIs
 * de Node (bcrypt, Prisma). Separar los dos garantiza que nadie arrastre por
 * accidente una dependencia nativa a un archivo que el Edge tiene que cargar.
 */
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }