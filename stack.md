# Stack de PoliserviciosNOA

Stack fijo. Cambiar algo acá requiere actualizar antes `decisions.md`.

## Runtime y framework

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 14.2 App Router | SSR/SSG, Server Actions, middleware de auth |
| Lenguage | TypeScript estricto | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, sin `any` |
| Estilos | Tailwind CSS 3.4 | Sin CSS modules ni librerías de UI |
| Base de datos | PostgreSQL + Prisma 6 | Relaciones reales, `groupBy`, `$transaction` con `FOR UPDATE` |
| Autenticación | NextAuth v4 (`next-auth`) + `@next-auth/prisma-adapter` | Sesión JWT, 3 roles |
| Validación | Zod 3.24 | Mismos schemas en cliente y servidor |
| Deploy | Vercel | Cron, edge middleware, previews |

## Servicios externos

| Servicio | Uso | Abstracción |
|---|---|---|
| Mercado Pago | Suscripción mensual, precio de `Plan.amount` | `src/lib/mp/` (existe) |
| Cloudinary | Galería, hasta 10 imágenes por perfil | `src/lib/cloudinary.ts` (existe) |
| Resend | Emails transaccionales | `src/lib/email.ts` (existe) |
| Upstash Redis | Rate limiting | `src/lib/ratelimit.ts` (existe) |
| Meta WhatsApp Cloud API | Verificación del número | `src/lib/whatsapp/` (existe) |
| ARCA (AFIP) | Facturación | `InvoiceProvider` (pendiente) |

Todos con implementación `Mock` para desarrollo. Ningún `services/` debe
importar un SDK externo directamente.

## Dependencias que se descartaron

- **`libphonenumber-js`.** 100 kB para normalizar un teléfono argentino.
  `src/lib/phone.ts` lo hace con la lista real de códigos de área. Ver
  `decisions.md` D12.

## Dependencias agregadas

- **`vitest`**, para lógica pura. Los flujos que necesitan base real se prueban
  con `scripts/verificar-whatsapp.ts` contra el Postgres embebido. Ver D14.
- **Sin SDK de Mercado Pago.** Se llama a la API con `fetch`, como con Meta
  WhatsApp. El SDK oficial pesa cientos de kB para envolver tres endpoints que
  son un POST, un GET y un PUT con JSON.

## Dependencias que no se pueden cambiar sin motivo

- **`bcryptjs`, no `bcrypt`.** El nativo requiere compilación y falla al
  instalarse en Vercel y en Linux sin toolchain.
- **`@next-auth/prisma-adapter`, no `@auth/prisma-adapter`.** El segundo es
  para NextAuth v5 y los tipos del adapter no son compatibles con v4.
- **`next.config.mjs` y `postcss.config.mjs`.** Next 14 rechaza `next.config.ts`
  y los `.mjs` no admiten `import type`. Los tipos van por JSDoc.

## Configuración de archivos

- `next.config.mjs` y `postcss.config.mjs` en `.mjs` (no `.ts`, no `.js`)
- Alias `@/*` → `./src/*`
- Imágenes remotas: solo `res.cloudinary.com`

## Scripts

```bash
npm run dev          # desarrollo
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint --dir src
npm run test         # tests unitarios (Vitest)
npm run db:seed      # carga el catálogo (idempotente)
npm run verificar    # Postgres efímero + seed x2 + tests + flujo WhatsApp + build + lint
```

`npm run verificar` es el comando de confianza: levanta un PostgreSQL embebido,
aplica el schema, corre el seed dos veces para comprobar idempotencia, corre los
tests unitarios y el flujo de verificación de WhatsApp contra esa base, y
después corre build y lint. No requiere tener Postgres instalado.