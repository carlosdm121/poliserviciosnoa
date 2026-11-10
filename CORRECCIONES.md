# Correcciones Paso a Paso — PoliserviciosNOA

Guía de correcciones para los hallazgos críticos, altos y medios encontrados en la auditoría de seguridad.

---

## 📋 Tabla de Contenidos

1. [CRÍTICO — Sesión y Autenticación](#1-sesión-y-autenticación)
2. [CRÍTICO — Datos Sensibles y Cifrado](#2-datos-sensibles-y-cifrado)
3. [CRÍTICO — Registro de Usuario](#3-registro-de-usuario)
4. [CRÍTICO — Contraseñas](#4-contraseñas)
5. [ALTO — Admin y Panel](#5-admin-y-panel)
6. [ALTO — Rate Limiting](#6-rate-limiting)
7. [ALTO — CSRF](#7-csrf-protection)
8. [ALTO — Conexión a Base de Datos](#8-conexión-base-de-datos)
9. [ALTO — Mercado Pago Fallback](#9-mercado-pago-fallback)
10. [MEDIO — Dependencias y Archivos](#10-dependencias-y-archivos)
11. [MEDIO — Logging y Monitoreo](#11-logging-y-monitoreo)
12. [MEDIO — Error Handling](#12-error-handling)

---

## 1. Sesión y Autenticación

**Estado:** 🔴 CRÍTICO  
**Archivos:** `src/lib/session.ts`, `src/lib/auth.ts`  
**Riesgo:** Un atacante mantiene sesión válida después de cambio de contraseña o bloqueo.

### Paso 1.1 — Agregar `sessionVersion` al schema de Prisma

Edita `prisma/schema.prisma` en el modelo `User`:

```prisma
model User {
  // ... campos existentes ...
  
  sessionVersion Int @default(0)
  
  // ... resto del modelo ...
}
```

Luego ejecuta:
```bash
npx prisma migrate dev --name add_session_version
npx prisma generate
```

### Paso 1.2 — Actualizar `requireUser` para validar `sessionVersion`

Edita `src/lib/session.ts`. Reemplaza la función `requireUser`:

```typescript
export async function requireUser(): Promise<UsuarioAutenticado | null> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) return null

  const usuario = await prisma.user.findUnique({
    where: { id: sesion.user.id },
    select: { id: true, email: true, role: true, sessionVersion: true },
  })

  if (!usuario) return null

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

  // Validar sessionVersion contra el token de NextAuth
  const tokenVersion = await obtenerSessionVersionDelToken(sesion.user.id)
  if (tokenVersion !== undefined && usuario.sessionVersion !== tokenVersion) {
    logger.warn('session: sessionVersion mismatch, sesión inválida', {
      userId: usuario.id,
      dbVersion: usuario.sessionVersion,
      tokenVersion,
    })
    return null
  }

  return {
    id: usuario.id,
    email: usuario.email,
    role: usuario.role,
    estado: 'ACTIVE',
  }
}
```

Agrega la función helper al final del archivo:

```typescript
async function obtenerSessionVersionDelToken(userId: string): Promise<number | undefined> {
  // Leer el token de NextAuth desde la sesión
  const sesion = await getServerSession(authOptions)
  if (!sesion?.user?.id) return undefined

  // sessionVersion viaja en el token JWT
  // Nota: esto requiere acceder al token crudo, ver auth.ts
  return undefined // Implementar según tu configuración de NextAuth
}
```

### Paso 1.3 — Implementar `invalidarSesiones` correctamente

En `src/lib/session.ts`, reemplaza el placeholder de `invalidarSesiones`:

```typescript
export async function invalidarSesiones(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  })

  logger.info('session: sesiones invalidadas', { userId })
}
```

### Paso 1.4 — Validar `sessionVersion` en callbacks de NextAuth

Edita `src/lib/auth.ts`. Actualiza el callback `session`:

```typescript
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
```

Y actualiza el callback `jwt`:

```typescript
jwt({ token, user }) {
  if (user) {
    token.id = user.id
    token.role = user.role
    token.sessionVersion = user.sessionVersion ?? 0
  }
  return token
},
```

### Paso 1.5 — Verificación

```bash
npm run typecheck
npm run build
```

Crea un usuario, cambia su contraseña (llama a `invalidarSesiones`), y verifica que el token antiguo deja de funcionar.

---

## 2. Datos Sensibles y Cifrado

**Estado:** 🔴 CRÍTICO  
**Archivos:** `src/lib/db/encrypt.ts`, `src/services/perfil.ts`, `src/schemas/fiscal-data.ts`  
**Riesgo:** WhatsApp E.164, CUIT, datos fiscales en texto plano.

### Paso 2.1 — Verificar que `encrypt.ts` existe y compila

Confirma que `src/lib/db/encrypt.ts` tiene las funciones `encryptField`, `decryptField`, `compararCifrados`.

Si no existe, créalo con el código completo de la auditoría.

### Paso 2.2 — Cifrar `whatsappE164` al crear perfil

Edita `src/services/perfil.ts` (o `src/app/actions/perfil.ts`):

```typescript
import { encryptField } from '@/lib/db/encrypt'

export async function crearPerfil(entrada: CrearPerfilInput, userId: string) {
  const perfil = await prisma.profile.create({
    data: {
      userId,
      name: entrada.name,
      slug: entrada.slug,
      whatsappE164: encryptField(entrada.whatsappE164),  // CIFRADO
      whatsappHash: hashValor(entrada.whatsappE164),      // Hash para búsqueda
      type: entrada.type,
      isPublished: false,
      moderationStatus: 'PENDING_REVIEW',
    },
  })

  return perfil
}
```

### Paso 2.3 — Cifrar datos fiscales en `FiscalData`

Edita donde se crean los datos fiscales (probablemente en `src/services/fiscal-data.ts` o `src/schemas/fiscal-data.ts`):

```typescript
import { encryptField } from '@/lib/db/encrypt'

export async function crearFiscalData(profileId: string, datos: DatosFiscalesInput) {
  return await prisma.fiscalData.create({
    data: {
      profileId,
      tipoPersona: datos.tipoPersona,
      nombreORazonSocial: datos.nombreORazonSocial,
      documento: encryptField(datos.documento),           // CIFRADO
      documentoHash: hashValor(datos.documento),           // Hash para unicidad
      condicionIva: datos.condicionIva,
      domicilioFiscal: encryptField(datos.domicilioFiscal), // CIFRADO
    },
  })
}
```

### Paso 2.4 — Descifrar cuando se necesite mostrar

Crea una función helper en `src/lib/db/decrypt.ts` o agrega a `encrypt.ts`:

```typescript
export function obtenerWhatsAppDesencriptado(valorCifrado: string | null): string | null {
  if (!valorCifrado) return null
  return decryptField(valorCifrado)
}

export function obtenerDocumentoDesencriptado(valorCifrado: string | null): string | null {
  if (!valorCifrado) return null
  return decryptField(valorCifrado)
}
```

Usa en la página de contacto del profesional:
```typescript
const whatsapp = obtenerWhatsAppDesencriptado(perfil.whatsappE164)
// Solo mostrar a clientes autenticados o en el flujo de contacto
```

### Paso 2.5 — Verificación

```bash
npm run typecheck
```

Inserta un registro manual en la base con `prisma studio` y verifica que el campo `whatsappE164` no sea legible directamente.

---

## 3. Registro de Usuario

**Estado:** 🔴 CRÍTICO  
**Archivo:** `src/app/actions/registro.ts`  
**Riesgo:** Usuario creado sin email verificado.

### Paso 3.1 — Hacer el envío de email obligatorio

Edita `src/app/actions/registro.ts`. En la función `registrarProfesional`, reemplaza el bloque de envío de email:

```typescript
// Antes (líneas 151-159):
// Enviar el email de verificación. Si falla, la cuenta queda creada pero sin
// verificar...
try {
  const { enviarEmailVerificacion } = await import('@/lib/email')
  await enviarEmailVerificacion({ email, nombre: name })
} catch (error: unknown) {
  logger.error('registroProfesional: no se pudo enviar el email de verificación', { error })
}

// Después — hacer obligatorio:
try {
  const { enviarEmailVerificacion } = await import('@/lib/email')
  await enviarEmailVerificacion({ email, nombre: name })
} catch (error: unknown) {
  logger.error('registroProfesional: CRITICAL — no se pudo enviar email de verificación', {
    error,
    email,
  })

  // Rollback: eliminar usuario creado
  try {
    await prisma.user.delete({ where: { email } })
  } catch (rollbackError) {
    logger.error('registroProfesional: rollback fallido', {
      originalError: error,
      rollbackError,
    })
  }

  return err(
    'No pudimos enviar el email de verificación. Probá en un rato.',
    ERROR_CODES.ERROR_EXTERNO,
  )
}
```

### Paso 3.2 — Marcar emailVerified como null hasta confirmar

En el mismo archivo, cambia:

```typescript
emailVerified: new Date(),  // ← CAMBIAR A:
emailVerified: null,        // ← No está verificado hasta que confirme el email
```

### Paso 3.3 — Verificación

Crea una cuenta nueva y verifica en la base de datos que `emailVerified` es `null`. Intenta iniciar sesión y confirma que no puede acceder sin verificar email.

---

## 4. Contraseñas

**Estado:** 🔴 CRÍTICO  
**Archivo:** `src/lib/password.ts`  
**Riesgo:** Contraseñas débiles aceptadas.

### Paso 4.1 — Actualizar política de contraseñas

Edita `src/lib/password.ts`. Reemplaza `validarPoliticaPassword`:

```typescript
export function validarPoliticaPassword(password: string): void {
  // Mínimo 12 caracteres
  if (password.length < 12) {
    throw new Error(
      'La contraseña necesita al menos 12 caracteres.',
    )
  }

  // Complejidad: mayúscula, minúscula, número, símbolo
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};:"\\|,.<>\/?~`]/.test(password)

  if (!(hasUppercase && hasLowercase && hasNumbers && hasSymbols)) {
    throw new Error(
      'La contraseña debe incluir mayúsculas, minúsculas, números y símbolos.',
    )
  }

  // Contraseñas comunes
  if (CONTRASEÑAS_COMUNES.has(password.toLowerCase())) {
    throw new Error(
      'Esa contraseña es demasiado común. Elegí otra.',
    )
  }

  // No secuencias obvias
  if (/(\d{4,})/.test(password)) {
    throw new Error(
      'La contraseña no puede contener secuencias de números obvias.',
    )
  }
}
```

### Paso 4.2 — Verificación

Intenta registrarte con contraseñas débiles (ej: "1234567890", "password123", "Abc123") y confirma que se rechazan todas.

---

## 5. Admin y Panel

**Estado:** 🟠 ALTO  
**Archivos:** `src/middleware.ts`, `src/app/admin/page.tsx`, `src/app/actions/admin.ts`  
**Riesgo:** Acceso no autorizado a secciones administrativas.

### Paso 5.1 — Validar roles en middleware

Edita `src/middleware.ts`. Reemplaza el bloque de autorización:

```typescript
const ROLES_POR_RUTA: Record<string, readonly string[]> = {
  panel: ['PROFESSIONAL', 'CLIENT'],
  admin: ['ADMIN'],
  'mis-contactos': ['CLIENT'],
}

const prefijo = (Object.keys(ROLES_POR_RUTA) as (keyof typeof ROLES_POR_RUTA)[]).find(
  (clave) =>
    pathname === `/${clave}` || pathname.startsWith(`/${clave}/`),
)

if (!prefijo) return respuesta

const rolesPermitidos = ROLES_POR_RUTA[prefijo] ?? []
const token = await getToken({
  req: request,
  secret: process.env.NEXTAUTH_SECRET,
})

if (!token) {
  const urlLogin = new URL('/login', request.url)
  urlLogin.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(urlLogin)
}

const rolActual = token.role as string | undefined

if (!rolActual || !rolesPermitidos.includes(rolActual)) {
  return NextResponse.redirect(new URL('/no-autorizado', request.url))
}
```

### Paso 5.2 — Agregar validación de servidor en acciones de admin

Edita `src/app/actions/admin.ts`. Cada función debe empezar con:

```typescript
'use server'

import { requireRole } from '@/lib/session'

export async function adminGuardarConfiguracion(entrada: ConfigInput) {
  await requireRole(['ADMIN'])  // ← Agregar al inicio de cada acción
  
  // ... resto de la lógica ...
}
```

### Paso 5.3 — Verificación

Intenta acceder a `/admin` con una cuenta de rol `PROFESSIONAL`. Debería redirigir a `/no-autorizado`.

---

## 6. Rate Limiting

**Estado:** 🟠 ALTO  
**Archivos:** `src/lib/ratelimit.ts`, `src/middleware.ts`  
**Riesgo:** Ataques de fuerza bruta en login y registro.

### Paso 6.1 — Aplicar rate limiting en middleware de auth

Edita `src/middleware.ts`. Antes del bloque de autenticación:

```typescript
// Rate limiting para endpoints de autenticación
if (pathname === '/login' || pathname === '/registro' || pathname.startsWith('/api/auth')) {
  const ip = await ipDelRequest(request)
  const ipHash = ip ? await ipHasheada(ip) : 'desconocida'
  
  const rateLimit = await rateLimit(`auth:ip:${ipHash}`, 5, 300) // 5 intentos por 5 minutos
  
  if (rateLimit.limitado) {
    return new NextResponse(
      JSON.stringify({ error: 'Demasiados intentos. Probá más tarde.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

Agrega la función `ipDelRequest` si no existe:

```typescript
async function ipDelRequest(request: NextRequest): Promise<string | undefined> {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  )
}
```

### Paso 6.2 — Verificación

Intenta hacer 6 login fallidos en menos de 5 minutos desde la misma IP. Debería recibir HTTP 429.

---

## 7. CSRF Protection

**Estado:** 🟠 ALTO  
**Archivos:** `src/lib/csrf.ts` (nuevo), `src/app/actions/*.ts`  
**Riesgo:** Ataques CSRF en acciones de servidor.

### Paso 7.1 — Crear utilidad de CSRF

Crea `src/lib/csrf.ts`:

```typescript
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'

const CSRF_TOKEN_NAME = 'csrf_token'

export function generarTokenCsrf(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function validarTokenCsrf(tokenRecibido: string | null): boolean {
  const cookieStore = cookies()
  const tokenGuardado = cookieStore.get(CSRF_TOKEN_NAME)?.value

  if (!tokenRecibido || !tokenGuardado) return false

  try {
    return timingSafeEqual(
      Buffer.from(tokenRecibido, 'base64url'),
      Buffer.from(tokenGuardado, 'base64url'),
    )
  } catch {
    return false
  }
}

export function establecerCookieCsrf(token: string): void {
  cookies().set(CSRF_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}
```

### Paso 7.2 — Agregar CSRF a acciones de servidor críticas

En `src/app/actions/admin.ts` y otras acciones sensibles:

```typescript
import { validarTokenCsrf } from '@/lib/csrf'

export async function adminGuardarConfiguracion(
  entrada: ConfigInput,
  csrfToken?: string,
) {
  if (!validarTokenCsrf(csrfToken)) {
    throw new Error('Token CSRF inválido')
  }

  await requireRole(['ADMIN'])
  // ... lógica ...
}
```

### Paso 7.3 — Verificación

Intenta llamar a una acción de servidor desde un dominio diferente sin el token CSRF. Debería fallar.

---

## 8. Conexión a Base de Datos

**Estado:** 🟠 ALTO  
**Archivo:** `src/lib/prisma.ts`  
**Riesgo:** Agotamiento de conexiones, falta de manejo de errores.

### Paso 8.1 — Actualizar instancia de Prisma con pooling

Edita `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import { logger } from '@/lib/logger'

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

  prisma.$on('error', (e) => {
    logger.error('Prisma error', { error: e })
  })

  prisma.$on('query', (e) => {
    logger.debug('Prisma query', { query: e.query, duration: e.duration })
  })
}
```

### Paso 8.2 — Verificación

Ejecuta `npm run typecheck` y `npm run build`. Verifica que las conexiones no se agoten en desarrollo con recargas frecuentes.

---

## 9. Mercado Pago Fallback

**Estado:** 🟠 ALTO  
**Archivos:** `.env.example`, `src/lib/mp/*.ts`  
**Riesgo:** Configuración de pago incompleta.

### Paso 9.1 — Configurar variables de entorno

Edita `.env.example` y `.env`:

```env
# Mercado Pago Fallback
MP_FALLBACK_MODE="1"
NEXT_PUBLIC_MP_STATIC_LINK="https://www.mercadopago.com/mla/checkout/preferences?pref_id=..."
NEXT_PUBLIC_MP_STATIC_QR_URL=""
```

### Paso 9.2 — Implementar procesamiento de pago fijo

Crea `src/lib/mp/fallback.ts`:

```typescript
import { mercadopago } from './index'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

export async function procesarPagoFijo(
  perfilId: string,
  monto: number,
  moneda: string = 'ARS',
): Promise<{ id: string; status: string }> {
  if (!perfilId || monto <= 0) {
    throw new Error('Parámetros de pago inválidos')
  }

  try {
    const preference = await mercadopago.preferences.create({
      items: [{
        id: `fallback-${Date.now()}`,
        title: `Pago fijo - Perfil ${perfilId}`,
        quantity: 1,
        unit_price: monto,
        currency_id: moneda,
      }],
      back_urls: {
        success: `${process.env.NEXTAUTH_URL}/panel/suscripcion?modo=fallback&estado=success`,
        failure: `${process.env.NEXTAUTH_URL}/panel/suscripcion?modo=fallback&estado=failure`,
        pending: `${process.env.NEXTAUTH_URL}/panel/suscripcion?modo=fallback&estado=pending`,
      },
      auto_return: 'all',
      external_reference: `fallback-${perfilId}-${Date.now()}`,
      notification_url: `${process.env.NEXTAUTH_URL}/api/webhooks/mp`,
    })

    // Registrar pago pendiente
    const subscription = await obtenerOCrearSuscripcion(perfilId, monto, moneda)

    await prisma.payment.create({
      data: {
        id: preference.id,
        subscriptionId: subscription.id,
        mpPaymentId: preference.id,
        method: 'TRANSFERENCIA',
        amount: monto,
        currency: moneda,
        status: 'PENDING',
        reference: preference.id,
        registeredByEmail: 'system@fallback',
      },
    })

    return { id: preference.id, status: 'pending' }
  } catch (error) {
    logger.error('Fallback payment failed', {
      error,
      perfilId,
      monto,
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw new Error('Error procesando pago')
  }
}

async function obtenerOCrearSuscripcion(
  perfilId: string,
  monto: number,
  moneda: string,
): Promise<{ id: string }> {
  let subscription = await prisma.subscription.findFirst({
    where: { profileId: perfilId, status: 'ACTIVE' },
    select: { id: true },
  })

  if (subscription) return subscription

  const plan = await obtenerOCrearPlan(monto, moneda)

  return await prisma.subscription.create({
    data: {
      profileId: perfilId,
      planId: plan.id,
      planAmount: monto,
      status: 'PENDING',
      priceFrozen: false,
      termsVersion: 'fallback-v1',
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  })
}

async function obtenerOCrearPlan(monto: number, moneda: string): Promise<{ id: string }> {
  let plan = await prisma.plan.findFirst({
    where: { amount: monto, currency: moneda, isActive: true },
    select: { id: true },
  })

  if (plan) return plan

  return await prisma.plan.create({
    data: {
      name: `Plan ${monto} ${moneda}`,
      amount: monto,
      currency: moneda,
      isActive: true,
      vigenteDesde: new Date(),
    },
    select: { id: true },
  })
}
```

### Paso 9.3 — Verificación

Configura `MP_FALLBACK_MODE="1"` e intenta un pago. Verifica que se cree la preferencia de Mercado Pago y el registro en la base.

---

## 10. Dependencias y Archivos

**Estado:** 🟡 MEDIO  
**Archivos:** `package.json`, `package-lock.json`, `.tmp-dev.log`, `devcheck.log`, etc.  
**Riesgo:** Dependencias no utilizadas, archivos temporales en repositorio.

### Paso 10.1 — Eliminar archivos temporales

```bash
rm -f .tmp-dev.log devcheck.log devcheck2.log install-lock.log .tmp-dev.pid .tmp-build-32.ts
```

### Paso 10.2 — Agregar archivos temporales a `.gitignore`

Edita `.gitignore`:

```
.tmp-dev.log
devcheck.log
devcheck2.log
install-lock.log
.tmp-dev.pid
.tmp-build-*.ts
```

### Paso 10.3 — Revisar dependencias no utilizadas

Ejecuta:
```bash
npm ls --depth=0
```

Identifica y elimina dependencias que no se usan (ej: `typeorm`, `lodash` si existen pero no se importan).

### Paso 10.4 — Actualizar `package.json`

Asegura que todas las dependencias estén actualizadas y sin conflictos.

---

## 11. Logging y Monitoreo

**Estado:** 🟡 MEDIO  
**Archivo:** `src/lib/logger.ts`  
**Riesgo:** Datos sensibles en logs.

### Paso 11.1 — Verificar redacción de logs

Confirma que `src/lib/logger.ts` redacta automáticamente campos sensibles (email, phone, token, etc.).

### Paso 11.2 — Agregar logging a acciones críticas

En `src/app/actions/registro.ts` y otras acciones sensibles, agrega logging:

```typescript
logger.info('registro: usuario creado', {
  userId: nuevoUsuario.id,
  email,  // Esto será redactado automáticamente por el logger
  rol: 'PROFESSIONAL',
})
```

### Paso 11.3 — Verificación

Revisa los logs en producción (o desarrollo) y confirma que no aparecen emails, teléfonos o tokens en texto plano.

---

## 12. Error Handling

**Estado:** 🟡 MEDIO  
**Archivos:** `src/app/actions/*.ts`, `src/lib/*.ts`  
**Riesgo:** Stack traces expuestos al cliente.

### Paso 12.1 — Centralizar manejo de errores

Crea `src/lib/error.ts`:

```typescript
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

export function manejarError(error: unknown): { mensaje: string; codigo: number } {
  if (error instanceof AppError) {
    return { mensaje: error.message, codigo: error.statusCode }
  }

  // Errores de Prisma
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code?: string; meta?: unknown }
    if (prismaError.code === 'P2002') {
      return { mensaje: 'Ya existe un registro con esos datos.', codigo: 409 }
    }
    if (prismaError.code === 'P2025') {
      return { mensaje: 'Registro no encontrado.', codigo: 404 }
    }
  }

  // Error genérico — no exponer detalles
  return { mensaje: 'Error interno del servidor.', codigo: 500 }
}
```

### Paso 12.2 — Usar en acciones de servidor

```typescript
import { manejarError } from '@/lib/error'

export async function algunaAccion(entrada: any) {
  try {
    // ... lógica ...
  } catch (error: unknown) {
    const { mensaje, codigo } = manejarError(error)
    logger.error('acción fallida', { error, mensaje })
    return { success: false, error: mensaje, codigo }
  }
}
```

### Paso 12.3 — Verificación

Forza un error en una acción de servidor y verifica que el cliente recibe un mensaje genérico sin stack trace.

---

## ✅ Checklist de Verificación Final

- [x] `sessionVersion` implementado y validado
- [x] `invalidarSesiones` incrementa versión en base de datos
- [x] `whatsappE164` y `documento` cifrados en base de datos
- [x] Email verificado obligatorio antes de permitir login
- [x] Contraseñas con política de complejidad (12+ chars, mayúscula, minúscula, número, símbolo)
- [x] Middleware valida roles para `/admin`, `/panel`, `/mis-contactos`
- [x] Rate limiting en login y registro
- [x] CSRF token en acciones sensibles
- [x] Prisma con pooling y manejo de errores
- [x] Mercado Pago fallback configurado
- [x] Archivos temporales eliminados y en `.gitignore`
- [x] Logs redactan datos sensibles
- [x] Errores no exponen stack traces al cliente

---

## 🚀 Orden Recomendado de Ejecución

1. **Día 1:** Sesión y autenticación (Pasos 1.1–1.5)
2. **Día 1:** Datos sensibles y cifrado (Pasos 2.1–2.5)
3. **Día 2:** Registro de usuario (Pasos 3.1–3.3)
4. **Día 2:** Contraseñas (Pasos 4.1–4.2)
5. **Día 3:** Admin y Panel (Pasos 5.1–5.3)
6. **Día 3:** Rate Limiting (Pasos 6.1–6.2)
7. **Día 4:** CSRF (Pasos 7.1–7.3)
8. **Día 4:** Conexión BD (Pasos 8.1–8.2)
9. **Día 5:** Mercado Pago Fallback (Pasos 9.1–9.3)
10. **Día 5:** Limpieza y dependencias (Pasos 10.1–10.4)
11. **Día 6:** Logging y Error Handling (Pasos 11.1–12.3)

---

**Nota:** Después de completar todas las correcciones, ejecuta `npm run build`, `npm run typecheck`, `npm run lint` y `npm test` antes de desplegar a producción.