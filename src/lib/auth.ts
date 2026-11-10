import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { UserRole, type User } from '@prisma/client'
import type { Adapter, AdapterUser } from 'next-auth/adapters'
import type { DefaultSession, DefaultUser, Session } from 'next-auth'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { verificarPassword } from '@/lib/password'
import { emailSchema } from '@/schemas/contacto'

/**
 * Hash señuelo para igualar tiempos de respuesta.
 *
 * Se compara contra él cuando el usuario no existe, para que el tiempo de
 * respuesta sea el mismo que con un usuario real. Sin esto, un atacante mide
 * la diferencia y sabe qué emails están registrados antes de probarlos.
 *
 * No corresponde a ninguna contraseña: es un bcrypt de una cadena aleatoria.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

/**
 * Configuración de Auth.js (NextAuth v4).
 *
 * Tres roles: PROFESSIONAL, CLIENT y ADMIN.
 *
 * El rol viaja en el token de sesión, no en la base, para que `getServerSession`
 * no tenga que consultar la base en cada request. La caché de la sesión es lo
 * que hace viable esto en Vercel, donde cada función sin caché cuenta como
 * invocación.
 *
 * La consecuencia —que el rol cambie tarde si se edita en la base— es aceptable
 * acá: cambiar el rol de alguien es una acción de admin puntual y además hay
 * una segunda verificación en el servidor para las rutas sensibles.
 */

/** Suma de NextAuth a los tipos de User y Session. */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      sessionVersion: number
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: UserRole
    sessionVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    sessionVersion: number
  }
}

/**
 * Google solo se registra si hay credenciales.
 *
 * En desarrollo se trabaja sin Google configurado. Si el provider se registra
 * con strings vacíos, NextAuth expone un botón de Google que falla al
 * tocarlo, que es peor que no mostrarlo.
 */
const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Email y contraseña',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Contraseña', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) return null

      const emailParseado = emailSchema.safeParse(credentials.email)
      if (!emailParseado.success) return null

      const usuario = await prisma.user.findUnique({
        where: { email: emailParseado.data },
      })

      // Mismo mensaje para "no existe" y "contraseña incorrecta": si son
      // distintos, el formulario sirve para enumerar qué emails están
      // registrados.
      if (!usuario) {
        await verificarPassword(credentials.password, DUMMY_HASH)
        return null
      }

      if (!usuario.passwordHash) return null

      const passwordValida = await verificarPassword(credentials.password, usuario.passwordHash)
      if (!passwordValida.valido) return null

      return {
        id: usuario.id,
        email: usuario.email,
        name: usuario.name,
        role: usuario.role,
        sessionVersion: usuario.sessionVersion,
      }
    },
  }),
]

if (env.google.clientId && env.google.clientSecret) {
  providers.push(
    GoogleProvider({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
    }),
  )
}

/**
 * Adaptador de Auth.js.
 *
 * Todo usuario que nace por un proveedor externo es CLIENT. El alta de
 * profesionales no pasa por acá: la hace `registrarProfesional` con el rol
 * fijado en el servidor. Si se dejara el default del schema, un cliente que
 * entra con Google nacería PROFESSIONAL y no podría votar ni usar
 * /mis-contactos.
 */
const adaptadorBase = PrismaAdapter(prisma)
const adaptador: Adapter = {
  ...adaptadorBase,
  async createUser(datos: Omit<AdapterUser, 'id'>) {
    return prisma.user.create({
      data: {
        email: datos.email,
        emailVerified: datos.emailVerified,
        name: datos.name,
        image: datos.image,
        role: 'CLIENT',
      },
    })
  },
}

export const authOptions: NextAuthOptions = {
  adapter: adaptador,
  session: {
    strategy: 'jwt',
    // 30 días: un profesional que entró a configurar su perfil en el celular
    // no debería perder la sesión a mitad de trabajo.
    maxAge: 30 * 24 * 60 * 60,
  },
  cookies: {
    /**
     * Cookies de sesión seguras.
     *
     * - `httpOnly`: JavaScript no puede leer la cookie (previene robo por XSS).
     * - `secure` en producción: solo viaja por HTTPS.
     * - `sameSite: 'lax'`: protege contra CSRF sin romper flujos normales.
     * - `path: '/'`: disponible en toda la aplicación.
     * - Sin `domain`: se restringe al mismo host.
     *
     * NextAuth usa `sessionToken` para el JWT en modo jwt.
     */
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NEXTAUTH_URL?.startsWith('https://') ?? false,
        domain: undefined,
      },
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/login?mensaje=revisá-tu-email',
  },
  providers,
  callbacks: {
    /**
     * Copia id y role al token.
     *
     * El token no admite campos arbitrarios sin declararlos, por eso el
     * módulo `next-auth/jwt` está augmentationado arriba.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.sessionVersion = user.sessionVersion ?? 0
      }
      return token
    },

    /**
     * Expone la sesión al cliente y valida la versión de sesión.
     *
     * Si el `sessionVersion` del token no coincide con el de la base (porque
     * se cambió la contraseña, se bloqueó al usuario o se cerraron todas las
     * sesiones), se invalida la sesión y se devuelve null: el cliente tiene
     * que volver a autenticarse.
     *
     * Lo que NO va acá: whatsapp, CUIT, ni nada del perfil. La sesión del
     * cliente es legible por JavaScript y viaja en cada request.
     */
    async session({ session, token }) {
      if (session.user && token) {
        const usuario = await prisma.user.findUnique({
          where: { id: token.id },
          select: { sessionVersion: true },
        })

        if (
          !usuario ||
          usuario.sessionVersion !== (token.sessionVersion as number)
        ) {
          return null as unknown as Session
        }

        session.user.id = token.id
        session.user.role = token.role
        session.user.sessionVersion = usuario.sessionVersion
      }
      return session
    },
  },
}

/** Rol del usuario o `null` si no hay sesión. */
export async function obtenerRolActual(): Promise<UserRole | null> {
  const { getServerSession } = await import('next-auth')
  const session = await getServerSession(authOptions)
  return session?.user.role ?? null
}

/** Usuario autenticado, o `null`. */
export async function obtenerUsuarioActual(): Promise<User | null> {
  const { getServerSession } = await import('next-auth')
  const session = await getServerSession(authOptions)
  if (!session?.user.email) return null

  return prisma.user.findUnique({ where: { email: session.user.email } })
}