# PoliserviciosNOA — Diseño de fundación (Fase 1)

Fecha: 2026-10-09
Estado: aprobado por el usuario
Stack: Next.js 14 App Router, TypeScript estricto, Tailwind, Prisma, PostgreSQL, Auth.js, Zod, Cloudinary, Resend, Mercado Pago, Upstash, Vercel

---

## 1. Contexto y problema de negocio

Portal de servicios (poliservicios) para Tucumán, Salta, Santiago del Estero,
Catamarca y Jujuy. Profesionales y oficios publican un perfil, pagan una
suscripción mensual de $10.000 ARS vía Mercado Pago y los clientes los contactan
por WhatsApp.

Público: gente del interior que busca un plomero, electricista o chofer para
mañana. Mobile-first. Español rioplatense (vos).

**Problema de negocio central:** es un marketplace con chicken-and-egg. Nadie
publica sin pagar, nadie paga sin ver clientes, no hay clientes sin
profesionales. Los módulos de lanzamiento (cupones, socios fundadores,
apertura por rubro) existen para resolver esto y no son parte de la Fase 1.

---

## 2. Decisión de validación: un solo control

La verificación de identidad con proveedor KYC externo **se descarta**.

**Motivo económico.** Con KYC completo al registro (USD 2,50-4,50 por
verificación) y una conversión del 5% al pago, el costo por perfil publicado es de
USD 25 contra un ingreso de USD 10. El modelo no cierra: se paga 2,5× lo que el
cliente paga, antes de comisión de Mercado Pago.

El costo estimado por escenario:

| Escenario | Costo por lead | Costo por perfil publicado |
|---|---|---|
| KYC completo al registro, 5% conversión | USD 3,00 | USD 25 (roto) |
| KYC escalonado, 12% conversión | USD 0,75 | USD 9 (al límite) |
| Sin KYC | USD 0 | USD 0 |

**Qué reemplaza al KYC, todo a costo cero:**

1. `Profile.whatsappVerifiedAt` — verificación por inversión: el profesional
   recibe un código de 6 caracteres, lo envía por WhatsApp a un número de la
   plataforma, un webhook de Meta confirma el remitente. Prueba que el número
   existe y que esa persona lo controla. Costo operativo $0.
2. `User.emailVerifiedAt` — enlace mágico vía Resend.
3. Mercado Pago valida la identidad del pagador al cobrar con tarjeta. Quien
   pagó ya pasó por un KYC,>a costo nuestro.
4. Verificación de CUIT contra el padrón de ARCA para perfiles de empresa
   (consulta pública, en módulo posterior).
5. Revisión manual del admin en el lanzamiento para los primeros perfiles de
   cada rubro.

**Consecuencia en el modelo:** la única insignia pública es "WhatsApp
verificado". Los textos legales deberán declarar que la plataforma no verifica
identidad, y el cliente tiene un botón "Reportar perfil dudoso" que crea un
`Report` para revisión manual.

**La puerta queda abierta sin pagar el costo hoy.** `KycAttempt` no se crea
ahora. Si alguna vez se necesita, es un campo opcional en `Profile` y un paso
extra antes de publicar, no una reescritura de la máquina de estados.

---

## 3. Decisiones de modelo resueltas anticipadamente

Las contradicciones entre el brief original y los prompts existentes se
resuelven ahora, porque migrarlas después obliga a reescribir consultas y
pantallas.

### 3.1 Cobertura múltiple (de `ProfileCoverage`)

El brief original usa `Profile.cityId`. El módulo de zonas de cobertura agrega
hasta 8 ciudades. Se incluye la tabla desde el día 1: agregarla después obliga a
reescribir la consulta de búsqueda, el sitemap y los filtros de ciudad.

### 3.2 Perfiles de empresa (de `type: PERSON|COMPANY`)

Se agrega `type` y los campos de empresa (nullable). Cuestan pocas columnas;
migrarlos después obliga a reescribir el registro, el perfil público y el KYC.

### 3.3 Límites siempre con bloqueo de fila

Los límites (10 imágenes, 2 rubros, 4 subcategorías, 8 ciudades) se validan
dentro de una transacción con `SELECT ... FOR UPDATE` sobre la fila del
`Profile`. Un límite validado sin bloqueo no es un límite: es una sugerencia
cuando hay peticiones simultáneas.

### 3.4 Sin hashing de DNI

No hay DNI en el sistema, luego no hay `dniHash` ni pepper que mantener.

---

## 4. Arquitectura

```
Next.js 14 App Router + TypeScript estricto

app/
  (public)/            home, buscar, /[provincia]/[rubro], /p/[slug]
  (auth)/              registro, login
  panel/               profesional  -> requiere PROFESSIONAL
  admin/               admin        -> requiere ADMIN
  api/                 webhooks, cron, health

src/
  app/actions/         server actions, una por dominio (capa fina)
  lib/                 prisma, auth, env, mp, cloudinary, resend, ratelimit, whatsapp
  schemas/             Zod — compartido entre cliente y servidor
  services/            lógica de negocio, sin imports de React ni next/*
  components/          ui/ (primitivos) + features/ (compositivos)
  types/               tipos compartidos

prisma/
  schema.prisma
  seed.ts
  data/categories.ts   datos tipados, editables sin tocar lógica
  data/cities.ts

tests/                 vitest (lógica) + playwright (E2E)
```

### Frontera `services/` — regla principal

Ninguna función en `src/services/` importa React ni `next/*`. Toda la lógica de
negocio (límites con `FOR UPDATE`, reglas de publicación, normalización de
WhatsApp) vive ahí y se testea con Vitest sin levantar servidor ni base.

Los Server Actions son capa fina: validan Zod → llaman al service → redirigen.
Si un Server Action tiene lógica de negocio, es que está en el lugar equivocado.

### Proveedores abstraídos desde el día 1

Interfaces en `src/lib/` con implementación `Mock` para desarrollo:

- `WhatsappProvider` — envío y verificación (Mock ahora, Meta Cloud API después)
- `InvoiceProvider` — facturación (Mock ahora, ARCA después)
- `OtpProvider` — SMS/OTP (Mock ahora, Twilio después)

Cambiar de proveedor no debe tocar lógica de negocio.

---

## 5. Dirección visual

**Brutalist / Editorial.**

El público abre un perfil buscando alguien para hoy, con datos móviles y a
veces mala conexión. Necesita jerarquía brutal y carga inmediata. El lujo no
vende acá; la inmediatez sí.

- Tipografía enorme como elemento gráfico principal, rompiendo el grid
- Blanco y negro con **un solo color de acento**: verde WhatsApp `#25D366`,
  reservado exclusivamente al botón de contacto. Ningún otro elemento lo usa
- Bordes gruesos, `border-radius: 0` en cards
- Sin gradientes decorativos, sin glassmorphism
- Sin sombras difusas: separación por bordes y espacio negativo
- Controles táctiles de 44px mínimo (mobile-first real)

---

## 6. Reglas de publicación

Una sola función, `canPublishProfile()`, en `src/services/publicacion.ts`.
La usan la búsqueda, el SEO, la card y el perfil público. Si alguien la
duplica, el bug vuelve.

```
email verificado
+ WhatsApp verificado
+ suscripción ACTIVE
+ perfil completo (nombre, ≥1 rubro principal, ≥1 imagen, descripción)
```

Si el número de WhatsApp cambia, `whatsappVerifiedAt` se borra y el perfil se
despublica hasta volver a verificar. Perfil congelado, no eliminado: el
profesional tiene una acción "cambiar número" que reinicia solo la verificación.

---

## 7. Fases

**Fase 1 — Fundación** (esta entrega)
Schema completo · scaffold · Auth.js con 3 roles · layout mobile-first ·
registro y login · panel con navegación · seed idempotente de 8 grupos,
57 rubros con subcategorías y 5 provincias con ciudades · schemas Zod ·
headers de seguridad · `.env.example`.

**Fase 2 — Vertical completo** (WhatsApp verificado → pago → visible)
Verificación de WhatsApp por inversión con webhook Meta · perfil con hasta
2 rubros · galería de 10 imágenes con Cloudinary · suscripción Mercado Pago
con webhook firmado e idempotente · cron de avisos · búsqueda pública ·
perfil `/p/[slug]`.

**Fase 3 — Producto** SEO y sitemap · panel de admin · corazones y votos ·
moderación y reportes · legales.

**Fase 4 — Lanzamiento** Deploy · monitoreo · facturación ARCA · cupones ·
PWA · soporte.

---

## 8. Riesgos residuales

1. **Chicken-and-egg.** Sin oferta visible nadie paga. Mitigación: módulos M10
   (cupones, socios fundadores, apertura por rubro) antes de salir a público.
2. **Números reciclados.** Un número de prepago que se recicla deja un perfil
   huérfano. Mitigación: pausa y "cambiar número" sin repagar.
3. **Fraude de perfiles duplicados.** Con WhatsApp único se limita a quien tenga
   prepagos. Mitigación: botón "Reportar perfil dudoso" + revisión manual en el
   lanzamiento.
4. **Textos legales.** Declarar que no se verifica identidad y que Mercado Pago
   sí valida al pagador es un matiz legal. Requiere revisión de un abogado antes
   de publicar.
5. **Margen ajustado.** Suspender la suscripción pierde ingreso y cliente.
   Requiere que el cobre y la baja sean lo más simples posible (módulo M2).

---

## 9. Criterios de aceptación de la Fase 1

Todos verificados con `npm run verificar`, que levanta un PostgreSQL efímero,
aplica el schema, corre el seed dos veces y después corre build y lint:

- `npx tsc --noEmit` sin errores con `strict: true`, `noUncheckedIndexedAccess`
  y sin `any`
- `npx prisma validate` OK y `npx prisma generate` OK
- `npm run db:seed` dos veces deja exactamente **8 grupos, 57 rubros, 240
  subcategorías y 82 ciudades**, sin duplicados
- `npx next lint` sin warnings
- `npx next build` OK
- `/registro` crea un `User` con rol `PROFESSIONAL`; `/login` autentica
- `PROFESSIONAL` entra a `/panel`; `CLIENT` recibe 403; `ADMIN` a `/admin`
- Layout legible y usable a 360px de ancho
- Ningún secreto en el código: `.env.example` solo con nombres

### Desviaciones del plan original

**El prompt `05-rubros-subcategorias-ciudades.md` dice 8 grupos pero enumera 7.**
Se resolve separando el grupo más sobredimensionado: "Hogar y construcción"
tenía 19 rubros, el doble que cualquier otro, y la mitad no tenía relación con
obra (limpieza, jardinería, control de plagas). Se crea "Cuidado del hogar"
con 5 rubros y el total se mantiene en 57. Se hace ahora y no después porque
mover un rubro de grupo desplaza los perfiles entre URLs y rompe el SEO ya
indexado.

**`src/app/actions/registro.ts` necesita `"use server"` explícito.**
Sin la directiva, Next.js lo trata como un módulo común, lo arrastra al
bundle del cliente y manda Prisma al navegador. `/registro` pesaba 276 kB; con
la directiva baja a 105 kB. Es un bug silencioso: la app funciona igual, pero
en 3G la página de alta tarda el doble.

**`next.config` y `postcss.config` van en `.mjs`, no `.ts`.**
Next 14 rechaza `next.config.ts` y `.mjs` no admite `import type`. Los tipos
van por JSDoc (`/** @type {import('next').NextConfig} */`), que el editor sí
entiende.