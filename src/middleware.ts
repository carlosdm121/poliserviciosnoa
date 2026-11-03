import { UserRole } from '@prisma/client'
import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

import { headersSeguridad, generarNonce } from '@/lib/security-headers'

/**
 * Middleware de autorización por rol y headers de seguridad.
 *
 * 1. Headers de seguridad en TODA respuesta (CSP con nonce, HSTS, COOP, CORP, etc.).
 * 2. Autorización por rol en /panel, /admin, /mis-contactos.
 *
 * Los headers de seguridad se aplican primero: incluso si la autorización
 * redirige, el navegador recibe las cabeceras de protección.
 */

const NONCE_HEADER = 'x-csp-nonce'

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Nonce criptográfico por request para la CSP.
  const nonce = generarNonce()

  // Respuesta base: headers de seguridad en toda respuesta.
  const respuesta = NextResponse.next()

  // Nonce criptográfico por request para la CSP.
  respuesta.headers.set(NONCE_HEADER, nonce)

  // Aplicar headers de seguridad.
  const headers = headersSeguridad(request, nonce)
  for (const [clave, valor] of Object.entries(headers)) {
    respuesta.headers.set(clave, valor)
  }

  // Determina el prefijo protegido que aplica a esta ruta.
  const ROLES_POR_RUTA: Record<string, readonly UserRole[]> = {
    panel: [UserRole.PROFESSIONAL],
    admin: [UserRole.ADMIN, UserRole.MODERADOR],
    'mis-contactos': [UserRole.CLIENT],
  }

  const prefijo = (Object.keys(ROLES_POR_RUTA) as (keyof typeof ROLES_POR_RUTA)[]).find(
    (clave) =>
      pathname === `/${clave}` || pathname.startsWith(`/${clave}/`),
  )

  // Ruta pública: dejar pasar con los headers de seguridad ya puestos.
  if (!prefijo) return respuesta

  const rolesPermitidos = ROLES_POR_RUTA[prefijo] ?? []
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // Sin sesión: mandar al login guardando a dónde quería ir.
  if (!token) {
    const urlLogin = new URL('/login', request.url)
    urlLogin.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(urlLogin)
  }

  const rolActual = token.role as UserRole | undefined

  // Con sesión pero del rol equivocado.
  if (!rolActual || !rolesPermitidos.includes(rolActual)) {
    return NextResponse.redirect(new URL('/no-autorizado', request.url))
  }

  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}

