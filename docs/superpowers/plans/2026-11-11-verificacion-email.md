# Verificación de email — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. OpenCode v2 no tiene herramienta de tareas: los checkboxes de este archivo son la lista.

**Goal:** Que un profesional que se registra solo pueda verificar su email y cumplir el requisito de publicación (D4), con un enlace real, un token de un solo uso efectivo y un reenvío que no revele qué cuentas existen.

**Architecture:** Se reutiliza el modelo `VerificationToken` que ya está en el schema (`identifier` = email, `token` = SHA-256 del token en claro, `expires`). No hay cambio de schema. La lógica vive en `src/lib/verificacion-email.ts`; la página `/verificar-email` valida y escribe `User.emailVerified`; `/reenviar-verificacion` usa una Server Action con rate limit; el cron diario borra los tokens vencidos.

**Tech Stack:** Next.js 15 (App Router, Server Components, Server Actions), TypeScript, Prisma 6, Zod, Vitest, Resend, Upstash Redis (rate limit).

**Spec:** `docs/superpowers/specs/2026-11-11-verificacion-email-design.md`

**Review Focus:** (1) no hay cambio de schema ni `db push`; (2) el token nunca se guarda ni se loguea en claro; (3) abrir el enlace dos veces es idempotente; (4) el reenvío no enumera cuentas; (5) no se toca el login ni Google; (6) los mensajes están en español rioplatense con voseo.

## Global Constraints

- **No tocar `prisma/schema.prisma`.** `VerificationToken` ya existe. Nada de `prisma db push` ni migraciones.
- **No deployar, no pushear y no escribir en la base de producción sin confirmación explícita del usuario.** Los commits locales están bien; el push a `main` dispara Vercel.
- **El token en claro solo viaja en el enlace del email.** En la base se guarda el SHA-256. Nunca se pasa al logger.
- **No tocar** `src/lib/auth.ts`, `src/middleware.ts`, el login, Google OAuth ni `src/lib/recovery-token.ts`.
- **Mensajes** en español rioplatense, con voseo, como el resto del proyecto.
- **Una sola versión de la acción de reenvío:** se borra `reenviarEmailVerificacion` de `src/app/actions/registro.ts`.
- **Comandos de verificación:** `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`.
- **Node >= 20.19.** Vitest ya define `NEXTAUTH_URL=http://localhost:3000` en `vitest.config.ts`; los tests no leen `.env`.
- **Commit por tarea**, mensaje convencional en imperativo y sin acentos en el asunto (estilo del repo).

---

## Task 1: Lógica pura de tokens + tests

**Files:**
- Create: `src/lib/verificacion-email.ts`
- Test: `tests/verificacion-email.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/verificacion-email.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  TOKEN_VIDA_SEGUNDOS,
  armarUrlVerificacion,
  fechaExpiracionToken,
  generarTokenVerificacion,
  hashearTokenVerificacion,
} from '@/lib/verificacion-email'

describe('generarTokenVerificacion', () => {
  it('genera 32 bytes en base64url', () => {
    // 32 bytes en base64 son 44 caracteres con padding; base64url lo saca.
    expect(generarTokenVerificacion()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('no repite tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generarTokenVerificacion))

    expect(tokens.size).toBe(200)
  })
})

describe('hashearTokenVerificacion', () => {
  it('es estable y devuelve 64 caracteres hexadecimales', () => {
    const token = 'token-de-prueba'

    expect(hashearTokenVerificacion(token)).toBe(hashearTokenVerificacion(token))
    expect(hashearTokenVerificacion(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('no devuelve el token en claro', () => {
    const token = generarTokenVerificacion()

    expect(hashearTokenVerificacion(token)).not.toBe(token)
  })

  it('distingue tokens distintos', () => {
    expect(hashearTokenVerificacion('token-a')).not.toBe(hashearTokenVerificacion('token-b'))
  })
})

describe('fechaExpiracionToken', () => {
  it('vence a las 24 horas', () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const vence = fechaExpiracionToken(ahora)

    expect(TOKEN_VIDA_SEGUNDOS).toBe(24 * 60 * 60)
    expect(vence.getTime() - ahora.getTime()).toBe(TOKEN_VIDA_SEGUNDOS * 1000)
  })
})

describe('armarUrlVerificacion', () => {
  it('arma el enlace con NEXTAUTH_URL y el token codificado', () => {
    expect(armarUrlVerificacion('abc-_123')).toBe(
      'http://localhost:3000/verificar-email?token=abc-_123',
    )
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run tests/verificacion-email.test.ts
```

Esperado: falla porque `@/lib/verificacion-email` no existe (`Cannot find module` o `Failed to resolve import`). No seguir hasta ver ese error.

- [ ] **Step 3: Implementar la lógica**

Crear `src/lib/verificacion-email.ts`:

```ts
/**
 * Verificación de email del alta autoservicio.
 *
 * Reutiliza el modelo `VerificationToken` de Auth.js: `identifier` es el email
 * normalizado y `token` es el SHA-256 del token en claro. El token en claro
 * solo viaja en el enlace del email; nunca se guarda.
 *
 * El token vive 24 h. Al verificar, `User.emailVerified` queda con fecha. El
 * token usado no se borra: así abrir el enlace dos veces responde "ya estaba
 * verificado" en lugar de "enlace inválido". El job de limpieza lo borra
 * cuando vence.
 */

import { createHash, randomBytes } from 'node:crypto'

import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

/** Vida del token: 24 horas. */
export const TOKEN_VIDA_SEGUNDOS = 24 * 60 * 60

/** Longitud del token aleatorio en bytes. */
const TOKEN_LONGITUD_BYTES = 32

/** Resultado de abrir un enlace de verificación. */
export type EstadoVerificacion = 'VERIFICADO' | 'YA_VERIFICADO' | 'VENCIDO' | 'INVALIDO'

/** Token aleatorio en base64url: seguro para URL, sin `+`, `/` ni `=`. */
export function generarTokenVerificacion(): string {
  return randomBytes(TOKEN_LONGITUD_BYTES).toString('base64url')
}

/**
 * SHA-256 del token.
 *
 * Alcanza porque el token tiene 256 bits de entropía y el atacante no puede
 * elegir el preimage. Si se filtra la base, el hash no sirve para verificar.
 */
export function hashearTokenVerificacion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Fecha de vencimiento, separada para poder probarla sin base. */
export function fechaExpiracionToken(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() + TOKEN_VIDA_SEGUNDOS * 1000)
}

/** Enlace que recibe el usuario por email. */
export function armarUrlVerificacion(token: string): string {
  return `${env.NEXTAUTH_URL}/verificar-email?token=${encodeURIComponent(token)}`
}

/**
 * Crea un token para el email y borra los anteriores.
 *
 * Un solo enlace válido a la vez: si el usuario pide reenvío, el email viejo
 * deja de servir.
 */
export async function crearTokenVerificacion(email: string): Promise<string> {
  const identifier = email.trim().toLowerCase()
  const token = generarTokenVerificacion()

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: hashearTokenVerificacion(token),
        expires: fechaExpiracionToken(),
      },
    }),
  ])

  return token
}

/**
 * Valida el token y marca el email como verificado.
 *
 * Es idempotente: si el email ya estaba verificado devuelve `YA_VERIFICADO`
 * sin tocar nada. Un token vencido se borra y devuelve `VENCIDO`.
 */
export async function verificarEmailConToken(token: string): Promise<EstadoVerificacion> {
  if (!token) return 'INVALIDO'

  const tokenHash = hashearTokenVerificacion(token)

  const registro = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  })

  if (!registro) return 'INVALIDO'

  const usuario = await prisma.user.findUnique({
    where: { email: registro.identifier },
    select: { id: true, emailVerified: true },
  })

  if (!usuario) {
    // La cuenta se borró después del alta: el token no sirve para nada.
    await prisma.verificationToken.deleteMany({
      where: { identifier: registro.identifier },
    })
    return 'INVALIDO'
  }

  // Se mira primero si ya estaba verificado: un enlace viejo de una cuenta ya
  // confirmada tiene que decir "ya estaba verificado", no "venció".
  if (usuario.emailVerified) return 'YA_VERIFICADO'

  if (registro.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { token: tokenHash } })
    return 'VENCIDO'
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { emailVerified: new Date() },
  })

  return 'VERIFICADO'
}

/** Borra los tokens vencidos. Se llama desde el job diario de limpieza. */
export async function limpiarTokensVerificacion(ahora: Date = new Date()): Promise<number> {
  const resultado = await prisma.verificationToken.deleteMany({
    where: { expires: { lt: ahora } },
  })

  return resultado.count
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run tests/verificacion-email.test.ts
```

Esperado: 7 tests en verde.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/verificacion-email.ts tests/verificacion-email.test.ts
git commit -m "feat(verificacion): logica de tokens de email"
```

---

## Task 2: Enlace del email y alta

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/app/actions/registro.ts`

Se hacen juntos porque el cambio de firma de `enviarEmailVerificacion` deja el árbol sin compilar hasta actualizar el alta.

- [ ] **Step 1: Cambiar el enlace en `src/lib/email.ts`**

Agregar el import junto a los demás de `@/lib`:

```ts
import { armarUrlVerificacion } from '@/lib/verificacion-email'
```

Reemplazar el bloque de `enviarEmailVerificacion`:

```ts
/**
 * Email de verificación de cuenta.
 *
 * El token lo genera `crearTokenVerificacion`; acá solo se arma el enlace a
 * `/verificar-email` y se delega el envío a `enviar`.
 */
export async function enviarEmailVerificacion(params: {
  email: string
  nombre: string
  token: string
}): Promise<ResultadoEnvio> {
  const { nombre, email, token } = params

  const enlace = armarUrlVerificacion(token)
```

En el HTML, sacar la frase falsa "Sin verificar no podés entrar al panel": el
login no se bloquea, lo único que no se puede es publicar. Dejar:

```ts
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Hola ${nombre}, tocá el botón para confirmar tu email.</p>
```

No cambiar el resto del cuerpo (subject, botón, texto de abajo, `enviar`).

- [ ] **Step 2: Generar el token en el alta**

En `src/app/actions/registro.ts`, reemplazar el `try` del envío (alrededor de la línea 153):

```ts
  // Generar el token y enviar el email de verificación. Si falla, la cuenta
  // queda creada pero sin verificar: el usuario puede pedir que se lo
  // reenvíen. Es preferible a tirar atrás el registro entero por un problema
  // del proveedor de email.
  try {
    const { crearTokenVerificacion } = await import('@/lib/verificacion-email')
    const token = await crearTokenVerificacion(email)

    const { enviarEmailVerificacion } = await import('@/lib/email')
    await enviarEmailVerificacion({ email, nombre: name, token })
```

- [ ] **Step 3: Borrar la acción vieja de reenvío**

Eliminar de `src/app/actions/registro.ts` la función completa `reenviarEmailVerificacion` y su comentario (desde `/** Email de verificación.` hasta el cierre de la función, al final del archivo). Queda reemplazada por la action de la Task 3.

- [ ] **Step 4: Verificar que no quedan referencias**

```bash
grep -rn "reenviarEmailVerificacion\|api/auth/verify-email" src
```

Esperado: sin resultados.

- [ ] **Step 5: Typecheck y tests**

```bash
npm run typecheck
npx vitest run
```

Esperado: sin errores de tipos y todos los tests existentes en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/app/actions/registro.ts
git commit -m "feat(registro): generar token de verificacion al crear la cuenta"
```

---

## Task 3: Server Action de reenvío

**Files:**
- Create: `src/app/actions/verificacion-email.ts`

- [ ] **Step 1: Crear la action**

```ts
'use server'

import { redirect } from 'next/navigation'

import { enviarEmailVerificacion } from '@/lib/email'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { ipHasheada } from '@/lib/peticion'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/ratelimit'
import { crearTokenVerificacion } from '@/lib/verificacion-email'
import { emailSchema } from '@/schemas/contacto'

/** Reenvíos permitidos por hora, por IP y por email. */
const REENVIOS_POR_HORA = 3

const MENSAJE_ENVIADO = 'Si el email está registrado, te mandamos un enlace.'

function volver(mensaje: string, correcto: boolean): never {
  const clave = correcto ? 'ok' : 'error'

  redirect(`/reenviar-verificacion?${clave}=${encodeURIComponent(mensaje)}`)
}

/**
 * Reenvía el email de verificación.
 *
 * Responde siempre lo mismo exista o no la cuenta: la página no sirve para
 * averiguar qué emails están registrados.
 */
export async function reenviarVerificacion(datos: FormData): Promise<void> {
  const email = String(datos.get('email') ?? '').trim()

  const parseado = emailSchema.safeParse(email)
  if (!parseado.success) {
    return volver(parseado.error.issues[0]?.message ?? 'Revisá el email.', false)
  }

  const normalizado = parseado.data
  const ipHash = await ipHasheada()

  const [limiteIp, limiteEmail] = await Promise.all([
    rateLimit(`verificacion:ip:${ipHash}`, REENVIOS_POR_HORA, 3600),
    rateLimit(`verificacion:email:${hashValor(normalizado)}`, REENVIOS_POR_HORA, 3600),
  ])

  if (limiteIp.limitado || limiteEmail.limitado) {
    return volver('Probaste demasiadas veces. Esperá una hora.', false)
  }

  const usuario = await prisma.user.findUnique({
    where: { email: normalizado },
    select: { name: true, emailVerified: true },
  })

  if (usuario && !usuario.emailVerified) {
    try {
      const token = await crearTokenVerificacion(normalizado)

      await enviarEmailVerificacion({
        email: normalizado,
        nombre: usuario.name ?? 'bienvenido',
        token,
      })
    } catch (error) {
      logger.error('reenviarVerificacion: fallo el envío', { error })
      return volver('No pudimos enviar el email. Probá en un rato.', false)
    }
  }

  return volver(MENSAJE_ENVIADO, true)
}
```

- [ ] **Step 2: Typecheck y lint**

```bash
npm run typecheck
npm run lint
```

Esperado: sin errores. Si TypeScript se queja de que `volver` no es `async`, no corresponde: en un archivo `'use server'` solo los **exports** tienen que ser funciones async.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/verificacion-email.ts
git commit -m "feat(verificacion): accion de reenvio con rate limit"
```

---

## Task 4: Página `/verificar-email`

**Files:**
- Create: `src/app/verificar-email/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  verificarEmailConToken,
  type EstadoVerificacion,
} from '@/lib/verificacion-email'

export const metadata: Metadata = {
  title: 'Verificar email',
  robots: { index: false, follow: false },
}

/** El token es único por request: nada de cachear la respuesta. */
export const dynamic = 'force-dynamic'

type EstadoPagina = EstadoVerificacion | 'INCOMPLETO'

const MENSAJES: Record<EstadoPagina, { titulo: string; texto: string }> = {
  VERIFICADO: {
    titulo: 'Email verificado',
    texto:
      'Tu email quedó confirmado. Ya cumplís el requisito para publicar tu servicio; el resto depende de los demás datos de tu perfil.',
  },
  YA_VERIFICADO: {
    titulo: 'Tu email ya estaba verificado',
    texto: 'No hace falta hacer nada más. Podés volver a tu panel.',
  },
  VENCIDO: {
    titulo: 'El enlace venció',
    texto: 'Los enlaces duran 24 horas. Pedí uno nuevo y revisá tu correo.',
  },
  INVALIDO: {
    titulo: 'El enlace no es válido',
    texto:
      'Puede que hayas pedido un enlace nuevo o que el link esté incompleto. Pedí uno nuevo.',
  },
  INCOMPLETO: {
    titulo: 'El enlace está incompleto',
    texto: 'Abrilo desde el botón del email, o pedí uno nuevo.',
  },
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaVerificarEmail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const token = uno(sp.token)

  const estado: EstadoPagina = token
    ? await verificarEmailConToken(token)
    : 'INCOMPLETO'

  const mensaje = MENSAJES[estado]
  const verificado = estado === 'VERIFICADO' || estado === 'YA_VERIFICADO'

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">
        Verificación de email
      </p>

      <h1 className="mt-2 text-title font-black uppercase">{mensaje.titulo}</h1>
      <p className="mt-4 text-lg leading-relaxed">{mensaje.texto}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        {verificado ? (
          <Link href="/panel" className="btn-oscuro inline-flex items-center">
            Ir a mi panel
          </Link>
        ) : (
          <Link
            href="/reenviar-verificacion"
            className="btn-oscuro inline-flex items-center"
          >
            Pedir un enlace nuevo
          </Link>
        )}

        <Link href="/soporte" className="btn-linea inline-flex items-center">
          Necesito ayuda
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck y lint**

```bash
npm run typecheck
npm run lint
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/verificar-email/page.tsx
git commit -m "feat(verificacion): pagina /verificar-email"
```

---

## Task 5: Página `/reenviar-verificacion`

**Files:**
- Create: `src/app/reenviar-verificacion/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

import { reenviarVerificacion } from '@/app/actions/verificacion-email'
import { Aviso } from '@/components/admin/Aviso'

export const metadata: Metadata = {
  title: 'Reenviar verificación',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaReenviarVerificacion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">
        Verificación de email
      </p>

      <h1 className="mt-2 text-title font-black uppercase">Reenviar el enlace</h1>
      <p className="mt-4 text-lg leading-relaxed">
        Escribí el email con el que te registraste y te mandamos un enlace
        nuevo. El anterior deja de funcionar.
      </p>

      <div className="mt-8">
        <Aviso ok={uno(sp.ok) || undefined} error={uno(sp.error) || undefined} />
      </div>

      <form action={reenviarVerificacion} className="mt-6 space-y-5">
        <div>
          <label className="block mb-2 font-bold uppercase text-sm" htmlFor="email">
            Tu email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className="campo w-full"
            placeholder="tu@email.com"
            required
          />
        </div>

        <button
          className="btn-oscuro px-4 py-3 text-base font-bold uppercase"
          type="submit"
        >
          Mandarme el enlace
        </button>
      </form>

      <p className="mt-10 border-t-[3px] border-ink pt-6 text-sm text-muted">
        ¿Ya lo verificaste y no podés entrar?{' '}
        <Link href="/soporte" className="font-bold underline">
          Escribinos
        </Link>
        .
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck y lint**

```bash
npm run typecheck
npm run lint
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/reenviar-verificacion/page.tsx
git commit -m "feat(verificacion): pagina /reenviar-verificacion"
```

---

## Task 6: Limpieza diaria de tokens vencidos

**Files:**
- Modify: `src/server/jobs/limpieza.ts`

- [ ] **Step 1: Sumar la limpieza al job**

Agregar el import:

```ts
import { limpiarTokensVerificacion } from '@/lib/verificacion-email'
```

Actualizar el comentario del job: donde dice "Dos cosas que crecen para siempre" poner "Tres cosas que crecen para siempre" y agregar el bullet:

```ts
 * - Tokens de verificación de email vencidos. El enlace dura 24 horas; después
 *   de eso no sirve para nada y solo ocupa lugar.
```

Después de la transacción existente, antes del `return`:

```ts
    const tokensEmail = await limpiarTokensVerificacion(ahora)
```

Y reemplazar el `return`:

```ts
    return {
      procesados: verificaciones.count + senales.count + tokensEmail,
      detalle: `${verificaciones.count} verificaciones, ${senales.count} señales, ${tokensEmail} tokens de email`,
    }
```

- [ ] **Step 2: Typecheck y tests**

```bash
npm run typecheck
npx vitest run
```

Esperado: sin errores y todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add src/server/jobs/limpieza.ts
git commit -m "chore(limpieza): borrar tokens de verificacion vencidos"
```

---

## Task 7: Verificación completa y memoria

**Files:**
- Modify: `memory.md`

- [ ] **Step 1: Correr la suite completa**

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
```

Esperado: los cuatro en verde. Si `npm run build` falla por variables de entorno, no inventar valores: reportar el error exacto y detenerse.

- [ ] **Step 2: Verificar que no quedó nada viejo**

```bash
grep -rn "api/auth/verify-email\|reenviarEmailVerificacion" src
```

Esperado: sin resultados.

- [ ] **Step 3: Anotar en `memory.md`**

Agregar al final:

```md
---

## Sesión 2026-11-11 — verificación de email

**Estado: implementado, pendiente de probar en producción.** Commits: ver
`git log --oneline -8`.

- `src/lib/verificacion-email.ts`: token de 32 bytes en base64url, guardado
  como SHA-256 en `VerificationToken` (sin cambio de schema), vida 24 h.
- `/verificar-email`: valida, marca `User.emailVerified` y es idempotente
  (abrir el link dos veces dice "ya estaba verificado").
- `/reenviar-verificacion`: 3 reenvíos por hora por IP y por email; responde
  igual exista o no la cuenta.
- `src/lib/email.ts`: el enlace ahora es `/verificar-email?token=...` (antes
  apuntaba a `/api/auth/verify-email`, que no existía).
- `src/server/jobs/limpieza.ts`: borra tokens vencidos.
- Pendiente: probar el flujo real en producción con una cuenta de prueba y
  confirmar que llega el email de Resend.
```

- [ ] **Step 4: Commit**

```bash
git add memory.md
git commit -m "docs(memory): verificacion de email implementada"
```

---

## Task 8: Prueba manual en producción (solo con autorización)

**No ejecutar sin confirmación explícita del usuario.** Pushear a `main` deploya en Vercel.

- [ ] **Step 1: Pedir autorización para pushear**

Preguntar: "¿Pusheo los commits? Vercel redeploya solo."

- [ ] **Step 2: Con el deploy listo, probar el alta**

En una ventana incógnito:

1. Abrir `https://poliserviciosnoa.vercel.app/registro`.
2. Registrarse con un email real que se pueda revisar.
3. Confirmar que llega el email "Verificá tu email".
4. Inspeccionar el enlace: tiene que empezar con
   `https://poliserviciosnoa.vercel.app/verificar-email?token=`.
5. Abrirlo. Esperado: "Email verificado" y botón "Ir a mi panel".
6. Abrirlo por segunda vez. Esperado: "Tu email ya estaba verificado".
7. Entrar al panel y confirmar que el requisito de email verificado ya no
   aparece como pendiente.

- [ ] **Step 3: Probar el reenvío**

1. Abrir `/reenviar-verificacion`.
2. Mandar un email que no exista. Esperado: "Si el email está registrado, te
   mandamos un enlace." (sin revelar nada).
3. Mandar el email de la cuenta ya verificada. Esperado: el mismo mensaje y
   ningún email nuevo.
4. Los pasos 2 y 3 ya consumieron dos intentos de la hora. Hacer dos más: el
   cuarto intento total tiene que mostrar "Probaste demasiadas veces. Esperá
   una hora."

- [ ] **Step 4: Confirmar en la base**

En el SQL Editor del proyecto Supabase de producción:

```sql
SELECT email, "emailVerified"
FROM "User"
WHERE email = 'la-cuenta-de-prueba@ejemplo.com';
```

Esperado: `emailVerified` con fecha.

- [ ] **Step 5: Probar un token vencido (opcional)**

Si se quiere probar sin esperar 24 h, usar una segunda cuenta **sin verificar**
y, en el SQL Editor, vencer su token:

```sql
UPDATE "VerificationToken"
SET expires = now() - interval '1 minute'
WHERE identifier = 'la-segunda-cuenta@ejemplo.com';
```

Abrir el enlace del email. Esperado: "El enlace venció" y el token desaparece
de la tabla. Con una cuenta ya verificada el resultado correcto es "ya estaba
verificado", aunque el token esté vencido.

---

## Notas de implementación

- **`enviar` no lanza.** `src/lib/email.ts` devuelve `{ ok: false }` cuando
  Resend falla. Por eso un fallo de email deja la cuenta creada y sin
  verificar; el usuario puede pedir reenvío. No agregar rollback nuevo: está
  fuera de alcance.
- **El token usado queda hasta el vencimiento.** Es deliberado, para que el
  segundo clic diga "ya estaba verificado". El cron lo borra.
- **Un scanner de emails puede abrir el enlace.** Verifica el email sin que la
  persona haga nada; es el comportamiento aceptado en el spec.
- **No hay migración.** Si alguien propone `db push`, está fuera de alcance:
  `VerificationToken` ya existe en producción.
