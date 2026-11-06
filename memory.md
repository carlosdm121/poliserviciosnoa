# Memoria del proyecto

Estado de avance, para retomar sin releer toda la conversación.

---

## Qué es

**PoliserviciosNOA** — portal de servicios para Tucumán, Salta, Santiago del
Estero, Catamarca y Jujuy. Profesionales publican perfil, pagan suscripción
mensual de $10.000 ARS por Mercado Pago, y los clientes los contactan por
WhatsApp.

Contexto fijo completo en `prompts/00-contexto-fijo-y-guia.md`. Los demás
archivos de `prompts/` planifican 20 días de trabajo más 12 módulos de baches.

---

## Estado: Fase 1 TERMINADA + módulos 1.6 a 1.9, 2.1 a 2.7 y 3.1 a 3.4 TERMINADOS

Fecha: 2026-10-28. Todo verificado en verde (typecheck, tests, lint y build; los
scripts de flujo contra base real precisan Postgres, que no está en esta máquina).
Tests unitarios: **300 en 16 archivos**.

### Semana 1 (módulos 1.1 a 1.9) completa

| Módulo | Qué quedó | Dónde |
|---|---|---|
| 1.6 | Verificación de WhatsApp (código, webhook, simulador, UI) | `src/lib/phone.ts`, `src/lib/hash.ts`, `src/lib/whatsapp/`, `src/services/verificacion-whatsapp.ts` |
| 1.7 | Antiabuso: moderación, lista de bloqueo, riesgos, NO FUI YO | `src/services/moderacion.ts`, `src/services/bloqueo.ts`, `src/services/riesgo.ts`, `src/lib/texto-perfil.ts` |
| 1.8 | Panel de perfil: persona/empresa, ubicación, cobertura, rubros, CUIT | `src/lib/cuit.ts`, `src/schemas/perfil.ts`, `src/services/perfil.ts`, `src/components/perfil/` |
| 1.9 | Checklist de publicación y tabla de combinaciones | `src/services/publicacion.ts`, `src/components/panel/PanelPasos.tsx` |

**Cross-cutting que se escribió de paso** (los pedía M1.1 y faltaban):
`src/lib/logger.ts` (JSON con redacción), `src/lib/ratelimit.ts` (Upstash +
fallback en memoria), Vitest, `tests/reglas-proyecto.test.ts`.

### Módulo 2.1 — Galería de imágenes

| Pieza | Dónde |
|---|---|
| Lógica pura (límite, formatos, carpeta, anti-IDOR de `publicId`, miniaturas) | `src/lib/imagen.ts` |
| Cliente de Cloudinary: firma, consulta, borrado, mock | `src/lib/cloudinary.ts` |
| Zod compartido + tipo `ImagenGaleria` | `src/schemas/galeria.ts` |
| Lógica de galería con `FOR UPDATE` | `src/services/galeria.ts` |
| Server Actions | `src/app/actions/galeria.ts` |
| UI de la galería | `src/components/galeria/Galeria.tsx`, `src/app/panel/galeria/page.tsx` |
| Flujo contra base real (12 subidas simultáneas, IDOR) | `scripts/verificar-galeria.ts` |
| Tests de lógica pura | `tests/galeria.test.ts` |

`Image` gana `isHidden`, `hiddenReason`, `hiddenAt`, `hiddenBy`.

**Estado del 2.1: TERMINADO Y VERIFICADO** (2026-10-15). 31/31 comprobaciones del
flujo de galería: 12 subidas simultáneas dejan exactamente 10 (por eso está en
`npm run verificar` y no en una suite opcional), los tres IDOR, el traversal y la
publicación.

Corrección que hubo que hacer al verificar: la comprobación de que el motivo de
publicación es `SIN_IMAGENES` estaba mal planteada. `unpublishedReason` guarda
**un solo** motivo — el primero de la lista, que va ordenado por prioridad
(`src/services/publicacion.ts:205`). Con un perfil recién creado ese primer motivo
es `SIN_SUSCRIPCION`, y `SIN_IMAGENES` queda más abajo. La aserción fallaba por
el orden de los motivos, no por un defecto de la galería, y habría pasado por la
razón equivocada en cuanto el orden cambiara. Fix en `scripts/verificar-galeria.ts`:
el perfil de prueba se deja con suscripción activa y rubro principal
(`activarSuscripcion`, `ponerRubroPrincipal`) para que `SIN_IMAGENES` sea de verdad
el primer motivo.

### Módulo 2.2 — Planes y precio configurable

| Pieza | Dónde |
|---|---|
| Formato de dinero (`formatArs`, `formatearPrecioMensual`, `formatearAumentoPrecio`) | `src/lib/dinero.ts` |
| `getCurrentPlan()`, caché de 15 s, `montoVigente()` | `src/services/planes.ts` |
| Pantalla de suscripción con el precio leído de la base | `src/app/panel/suscripcion/page.tsx` |
| Tests del formateador | `tests/dinero.test.ts` |
| Flujo contra base real (cambiar el precio cambia la pantalla) | `scripts/verificar-planes.ts` |
| Reglas anti-hardcode y anti-`Intl` sueltos | `tests/reglas-proyecto.test.ts` |

`Plan`, `Subscription.planAmount` y `PriceChange` ya estaban en el schema, y el
seed ya creaba el plan. Lo que faltaba era **la lectura**: la fuente única del
precio y su formato.

**Estado: TERMINADO Y VERIFICADO** (2026-10-15). 21/21 comprobaciones del flujo
de planes: cambiar el monto en la base cambia el precio mostrado, la caché dura
15 s y hay que vaciarla, un plan con fecha futura no se vende, un monto negativo
no se muestra como precio.

### Módulo 2.3 — Suscripción con Mercado Pago

| Pieza | Dónde |
|---|---|
| Contrato del proveedor + error propio | `src/lib/mp/provider.ts` |
| Cliente real (fetch, sin SDK) | `src/lib/mp/real.ts` |
| Mock (se activa con `MP_REAL=1`) | `src/lib/mp/mock.ts` |
| Elección de proveedor por llamada | `src/lib/mp/index.ts` |
| Lógica pura: requisitos, importe, período, precio congelado, condiciones | `src/lib/suscripcion.ts` |
| Zod de datos fiscales y de aceptación de términos | `src/schemas/suscripcion.ts` |
| Alta, requisitos, baja, datos fiscales | `src/services/suscripcion.ts` |
| Server Actions | `src/app/actions/suscripcion.ts` |
| Botón de pago, baja y formulario fiscal | `src/components/panel/` |
| Pantallas | `src/app/panel/suscripcion/`, `src/app/panel/datos-fiscales/` |
| Flujo contra base real (58 comprobaciones) | `scripts/verificar-suscripcion.ts` |
| Configuración y tarjetas de prueba | `docs/mercadopago-config.md` |
| Tests de lógica pura (33) | `tests/suscripcion.test.ts` |
| Reglas anti-fetch y anti-token de Mercado Pago | `tests/reglas-proyecto.test.ts` |

**Modelo:** nueva tabla `FiscalData` (1:1 con `Profile`, ver D25). `Subscription`
gana `priceFrozen`, `graceUntil`, `termsVersion` y `termsAcceptedAt`. La única
suscripción por perfil se mantiene con `profileId @unique`.

**Estado: TERMINADO Y VERIFICADO** (2026-10-16). 58/58 comprobaciones del flujo de
suscripción: los cinco requisitos, el precio congelado que sobrevive al
reintento, sin plan no se cobra, sin aceptar los términos no se cobra, y las dos
carreras.

**El bug que encontraron las dos carreras, y que es el motivo de que el script
esté en `npm run verificar`:** siete "Suscribirme" simultáneos creaban los siete
preapprovals en Mercado Pago y los siete pasaban el chequeo de `PENDING` porque
todos leían `mpPreapprovalId` en `null` antes de que ninguno escribiera. Los
siete escribían, el último ganaba la fila, y **los otros seis quedaban cobrando
con nadie registrado**. El fix es leer el preapproval anterior **dentro** de la
transacción, con la fila bloqueada, y cancelarlo después del commit
(`src/services/suscripcion.ts`). El criterio del test no es "una sola alta
completa" sino "**un solo cobro recurrente abierto**": sobre una `PENDING` los
siete reintentos son legítimos y se resuelven en serie.

**Lo que hay que saber para probar:** con `MP_REAL=1` y credenciales de prueba de
Mercado Pago, el checkout abre de verdad. Todo lo demás anda con el mock, sin
red. Los pasos y las tarjetas están en `docs/mercadopago-config.md`.

**Lo que no hace todavía:** facturar. El alta y el cobro cierran con el webhook
del 2.4 (sección siguiente); la factura la emite el 2.5.

### Módulo 2.4 — Webhook de Mercado Pago

| Pieza | Dónde |
|---|---|
| Firma `x-signature` (manifest, HMAC, comparación en tiempo constante) | `src/lib/mp/firma.ts` |
| Lectura del body, estados y clave de idempotencia | `src/lib/mp/evento.ts` |
| Consulta de pagos y cobros autorizados (contrato, real y mock) | `src/lib/mp/provider.ts`, `real.ts`, `mock.ts` |
| Procesamiento: pago, cobro autorizado, preapproval, gracia, email | `src/services/webhook-mercadopago.ts` |
| Ruta pública | `src/app/api/webhooks/mercadopago/route.ts` |
| Nota de crédito (stub para el 2.5) | `src/services/facturacion.ts` |
| Email de pago aprobado con candado `EmailLog` | `src/lib/email.ts` |
| Flujo contra base real (39 comprobaciones) | `scripts/verificar-webhook-mp.ts` |
| Tests de firma/evento/estado (23) | `tests/webhook-mp.test.ts` |

**Estado: TERMINADO Y VERIFICADO** (2026-10-23). 39/39 comprobaciones del webhook:
firma válida, firma falsa, sin firma, body inválido, tipo desconocido, pago
aprobado que activa y publica, evento repetido que no duplica pago ni email,
rechazo de renovación con gracia, reembolso, cancelación de preapproval, primer
pago rechazado que no publica, pago aprobado sin foto que no publica, cobro
autorizado y pago inexistente.

**Decisiones que no se pueden perder:** D28 en `decisions.md`. En corto: el body
no es fuente de verdad (se consulta la API), la idempotencia es
`mp:{tipo}:{recurso}:{estado}`, el webhook nunca crea suscripciones, la gracia se
calcula una sola vez y solo aplica si hay un período pagado, y cancelar el
preapproval no despublica hasta que termine el mes.

**Cómo probarlo:** `npm run verificar` cubre el flujo con el proveedor mock. Para
probar la ruta real hace falta una URL pública (deploy o túnel): Mercado Pago no
alcanza `localhost`. La firma usa `MP_WEBHOOK_SECRET`; si el secret no coincide,
la ruta responde 401 y no toca la base.

### Módulo 2.5 — Facturación electrónica (ARCA)

| Pieza | Dónde |
|---|---|
| Contrato del proveedor, errores y tipos | `src/lib/arca/provider.ts` |
| Cálculos: desglose de IVA, códigos ARCA, fechas, CSV, backoff | `src/lib/arca/calculos.ts` |
| Proveedor mock (secuencias separadas factura/NC, idempotencia, falla simulada) | `src/lib/arca/mock.ts` |
| Proveedor real sobre Afip SDK (`/afip/auth` + `/afip/requests`) | `src/lib/arca/real.ts` |
| PDF propio (PDF 1.4, Helvetica, WinAnsi) | `src/lib/arca/pdf.ts` |
| Cola, emisión, NC, PDF, email, listado y CSV | `src/services/facturacion.ts` |
| Cron de pendientes con `CRON_SECRET` | `src/app/api/cron/facturacion/route.ts` |
| Descarga del comprobante (dueño o ADMIN) | `src/app/api/facturas/[id]/pdf/route.ts` |
| CSV mensual para el contador (solo ADMIN) | `src/app/api/admin/facturacion/reporte/route.ts` |
| Panel de facturación con reintento manual | `src/app/admin/facturacion/page.tsx`, `src/components/admin/BotonReintentarFactura.tsx` |
| Horario del cron | `vercel.json` (`0 9 * * *`, 06:00 ART) |
| Flujo contra base real (37 comprobaciones) | `scripts/verificar-facturacion.ts` |
| Tests de lógica pura (32) | `tests/facturacion.test.ts` |

**Estado: TERMINADO Y VERIFICADO** (2026-10-27). 37/37 comprobaciones: emisión
idempotente, PDF, reembolso con nota de crédito y factura `VOIDED`, fallo con
backoff, reintento por cron, resumen y CSV. Typecheck, lint y build en verde.

**Decisiones que no se pueden perder:** D29 y D30 en `decisions.md`. En corto:
proveedor mock por defecto (`ARCA_REAL=1` para el real), cola en base con
`attempts`/`nextAttemptAt` en vez de reintentar dentro del webhook, número
reservado antes de llamar a ARCA, y la factura no se borra: se anula con nota de
crédito.

**Configuración real pendiente:** `ARCA_ACCESS_TOKEN`, `ARCA_CUIT`,
`ARCA_PUNTO_VENTA`, `ARCA_TIPO_COMPROBANTE` y `ARCA_RAZON_SOCIAL` en Vercel.
Sin el token, en producción todo queda en `FAILED` con reintentos; no se pierde
ningún pago, pero tampoco se emite ningún comprobante. Probar primero con el
CUIT de desarrollo de Afip SDK (`20-40937847-2`, environment `dev`).

### Módulo 2.6 — Baja online y botón de arrepentimiento

| Pieza | Dónde |
|---|---|
| Reglas puras (plazo de 10 días, días restantes, número de trámite) | `src/lib/cancelaciones.ts` |
| Baja, evaluación y ejecución del arrepentimiento, estado | `src/services/cancelaciones.ts` |
| Libro de quejas, rate limit 5/hora y notificación | `src/services/reclamos.ts` |
| Server Actions con Zod y honeypot | `src/app/actions/cancelaciones.ts` |
| Reembolso en Mercado Pago (real y mock) | `src/lib/mp/{provider,real,mock}.ts` |
| Pantallas | `src/app/baja/page.tsx`, `src/app/arrepentimiento/page.tsx`, `src/app/libro-de-quejas/page.tsx` |
| Formularios | `src/components/baja/`, `src/components/reclamos/FormularioReclamo.tsx` |
| Modelos | `CancellationRequest`, `Complaint` en `prisma/schema.prisma` |
| Flujo contra base real (37 comprobaciones) | `scripts/verificar-cancelaciones.ts` |
| Tests de lógica pura (14) | `tests/cancelaciones.test.ts` |

**Estado: TERMINADO Y VERIFICADO** (2026-10-27). Baja deja `cancelAtPeriodEnd` y el
perfil visible hasta el fin del período; arrepentimiento reembolsa el último pago,
cancela la suscripción, despublica y deja constancia reconsultable; el libro de
quejas guarda y notifica. Decisiones en D31 y D34.

### Módulo 2.7 — Cron diario: avisos, vencimientos y limpieza

| Pieza | Dónde |
|---|---|
| Registro de jobs con aislamiento de errores | `src/server/jobs/registry.ts` |
| Ventanas de aviso y claves de período | `src/server/jobs/fechas.ts` |
| Reserva idempotente de emails | `src/server/jobs/email-log.ts` |
| Jobs: avisos, vencidas, limpieza | `src/server/jobs/{avisos,vencidas,limpieza}.ts` |
| Endpoint del cron con `CRON_SECRET` | `src/app/api/cron/daily/route.ts` |
| Horario | `vercel.json` (`0 12 * * *`, 09:00 ART) |

**Estado: TERMINADO Y VERIFICADO** (2026-10-27). Avisos a 3-5 y 1-2 días,
`ACTIVE` vencida y `PAST_DUE` sin gracia pasan a `EXPIRED` y despublican;
verificaciones de WhatsApp vencidas y señales de IP de más de 30 días se limpian;
correr dos veces no duplica nada. Decisiones en D32 y D33.

### Módulo 3.1 - Contacto por WhatsApp, corazones y `/mis-contactos`

| Pieza | Dónde |
|---|---|
| Modelos `ContactIntent`, `ProfileVote`, `ProfileDailyStat` | `prisma/schema.prisma` |
| Detección de bots por user-agent | `src/lib/bots.ts`, `tests/bots.test.ts` |
| Clic, estadística diaria e intención de contacto (24 h) | `src/services/contacto.ts` |
| Votos, anulación, lista, señales de fraude | `src/services/votos.ts` |
| Ruta de contacto con rate limit por IP | `src/app/api/contacto/[slug]/route.ts` |
| Server Action del corazón | `src/app/actions/votos.ts` |
| Botón optimista y accesible | `src/components/votos/BotonCorazon.tsx` |
| Página de contactos del cliente | `src/app/mis-contactos/page.tsx` |
| Reconciliación de contadores (`--fix`) | `scripts/reconciliar-contadores.ts` |
| Flujo contra base real (37 comprobaciones) | `scripts/verificar-contacto-votos.ts` |

**Estado: TERMINADO Y VERIFICADO** (2026-10-27). 37/37 comprobaciones: clic
anónimo sin datos personales, bot que no suma, ventana de 24 h, voto solo con
contacto previo, toggle, anulación con auditoría, lista y dos señales de riesgo.
Typecheck, 279 tests, lint y build en verde. Decisiones en D35 a D37.

**Brecha conocida:** no existe alta/login real de CLIENT (sin magic link). El
adaptador OAuth ahora crea usuarios `CLIENT`, pero el cliente tiene que entrar
con Google; el flujo por email queda pendiente para completar el 1.5. Los scripts
crean clientes directo por Prisma.

### Cómo se publica un perfil (para no olvidarlo)

`evaluarPublicacion` (`src/services/publicacion.ts:102`) exige 6 requisitos, todos
verificados contra la base y no contra lo que el usuario dice: email verificado,
WhatsApp verificado **desde su propio número**, suscripción `ACTIVE`, rubro
principal, ≥1 foto, y perfil completo (nombre + ciudad + descripción de 20+
caracteres). Más moderación: suspendido no aparece, y `PENDING_REVIEW` no bloquea
salvo que el admin prenda `requireManualApproval`.

`isPublished` en la base es una **caché**, no la verdad. La verdad siempre es
`evaluarPublicacion`, re-evaluada por el cron diario.

**Consecuencia del estado actual:** el vertical cierra de punta a punta. El alta
abre el checkout y deja la suscripción en `PENDING`; el webhook del 2.4 consulta
el pago, la pasa a `ACTIVE`, calcula el período, sincroniza la publicación y manda
el email. Un rechazo de renovación deja `PAST_DUE` con gracia; un reembolso pide
nota de crédito y, si viene del botón de arrepentimiento, además cancela y
despublica. El cron diario cierra los vencimientos y avisa antes.

### Lo que existe de la Fase 1

| Entrega | Ubicación |
|---|---|
| Spec de diseño | `docs/superpowers/specs/2026-10-09-poliservicios-noa-fundacion-design.md` |
| Decisiones y sus razones | `decisions.md` |
| Stack y deps que no se tocan | `stack.md` |
| Modelo de datos | `prisma/schema.prisma` |
| Catálogo (8 grupos, 57 rubros) | `prisma/data/categories.ts` |
| Ciudades (82) | `prisma/data/cities.ts` |
| Seed idempotente (catálogo + plan) | `prisma/seed.ts` |
| Verificación automática | `scripts/verificar.ts` + `verificar-{whatsapp,galeria,planes,suscripcion,webhook-mp,facturacion,cancelaciones,perfil-publico}.ts` |
| Regla de publicación | `src/services/publicacion.ts` |
| Precio de la suscripción | `src/lib/dinero.ts`, `src/services/planes.ts` |
| Mercado Pago | `src/lib/mp/`, `src/services/suscripcion.ts`, `docs/mercadopago-config.md` |
| Datos fiscales | `src/schemas/suscripcion.ts`, `src/app/panel/datos-fiscales/` |
| Estado del panel | `src/services/panel.ts` |
| Auth.js, 3 roles | `src/lib/auth.ts` |
| Middleware de autorización | `src/middleware.ts` |
| Env validado con Zod | `src/lib/env.ts` |
| Checklist de Meta | `docs/whatsapp-meta-config.md` |

### Verificación

```bash
npm run verificar
# Seed idempotente: SI
# Tests:            OK    (300 unitarios en 16 archivos)
# Flujo WhatsApp:   OK    (80 comprobaciones contra base real)
# Flujo galería:    OK    (31 comprobaciones contra base real)
# Flujo planes:     OK    (21 comprobaciones contra base real)
# Flujo suscripción: OK   (58 comprobaciones contra base real)
# Webhook MP:       OK
# Facturación:      OK    (37 comprobaciones contra base real)
# Baja y cron:      OK    (37 comprobaciones contra base real)
# Perfil público:   OK    (15 pruebas unitarias; flujo contra base real pendiente de Postgres)
# Build:            OK
# Lint:             OK
```

Levantar en desarrollo:

```bash
cp .env.example .env     # completar credenciales
npm run dev
```

**Probar la verificación sin número de Meta** (el simulador corre el mismo
servicio que el webhook):

```bash
curl -X POST http://localhost:3000/api/dev/whatsapp-simulate \
  -H 'Content-Type: application/json' \
  -d '{"from":"5493814123456","text":"Código: ABC123"}'
```

**Probar el pago sin Mercado Pago**: con el mock, el botón de `/panel/suscripcion`
funciona y devuelve una URL de checkout falsa. Para tocar la pasarela de verdad,
`MP_REAL=1` con credenciales de prueba — ver `docs/mercadopago-config.md`.

---

## Decisiones que hay que respetar

Las razones completas están en `decisions.md`. Lo que no se puede cambiar sin
replantear:

1. **Sin KYC.** Solo WhatsApp verificado. KYC cuesta USD 25 por perfil contra
   USD 10 de ingreso. Ver `decisions.md` D1.
2. **`evaluarPublicacion()` es la única dueña de la regla de publicación.**
   Exige 6 condiciones: email verificado + WhatsApp verificado + suscripción
   ACTIVE + rubro principal + al menos una foto + perfil completo. `isPublished`
   es solo la caché que escribe `sincronizarPublicacion()`. D4.
3. **Límites con `FOR UPDATE`**, nunca sin bloqueo. D5.
4. **Brutalist/Editorial**, verde solo para el botón de WhatsApp. D6.
5. **`"use server"` en cada archivo de `actions/`.** Sin eso, Prisma va al
   bundle del cliente. D8.
6. **`bcryptjs`, no `bcrypt`. `@next-auth/prisma-adapter`, no
   `@auth/prisma-adapter`.** `stack.md`.
7. **El número se guarda en claro y con hash.** Los dos. Sin el claro no hay
   botón de contacto. D11.
8. **Sin `libphonenumber-js`.** D12.
9. **Ningún `console.log` en servidor.** Todo por `logger`, que redacta. D13.
10. **Test de flujo contra base real, no en memoria.** D14.
11. **`moderationStatus` es un enum.** No dos booleanos. D15.
12. **La lista de bloqueo guarda hashes.** D16.
13. **Las señales de riesgo avisan, no bloquean.** D17.
14. **La provincia se deriva de la ciudad**, no se guarda. D18.
15. **Un solo botón de guardar** en el panel de perfil. D19.
16. **`FOR UPDATE` va antes del count**, no después. D20.
17. **La subida a Cloudinary va firmada** y la carpeta la pone el servidor; el
    `publicId` del cliente se revalida contra la API. D21.
18. **Una imagen oculta no cuenta para publicar.** D22.
19. **El mock de Cloudinary se activa con `CLOUDINARY_REAL=1`**, no adivinando
    el formato del secreto. D23.
20. **El precio sale de `Plan.amount`**, nunca del código, y `formatArs` es el
    único que lo formatea. Hay un test que falla el build si aparece un monto
    escrito. D24.
21. **Los datos fiscales van en tabla aparte y no son verificación de
    identidad.** D25.
22. **Una sola fila de suscripción por perfil.** `PENDING` se reabre cancelando el
    preapproval anterior; `ACTIVE` bloquea. El preapproval que queda atrás se lee
    dentro de la transacción. D26.
23. **El mock de Mercado Pago se activa con `MP_REAL=1`**, y no activa la
    suscripción: eso es del webhook. D27.

Los puntos 11 a 23 están respaldados por un test que falla si alguien los
rompe (`tests/reglas-proyecto.test.ts`, `tests/publicacion.test.ts`,
`tests/dinero.test.ts`, `tests/suscripcion.test.ts`).

---

## Cómo retomar el trabajo

Abrir el proyecto en `C:\Users\PC\Desktop\rubro` y decir **una** de estas. La
primera es la canónica.

| Decís | Arranca con |
|---|---|
| **Continuá PoliserviciosNOA desde el 3.5** | Invitación a valorar (el siguiente) |
| **Continuá PoliserviciosNOA, invitación a valorar** | Igual, en palabras |
| **Continuá PoliserviciosNOA desde donde quedamos** | El primero de la lista "Qué falta" de más abajo |
| **Continuá PoliserviciosNOA desde el 3.4** | Perfil público (ya terminado; solo para revisarlo) |
| **Continuá PoliserviciosNOA desde el 3** | Lo mismo que 3.5 |

Si nombrás un módulo explícito, se saltean los anteriores sin preguntar: es lo
que querés cuando ya sabés cuál falta.

Contexto para un chat nuevo (pegá esto antes de pedir algo):

```
PROYECTO: PoliserviciosNOA — portal de servicios para el NOA argentino.

Leé primero, en este orden:
1. decisions.md  — decisiones tomadas y POR QUÉ (respetarlas, sobre todo D4, D20, D21 a D28)
2. stack.md      — stack fijo y dependencias que no se tocan
3. memory.md     — este archivo: estado y qué falta
4. prompts/03-semana-3-contacto-confianza-busqueda.md — el módulo que sigue

Estado: Semana 1 completa (módulos 1.1 a 1.9) + Semana 2 completa (2.1 a 2.7)
+ módulos 3.1 a 3.4 (contacto, corazones, búsqueda pública, cards/home y perfil
público), todo verificado en verde.
Siguiente: módulo 3.5 (invitación a valorar).

Antes de escribir código, corré `npm run typecheck`, `npx vitest run` y
`npm run lint`. El `npm run verificar` completo tarda más de 15 minutos.

Reglas: TypeScript estricto sin any · comentarios en español con el porqué ·
Zod en cliente Y servidor · errores explícitos con mensajes en español
rioplatense (vos) · secretos solo en .env · mobile-first · todo server code
loguea por `logger`, nunca con console · entregá archivos completos con su ruta.
```

---

## Qué falta, en orden

### Semana 2 — archivos de prompts `prompts/02-...md`

Módulos, en el orden del archivo:

| Módulo | Qué hace | Estado |
|---|---|---|
| **2.1** | Galería de imágenes (máx. 10, Cloudinary) | **TERMINADO y verificado** |
| **2.2** | Planes y precio configurable | **TERMINADO y verificado** |
| **2.3** | Suscripción con Mercado Pago | **TERMINADO y verificado** |
| **2.4** | Webhook de Mercado Pago | **TERMINADO y verificado** |
| **2.5** | Facturación electrónica (ARCA) | **TERMINADO y verificado** |
| **2.6** | Baja online y botón de arrepentimiento | **TERMINADO y verificado** |
| **2.7** | Cron diario: renovaciones y avisos | **TERMINADO y verificado** |

**Por qué este orden:** el 2.1 fue primero porque `evaluarPublicacion` exige al
menos una imagen, y sin galería ningún profesional podía aparecer. Ya está. El
2.2 fue después porque el precio tiene que existir en la base antes de que algo
lo cobre: si el 2.3 hubiera definido el monto, el precio habría nacido en el
código del módulo de pagos. Y el 2.3 antes que el 2.4 porque el alta tiene que
dejar configurada la `notification_url` del webhook: si se hiciera al revés,
habría que volver a tocar cada preapproval en el panel de Mercado Pago.

### Semana 3 — archivos de prompts `prompts/03-...md`

| Módulo | Qué hace | Estado |
|---|---|---|
| **3.1** | Contacto por WhatsApp, corazones y `/mis-contactos` | **TERMINADO y verificado** |
| **3.2** | Búsqueda pública: `/buscar`, `/[provincia]/[rubro]`, `/[provincia]/[ciudad]/[rubro]` | **TERMINADO y verificado** |
| **3.3** | Cards de profesional, buscador home, cobertura y matrícula en card | **TERMINADO y verificado** |
| **3.4** | Perfil público `/p/[slug]`: galería con lightbox, WhatsApp, JSON-LD, contador de visitas | **TERMINADO y verificado (unitario)** |
| 3.5 | Invitación a valorar (corazones después del contacto) | Pendiente — **siguiente** |
| 3.6 | Dashboard del profesional | Pendiente |
| 3.7 | Reclamos | Pendiente |

**Estado del 3.4 (2026-10-28):**

| Pieza | Dónde |
|---|---|
| Helpers puros (JSON-LD, metadata, cobertura, nombres) | `src/lib/perfil-publico.ts` |
| Consulta pública y tipo `PerfilPublico` | `src/services/perfil-publico.ts` |
| Registro de visita (dueño y bot no suman; rate limit IP) | `src/services/vistas.ts` |
| Ruta `POST /api/vistas/[slug]` | `src/app/api/vistas/[slug]/route.ts` |
| Galería cliente con lightbox (Escape, flechas, foco) | `src/components/perfil/GaleriaPerfil.tsx` |
| Contador de visita mediante `sendBeacon` + fetch keepalive | `src/components/perfil/ContadorVista.tsx` |
| Página `/p/[slug]` con JSON-LD, badges y barra móvil fija | `src/app/p/[slug]/page.tsx` |
| Tests de JSON-LD y metadata (15) | `tests/perfil-publico.test.ts` |
| Script de flujo contra base real | `scripts/verificar-perfil-publico.ts` (pendiente de Postgres) |
| Cableado en `scripts/verificar.ts` | `scripts/verificar.ts` |

Reglas del 3.4:
- `obtenerPerfilPublico` usa `CONDICION_PERFIL_PUBLICO` y **no** selecciona `whatsappE164`.
- El JSON-LD es `LocalBusiness` **sin `telephone` ni `aggregateRating`**; `areaServed` con ciudad y provincia.
- Las visitas se dedupen con `rateLimit("vista:ip:{hash}:{slug}", 1, 1800)`, no se cuenta al dueño ni con `contar: false`, y no se guardan datos del visitante.
- `viewsCount` no se muestra públicamente.


**Antes de 3.6/3.7:** definir la relación entre `Complaint` (libro de quejas 2.6)
y el reporte de un perfil (`profileId`/`clientId`/`contactIntentId`/`motivo`).
Son audiencias y ciclos distintos; no conviene reutilizar la tabla sin decidirlo.

### Fase 2 — Vertical completo (WhatsApp → pago → visible)

Es la que convierte esto en algo testeable de punta a punta. Los puntos 1 y 2
ya están; el resto se sigue por los módulos de la tabla de arriba.

- ~~**Verificación de WhatsApp**~~ — TERMINADO (1.6).
- ~~**Perfil completo**~~ — TERMINADO (1.8).
- ~~**Galería**~~ — TERMINADO y verificado (2.1). Hasta 10 imágenes con
  Cloudinary, firma de subida validada contra la API, reordenar con drag & drop.
  Era el último bloqueo de contenido para publicar.
- ~~**Planes y precio**~~ — TERMINADO y verificado (2.2). El precio sale de
  `Plan.amount` y se formatea en un solo archivo. La pantalla de suscripción ya
  muestra el precio real; el botón de pago es 2.3.
- **Suscripción Mercado Pago** — el alta está TERMINADA y verificada (2.3) y el
  webhook también (2.4): preapproval recurrente, precio congelado, aceptación de
  términos versionada, datos fiscales, baja sin despublicar, activación por pago,
  gracia y reembolso. El vertical de pago cierra de punta a punta.
- ~~**Cron de avisos**~~ — TERMINADO y verificado (2.7). Emails antes del
  vencimiento, expiración e idempotencia con `EmailLog`.
- ~~**Contacto y corazones**~~ — TERMINADO y verificado (3.1). Clic anónimo sin
  datos personales, intención con sesión, votos solo tras contacto, antiabuso y
  `/mis-contactos`.
- **Búsqueda pública** — `/buscar`, `/[provincia]/[rubro]`, paginación,
  orden rotativo diario. → módulo 3.2.
- **Perfil público** — `/p/[slug]`, galería con lightbox, botón de WhatsApp
  con el mensaje predefinido, JSON-LD. → módulo 3.3.

Lo que ya está hecho y no hay que rehacer: moderación y lista de bloqueo
(1.7), panel de perfil (1.8), checklist de publicación (1.9).

**Antes de salir a público falta** `docs/whatsapp-meta-config.md`: número
dedicado, token permanente, `WHATSAPP_APP_SECRET`. Sin el App Secret todos los
POST del webhook dan 401 y el profesional pide un código que nunca se confirma.

Y falta `docs/mercadopago-config.md`: credenciales reales, webhook configurado
en el panel, `MP_WEBHOOK_SECRET` de la cuenta real y **alguien que sepa
responder un reclamo de "me cobró dos veces" antes del primer cobro real**. El
código del 2.4 ya está; lo que falta es configuración y operación.

### Fase 3 — Producto
SEO y sitemap · panel de admin · corazones y votos · moderación y reportes ·
legales (con abogado).

### Fase 4 — Lanzamiento
Deploy · monitoreo · facturación ARCA · cupones · PWA · soporte.

---

## Riesgos abiertos

1. **Chicken-and-egg.** Nadie publica sin pagar, nadie paga sin ver
   profesionales. Los módulos de cupones y socios fundadores (M10) existen
   para esto y son previos a salir a público.
2. **Suplantación del número.** Mitigado: mensaje prellenado explícito, el
   remitente tiene que coincidir, 5 intentos y bloqueo, y el aviso al titular
   con salida por "NO FUI YO" que libera el número y despublica al impostor.
   **Lo que falta:** la liberación real del E.164 (queda asociado al perfil
   impostor por el índice único) y la pantalla de administración para revisar
   las señales.
3. **Números reciclados.** Parcialmente mitigado: al cambiar el número se borra
   la verificación y el perfil se despublica (D11). Sigue sin existir la pausa
   sin repago.
4. **Textos legales.** Declarar que no se verifica identidad y que Mercado Pago
   sí valida al pagador requiere revisión de un abogado.
5. **Margen ajustado.** Suspender la suscripción pierde ingreso y cliente. El
   cobro y la baja tienen que ser lo más simples posible (módulo M2).
6. **Sin panel de administración.** Los servicios de moderación y el precio
   existen y están probados, pero no hay UI. Mientras tanto, moderar es por
   consola y el precio se cambia por Prisma Studio.
7. **La caché del precio hay que vaciarla a mano.** `getCurrentPlan()` cachea
   15 s. Cuando exista el panel de admin para cambiar el monto, tiene que
   llamar a `limpiarCachePlan()`, o el admin va a guardar $18.500 y va a seguir
   viendo $10.000 un rato largo y va a pensar que el guardado falló.
8. **Preapprovals huérfanos en Mercado Pago.** Si el 2.3 falla entre crear el
   preapproval y escribir la fila, el código lo cancela best-effort y loguea el
   `id`. Si esa cancelación falla (Mercado Pago caído), queda un cobro recurrente
   abierto que **nadie tiene registrado en la base** y que no aparece en ningún
   panel. Antes de salir a producción hay que revisar a mano la cuenta de Mercado
   Pago buscando preapprovals `pending` que no estén en la tabla `Subscription`. Cuando exista
   el panel de admin, esto tiene que ser una pantalla.
9. **El DNI viaja en la base.** Es lo que hace falta para facturar y está
   justificado en D25, pero es un dato personal que no estaba en el modelo
   original. Si algún día se filtra la base, hay más daño que antes. La
   retención y el borrado al dar de baja tienen que estar en el módulo 4.4.

---

## Aprendizajes de esta sesión

- **`"use server"` es fácil de olvidar** y el síntoma no es un error: la app
  funciona pero pesa 171 kB de más. Presente en `decisions.md` D8.
- **Un prompt puede contradecirse con sí mismo.** El `05-...md` pedía 8
  grupos y enumeraba 7. Verificar los números contra lo declarado, no contra
  lo que parece. Lo mismo pasó con 1.6: pedía guardar solo el hash del número,
  y así no hay botón de contacto. Verificar el pedido contra el negocio.
- **Verificar con un Postgres embebido evitó depender del entorno.** La
  máquina no tenía Postgres ni Docker, y winget tardó más de 10 minutos.
- **Los errores de encoding en archivos escritos a través de scripts de
  PowerShell** aparecieron varias veces (caracteres coreanos y cirílicos
  colgando en slugs). Verificar con un grep de `\u4E00-\u9FFF` después de
  escribir archivos grandes con comandos de shell. Pasó de nuevo en esta
  sesión, y una corrección con `-replace` en PowerShell rompió el JSX de un
  componente entero: **escribir los archivos con la herramienta de edición,
  no con PowerShell.**
- **Los tests encontraron tres bugs que la revisión a ojo no vio.** Un número
  ya en otro perfil reventaba con P2002 sin capturado (pantalla en blanco), la
  idempotencia no se registraba en el camino de éxito, y la normalización
  aceptaba mal `0381 15-4123456`. Ninguno era obvio de leer.
- **Un regex tolerante se traga palabras.** `extraerCodigo` devolvía `TRABAJ`
  para "¿cuánto sale el trabajo?". Los límites de palabra no son un detalle
  cosmético cuando el patrón es "6 caracteres del alfabeto".
- **Un test que pasa por la razón equivocada es peor que un test que falla.**
  La comprobación de que el motivo de publicación era `SIN_IMAGENES` falló al
  verificar la galería, y la causa no era la galería: `unpublishedReason` guarda
  solo el primer motivo de una lista ordenada por prioridad, y ese primer motivo
  era `SIN_SUSCRIPCION`. El test estaba probando el orden de los motivos. Un test
  que verifica algo distinto de lo que dice verificar es deuda: hay que preguntarse
  "¿qué rompería esto?" y no solo "¿esto pasa?".
- **`Intl` mete un espacio duro en el precio.** `Intl.NumberFormat('es-AR',
  { style: 'currency' })` devuelve `"$ 10.000"` con un U+00A0 entre el símbolo y el
  número. El punto de miles y la coma decimal los pone bien, pero ese
  espacio no: acá se escribe `$10.000`, y el precio roto se iba a ver en todas
  las pantallas y todos los emails. Lo detectó el test de `formatArs` al comparar
  literal contra literal. **Cuando un formateador devuelve un string con
  separadores, compará contra el literal exacto y no con `toContain`.**
- **Un test sobre coma flotante puede estar probando lo contrario de lo que
  dice.** El caso "10000 + 0.1 + 0.2 no debe mostrar centavos" estaba mal: ahí
  hay 30 centavos de verdad. El ruido de coma flotante que hay que absorber es
  del orden de 1e-13 en un entero, no en la parte decimal.
- **El `Out-File` de PowerShell rompe el encoding.** Escribir con
  `Out-File -Encoding utf8` sobre un archivo que ya es UTF-8 dejó un bloque
  entero en CP1252 y lo mezcló con el resto. Ya está en la lista de arriba, pero
  se repite: **escribir archivos con la herramienta de edición, nunca con
  PowerShell.** Para verificar: `Encoding::UTF8.GetString(...)` y buscar
  `\uFFFD`.
- **La herramienta de edición también mete caracteres raros.** En el módulo 2.3
  aparecieron palabras deformadas como "losERNANEs" o "estructuran", y un
  `cuid()` que quedó `cuit()` en el schema —que Prisma rechaza con un error de
  validación que no señala el typo—. Escribir con la herramienta no alcanza:
  hay que **buscar caracteres fuera del rango latino después de escribir
  archivos largos**, y para el schema conviene además correr `prisma validate`.
- **Un script de PowerShell con `IndexOf` puede truncar un archivo entero.**
  Pasó acá: `Substring` con un índice que daba `-1` cortó `memory.md` de 20 kB a
  13 kB y se llevó por delante media memoria. Si un ancla de texto no aparece
  primero, el script no falla: escribe basura. **Verificar el archivo después de
  editarlo con un script, y reconstruir desde el `write` si se rompió.**
- **Un `upsert` anula la protección del índice único.** El `FOR UPDATE` y el
  `profileId @unique` de `Subscription` parecían suficientes para manejar la
  carrera de dos altas simultáneas, y no lo eran: con `upsert`, el segundo no
  choca con el índice —lo **actualiza**—, así que los dos pasaban y quedaban dos
  preapprovals vivos. La protección de verdad era leer el estado anterior
  **adentro** de la transacción. Un índice único solo protege contra `create`;
  contra `upsert` hay que decidir uno mismo qué es "perder la carrera".
- **El criterio de un test de concurrencia tiene que ser el dinero, no la
  cantidad de llamadas.** La primera versión afirmaba "exactamente una alta se
  completa" sobre una suscripción `PENDING`, y fallaba: reintentar sobre una
  PENDING es correcto y los dos reintentos son legítimos. Lo que importaba era
  "un solo cobro recurrente abierto". Un test que mide llamadas exitosas mide
  la interfaz; uno que mide recursos vivos mide el daño real.
- **Un perfil de prueba que no es publicable no demuestra nada.** La primera
  versión del script daba por hecho que un perfil con suscripción ACTIVE queda
  publicado, y falló con `SIN_IMAGENES`: `sincronizarPublicacion` lo despublicaba
  correctamente porque el perfil de prueba no tenía fotos. El código estaba bien
  y el escenario mal. Antes de afirmar "esto no despublica", hay que construir el
  escenario con **todos** los requisitos de publicación, y escribir el flag a
  través del sincronizador, no a mano (D4). Volvió a pasar en 2.6: el perfil de
  prueba de la baja no tenía fotos y el propio sincronizador lo despublicaba.
- **Atrapar el P2002 no alcanza para que el log quede limpio.** Prisma escribe
  `unique constraint failed` en el log **antes** de devolver la excepción, así
  que la idempotencia de los emails del cron funcionaba pero llenaba el log de
  errores falsos. `createMany({ skipDuplicates: true })` hace el
  `ON CONFLICT DO NOTHING` y no ensucia. Un `catch` que "funciona" puede estar
  escondiendo un log que el próximo va a leer como falla.
- **Un resumen puede mostrar un resultado que no afecta el exit code.** En
  `scripts/verificar.ts`, `facturacionOk` se imprimía pero no estaba en el `if`
  final: el módulo 2.5 podía fallar y el script terminaba en 0. Al agregar una
  sección nueva, revisar los dos lugares: la impresión y la condición de salida.
- **`$queryRaw` intenta deserializar todas las columnas, incluso una de tipo
  `void`.** `pg_advisory_xact_lock(...)` devuelve `void` y Prisma falla al armar
  el resultado aunque el lock ya se haya tomado. Envolverlo en
  `SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(...)) AS bloqueo` deja una
  columna `int` que Prisma sí puede leer.
- **Un default de rol puede romper un flujo entero sin dar error.** El adaptador
  OAuth creaba `PROFESSIONAL` por default; ningún test fallaba, pero el cliente
  que entraba con Google no podía votar ni ver `/mis-contactos`, porque el
  middleware lo trataba como profesional. Cuando un modelo tiene un rol por
  defecto, revisar **quién** crea cada fila y no solo el valor del enum.
- **Un runner de verificación truncado no es una verificación.** La primera
  corrida de 3.1 se cortó al imprimir y no se sabía si el resultado era verde.
  Guardar la salida completa y mirar el código de salida antes de dar un módulo
  por terminado; el script puede haber fallado después del último `ok` visible.
## 4.1 Panel de administración (2026-10-29)

- **La matriz de permisos va en un solo lugar.** `src/lib/admin.ts` define
  secciones y `puedeVerSeccion`; el menú, cada página y cada server action leen
  de ahí. Si la regla estuviera escrita en el `if` de cada página, el día que
  cambie una las otras siguen autorizando de más.
- **El middleware no autoriza, solo filtra la entrada.** El token dura 30 días
  y su `role` puede estar viejo: cada acción vuelve a leer el rol de la base con
  `exigirAdmin()`/`exigirSuperAdmin()`. Es una consulta extra por escritura y
  vale la pena.
- **Una función que redirige tiene que devolverse.** En las acciones de
  formulario, `if (!admin.ok) volver(...)` no estrecha el tipo: TypeScript no
  sabe que `volver` no retorna. `return volver(...)` sí, y evita el `admin.data`
  sobre un `Resultado` fallido.
- **Separar lectura de escritura de configuración evitó arrastrar medio panel.**
  El webhook y `votos.ts` solo necesitan un número; importar `admin-config`
  los ataba a moderación y publicación. `configuracion.ts` lee, `admin-config.ts`
  escribe y reexporta.
- **El test de reglas del proyecto usa heurísticas de texto.** `isPublished:
  true` seguido de `unpublishedReason` en un `select` disparó el falso positivo
  de "escritura de publicación". Reordenar el `select` fue suficiente; no se
  tocó el test porque la heurística protege una regla real (D4).
- **Filtros combinados van en `AND`, no en un solo `OR`.** En
  `listarPerfilesAdmin`, búsqueda y provincia compartían `where.OR`: el
  resultado era la unión (perfiles de otra provincia que coincidían con el
  texto). Cada bloque va en su propio `OR` dentro de `AND`; el bug no lo detecta
  TypeScript ni el build, solo una prueba con datos reales.
- **`next build` puede tardar más de 10 minutos la primera vez.** La compilación
  y el chequeo de tipos pasan, pero la recolección de páginas es lenta en frío.
  No es un cuelgue: repetir con timeout largo y mirar la salida completa.

## 4.2 Soporte y moderación (2026-10-29)

**Depende de:** 4.1 (panel de administración, ya terminado). **Entrega:** tickets, bandeja unificada, SLA y manual de operaciones.

| Pieza | Dónde |
|-------|-------|
| Modelos `SupportTicket`, `TicketRespuesta`, `TicketPlantilla` + enums `TicketStatus`, `TicketPriority`, `TicketCategory` | `prisma/schema.prisma` |
| Número de trámite, días hábiles (SLA), etiquetas, esquema Zod compartido | `src/lib/soporte.ts` |
| Lógica: crear, listar, responder, cerrar, asignar, cambiar estado, plantillas, tickets fuera de SLA | `src/services/soporte.ts` |
| Server actions: crear ticket (público), responder/cerrar/asignar/cambiar estado (admin) | `src/app/actions/soporte.ts` |
| Centro de ayuda `/ayuda` con FAQ buscable (incluye "WhatsApp verificado") | `src/app/ayuda/page.tsx` |
| Formulario público `/soporte` (categoría "No puedo verificar mi número") | `src/app/soporte/page.tsx` |
| Bandeja `/admin/soporte`: filtros, respuestas con plantillas, asignación, cierre | `src/app/admin/soporte/page.tsx` |
| Emails: confirmación de ticket, respuesta del equipo, alerta de SLA | `src/lib/email.ts` |
| Job del cron que avisa de SLA vencido | `src/server/jobs/sla.ts` (registrado en `src/server/jobs/index.ts`) |
| Sección `soporte` en la matriz de admin y contador en el resumen `/admin` | `src/lib/admin.ts`, `src/services/admin.ts` |
| Manual de operaciones (2 páginas) | `docs/manual-operaciones-soporte.md` |
| Tests de lógica pura (13) | `tests/soporte.test.ts` |

Regla: los tickets abiertos sin sesión dejan nombre y email; el número de trámite se informa por email de confirmación. Las respuestas del equipo se envían por email al cliente. El SLA es 24 h hábiles (primera respuesta) y 72 h hábiles (resolución), configurable en `SiteSetting` clave `soporte_sla`.

## 4.3 Ajustes de precio con aviso (2026-10-30)

**Depende de:** 2.7 (cron diario) y 4.1 (panel de administración). **Entrega:** aumentos de precio programados con aviso previo.

| Pieza | Dónde |
|-------|-------|
| Enum `PriceChangeEstado` y modelo `PriceChange` (vinculado a `Plan`, no a `Subscription`) | `prisma/schema.prisma` |
| Método `actualizarPreapproval` en contrato y proveedores MP (real + mock) | `src/lib/mp/provider.ts`, `real.ts`, `mock.ts` |
| Lógica: crear, listar, cancelar aumentos; jobs de aviso y aplicación | `src/services/ajustes-precio.ts` |
| Emails: aviso de aumento (30 días antes) y confirmación de aplicación | `src/lib/email.ts` |
| Server actions: crear/cancelar aumento (solo ADMIN) | `src/app/actions/precios.ts` |
| Panel `/admin/precios`: formulario y lista de aumentos | `src/app/admin/precios/page.tsx` |
| Sección `precios` en matriz de admin (solo ADMIN) | `src/lib/admin.ts` |
| Jobs `avisos-aumento-precio` y `aplicar-aumento-precio` en el cron diario | `src/server/jobs/index.ts` |
| Tests de lógica pura (precio congelado, formateo) | `tests/ajustes-precio.test.ts` |

Reglas clave:
- El aviso se programa automáticamente 30 días antes de la aplicación; el admin elige la fecha de aplicación y se valida que cumpla el mínimo.
- El aviso y la aplicación son jobs del cron diario, idempotentes por estado (`PROGRAMADO` → `AVISADO` → `APLICADO`).
- El email de aviso va a todos los suscriptores `ACTIVE` del plan; el `EmailLog` evita duplicados si el cron se repite.
- Al aplicar, se actualiza `planAmount` de cada suscripción activa (salvo `priceFrozen` = socios fundadores, que no cambian) e intenta actualizar el preapproval de Mercado Pago (best-effort: si falla, el `planAmount` local sigue siendo la verdad).
- El checkout siempre lee el precio vigente de la base vía `getCurrentPlan()` / `montoVigente()` (módulo 2.2, sin tocar).
- Ningún monto está hardcodeado; `tests/reglas-proyecto.test.ts` lo garantiza.

## Siguiente

Según el orden maestro, tras 4.3 viene **4.4 Derechos del titular y borrado de datos** (Ley 25.326: acceso, rectificación, supresión, política de retención).

## 4.4 Derechos del titular y borrado de datos (2026-10-30)

**Depende de:** 2.6 (baja/arrepentimiento), 2.7 (cron diario) y 4.1 (panel de administración). **Entrega:** acceso, rectificación y supresión (Ley 25.326), con política de retención.

| Pieza | Dónde |
|-------|-------|
| Modelo `DataRequest` + enums `TipoDataRequest`, `EstadoDataRequest` | `prisma/schema.prisma` |
| Política de retención central (plazos por tipo de dato) | `src/lib/retention.ts` |
| Lógica: exportar datos (JSON), solicitar supresión, ejecutar supresión con anonimización | `src/services/privacidad.ts` |
| Emails: confirmación de supresión, constancia de supresión | `src/lib/email.ts` |
| Server action: solicitar supresión (usuario logueado) | `src/app/actions/privacidad.ts` |
| Ruta API: exportar datos JSON (`/api/panel/datos/exportar`) | `src/app/api/panel/datos/exportar/route.ts` |
| Página `/panel/cuenta/datos`: descargar + pedir supresión + política de retención | `src/app/panel/cuenta/datos/page.tsx` |
| Página de confirmación `/panel/cuenta/datos/eliminar-confirmar` (enlace firmado) | `src/app/panel/cuenta/datos/eliminar-confirmar/page.tsx` |
| Enlace en PanelNavbar; `/panel/cuenta` redirige a datos | `src/components/panel/PanelNavbar.tsx`, `src/app/panel/cuenta/page.tsx` |
| Tests de lógica pura (retención, hash en bloqueo) | `tests/retention.test.ts` |

Reglas clave:
- El titular pide supresión desde `/panel/cuenta/datos`. Se crea un `DataRequest` tipo SUPRESION en `PENDIENTE` y se envía email de confirmación con enlace firmado (30 días de gracia).
- Al confirmar, se anonimizan User y Profile (email/nombre → valores irreversibles, whatsappE164 borrado), se borran imágenes de Cloudinary, documentos de empresa, evidencias de reclamos, registros de WhatsAppVerification, votos y contactos del titular.
- Se conserva: facturas y pagos (plazo fiscal), hash en lista de bloqueo solo si el perfil fue suspendido por fraude.
- `isPublished` solo se escribe a través de `sincronizarPublicacion` (D4), nunca directamente.
- El derecho de acceso exporta JSON con datos del titular (sin emails/nombres de terceros).

## Siguiente

Según el orden maestro, tras 4.4 viene **4.5 SEO** — **TERMINADO** (2026-10-30).

- `src/app/sitemap.ts`: sitemap dinámico (rubros, provincia/rubro, provincia/ciudad/rubro solo con perfiles públicos, y perfiles publicados). `dynamic = 'force-dynamic'` para no requerir Postgres en el build.
- `src/app/robots.txt`: bloquea /panel, /admin, /api, /mis-contactos y apunta al sitemap.
- `src/app/page.tsx`: `generateMetadata` dinámico en la home.
- `src/app/[provincia]/[[...filtros]]/page.tsx`: texto introductorio único por combinación y `noindex` en resultados sin perfiles.
- `src/lib/perfil-publico.ts`: JSON-LD `Organization` y `BreadcrumbList` (LocalBusiness ya existía). Nunca teléfono ni `aggregateRating` ni "identidad verificada".
- `src/server/search.ts`: `construirDonde` (compartido por `searchProfiles` y `contarPerfilesPublicos`) y `contarPerfilesPublicos`.
- `tests/seo.test.ts`: 7 tests de lógica pura.

typecheck, lint, tests (395) y build en verde.

Siguiente: **4.6 Documentos legales** — **TERMINADO** (2026-10-30).

- `src/components/legales/PaginaLegal.tsx`: componente compartido con aviso de "BORRADOR — revisar con abogado antes de publicar", secciones y lista de puntos para el abogado. Estilo brutalist/editorial (D6), sin montos hardcodeados ni "identidad verificada".
- `src/app/terminos/page.tsx`: intermediario, WhatsApp verificado (no identidad), responsabilidades del profesional, contenido prohibido, suspensión/lista de bloqueo, defensa del consumidor, jurisdicción de Tucumán.
- `src/app/privacidad/page.tsx`: Ley 25.326, datos tratados, qué NO se trata (sin biométricos ni DNI), finalidades, proveedores externos y transferencia internacional, plazos de conservación (retención 4.4), derechos de acceso/rectificación/supresión, inscripción de la base ante AAIP.
- `src/app/politica-de-pagos/page.tsx`: suscripción mensual, renovación automática, aumentos con aviso 30 días, baja online, botón de arrepentimiento (10 días), reembolsos, facturación ARCA.
- Cada una lista puntos específicos para que un abogado revise antes de publicar.
- El footer ya enlazaba las tres rutas (`/terminos`, `/privacidad`, `/politica-de-pagos`).

typecheck, lint, tests (395) y build en verde.

Siguiente: **4.9 PWA, rendimiento y QA** — **TERMINADO** (2026-10-30).

- `public/manifest.json`: manifest de la aplicación (nombre, descripción, íconos SVG 192/512, colores, `display: standalone`, `es-AR`).
- `public/icon-192.svg`, `public/icon-512.svg`: íconos PWA placeholders (negro #0A0A0A + verde WhatsApp #25D366), para reemplazar por el logo real.
- `public/sw.js`: service worker manual (next-pwa descartado por incompatibilidad con Next.js 14: filtraba `reactStrictMode` a Workbox y rompía el build).
  - Estrategias: estáticos (`/_next/*`) caché primero 7 días; imágenes Cloudinary caché primero 30 días; búsqueda (`/buscar*`) red primero con caché de respaldo 1 h; pagos/sesiones/contacto/WhatsApp (`/api/*`) NUNCA se cachean.
- `src/components/legales/ServiceWorkerRegister.tsx` (`"use client"`): registra `/sw.js` en el navegador.
- `src/components/legales/InstalarApp.tsx` (`"use client"`): aviso discreto de "Instalar la app" (`beforeinstallprompt`), se muestra una vez (guarda en `localStorage`), no invasivo.
- `src/app/layout.tsx`: enlaza `/manifest.json`, `apple-touch-icon`, meta tags de Apple; registra el SW en el cuerpo.
- `src/app/not-found.tsx` y `src/app/error.tsx`: páginas de error con la marca del sitio (bordes gruesos, blanco y negro), sin stack traces al cliente, siempre con salida al buscador/home.
- `src/app/loading.tsx`: esqueleto de la home (categorías, esqueleto de cards) mientras carga el catálogo de la base.

Presupuesto verificado en el build: First Load JS compartido 87,3 kB (< 150 kB requerido). Imágenes optimizadas con AVIF/WebP y `deviceSizes` acotados en `next.config.mjs`.

typecheck, lint, tests (395) y build en verde.

Siguiente: **Fase 4 — Lanzamiento** (deploy a Vercel, monitoreo, facturación ARCA real, cupones, PWA en producción, soporte).

---

## Sesión 2026-11-05 — alta de espacios, pago manual y login por rol

**Estado: verificado y subido a GitHub.** Commit `a16bcda` en `main` de
`carlosdm121/poliserviciosnoa` (49 archivos). Typecheck, lint y **450 tests** en
verde.

### Qué quedó

| Pieza | Dónde |
|---|---|
| Alta de espacio por admin (nombre, email, ciudad, rubro; clave temporal) | `src/app/actions/admin/crear-perfil.ts`, `src/components/admin/FormularioCrearEspacio.tsx` |
| Suscripción nace `PENDING` (sin fechas) | `crear-perfil.ts` |
| Acreditación manual de pago | `src/app/actions/admin/acreditar-pago.ts` |
| Formulario de acreditación | `src/components/admin/FormularioAcreditarPago.tsx` |
| Lista "Espacios recientes" con estado y acreditación | `src/app/admin/espacios/page.tsx` |
| `PaymentMethod` + `Payment.mpPaymentId` opcional + `method/reference/registeredByEmail` | `prisma/schema.prisma` |
| Guard de reembolso para pagos manuales | `src/services/cancelaciones.ts` |
| Fix del bucle de login (`sessionVersion` en authorize/JWT) | `src/lib/auth.ts` |
| SW seguro + 403 por rol | `public/sw.js`, `src/app/no-autorizado/page.tsx` |

**Flujo:** admin crea el espacio → profesional recibe credenciales → completa
perfil/fotos/descripción en `/panel/espacio` → sigue `PENDING` y sin publicar →
cuando el admin ve la transferencia en el banco, "Acreditar pago" (método, monto,
N° de operación obligatorio en transferencia) → `ACTIVE` 30 días, `Payment`
`APPROVED`, auditoría `suscripcion.pago_manual`, aparece en Finanzas. La
acreditación es condicional: si ya está activa, rechaza la segunda.

**Por qué manual:** no hay forma de validar un comprobante de transferencia
desde el sistema; acreditar solo cuando el dinero está en el banco evita perfiles
fantasma y comprobantes falsos. El flujo de Mercado Pago sigue intacto para el
alta autoservicio.

**Límites:** el pago manual no emite `Invoice` de ARCA (solo los de MP) y el
reembolso es manual; `/arrepentimiento` muestra ese aviso en vez de intentar
devolver por MP. Finanzas suma `netAmount`, por eso el pago manual se registra
con `feeAmount: 0`.

**E2E verificado:** alta → `PENDING` → acreditar transferencia `OP-123456` →
`ACTIVE` 30 días exactos, pago con método/referencia/admin, auditoría presente y
fila "Activa hasta 04/12/2026".

### Próxima sesión (pedido del usuario)

- **Dar estilo a la página.** Respetar D6: Brutalist/Editorial, B/N y verde
  WhatsApp solo en el botón de contacto; bordes gruesos, sin radios ni sombras
  difusas, táctil 44px. Definir alcance (home/público, panel o admin) antes de
  tocar.
- Antes de probar: reiniciar `npm run dev` (se mató el server para regenerar
  Prisma), limpiar el service worker viejo una vez y volver a loguearse.
- Rotar el token de GitHub que se compartió en el chat; no guardarlo en el repo.
- Funcional pendiente del plan original: 3.5 invitación a valorar, 3.6 dashboard,
  3.7 reclamos; después Fase 4.

### Aprendizajes

- **El E2E encontró un formulario incompleto:** `FormularioAcreditarPago` no
  enviaba `profileId` (faltaba el hidden) y la acción respondía "Elegí el espacio
  a acreditar". Typecheck y tests no lo detectan; el flujo real sí.
- **`router.refresh()` puede borrar el mensaje de éxito** de un componente
  cliente al re-renderizar el servidor. La confirmación que queda es el estado de
  la fila ("Activa hasta ..."); no confiar solo en el cartel.
- **`prisma generate` da EPERM si el dev server está corriendo.** Matar el
  proceso que tiene tomada la DLL y regenerar.
- **Un test flaky aparece si `npm test` corre en paralelo con typecheck/lint**
  (contención de CPU). Correr `npm test` solo; 450/450.
- **No commitear artefactos:** `.tmp-*` quedó fuera; `.env` sigue ignorado.

