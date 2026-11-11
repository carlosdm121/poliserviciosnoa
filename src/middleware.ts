import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

import { headersSeguridad, generarNonce } from '@/lib/security-headers'
import { rateLimit } from '@/lib/ratelimit'
import { ipHasheada } from '@/lib/peticion'

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

/** Extrae la IP real del request, considerando X-Forwarded-For y X-Real-IP. */
async function ipDelRequest(request: NextRequest): Promise<string | undefined> {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  )
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Nonce criptográfico por request para la CSP.
  const nonce = generarNonce()

  // Respuesta base: headers de seguridad en toda respuesta.
  const respuesta = NextResponse.next()

  // Nonce criptográfico por request para la CSP.
  respuesta.headers.set(NONCE_HEADER, nonce)

  // Rate limiting del envío de credenciales.
  //
  // Solo cuenta el POST que valida la contraseña. Contar los GET de /login
  // dejaba a cualquier visitante con un 429 crudo después de cinco visitas a
  // la página, y no protegía nada porque el endpoint real quedaba fuera del
  // matcher.
  if (
    pathname === '/api/auth/callback/credentials' &&
    request.method === 'POST'
  ) {
    const ip = await ipDelRequest(request)
    const ipHash = ip ? await ipHasheada(ip) : 'desconocida'

    const limiteResultado = await rateLimit(`auth:ip:${ipHash}`, 5, 300) // 5 intentos por 5 minutos

    if (limiteResultado.limitado) {
      // `next-auth/react` espera un `url` en la respuesta para no romperse al
      // parsearla; el error viaja en el query como cualquier error de login.
      return new NextResponse(
        JSON.stringify({
          error: 'Demasiados intentos. Probá más tarde.',
          url: new URL('/login?error=RateLimit', request.url).toString(),
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Aplicar headers de seguridad.
  const headers = headersSeguridad(request, nonce)
  for (const [clave, valor] of Object.entries(headers)) {
    respuesta.headers.set(clave, valor)
  }

  // Determina el prefijo protegido que aplica a esta ruta.
  const ROLES_POR_RUTA: Record<string, readonly string[]> = {
    panel: ['PROFESSIONAL', 'CLIENT'],
    admin: ['ADMIN', 'MODERADOR'],
    'mis-contactos': ['CLIENT'],
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

  const rolActual = token.role as string | undefined

  // Con sesión pero del rol equivocado.
  if (!rolActual || !rolesPermitidos.includes(rolActual)) {
    return NextResponse.redirect(new URL('/no-autorizado', request.url))
  }

  return respuesta
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
    '/api/auth/callback/credentials',
  ],
}

