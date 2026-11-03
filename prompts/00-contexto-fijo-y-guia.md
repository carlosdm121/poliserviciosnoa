# Portal de Poliservicios NOA — Guía, contexto fijo y orden maestro (v2, sin KYC)

Reemplazá `[NombrePagina]` por el nombre real antes de usar.

> **Cambio central de esta versión:** se elimina el KYC (DNI + reconocimiento facial). La validación pasa a ser por **titularidad del número de WhatsApp**. Esto cambia el modelo de datos, el orden del alta, las insignias, la búsqueda, el admin, los textos legales, los tests y el deploy. Todos los prompts de los archivos 01 a 05 ya están reescritos para eso.

---

## Cómo usar estos prompts

1. Abrí un chat nuevo en Space Bunny Free **por cada módulo** (no por semana ni por día).
2. Pegá primero el **CONTEXTO FIJO** (abajo).
3. Pegá el **ESTADO ACTUAL** (lo que ya existe: schema.prisma, estructura de carpetas, variables de entorno).
4. Pegá el prompt del módulo.
5. Revisá que se cumpla la línea **Depende de** del módulo antes de empezar.
6. Probá el resultado **antes** de pasar al siguiente. Si falla, usá el prompt de error.
7. Al terminar cada módulo, corré el prompt de revisión y actualizá el ESTADO ACTUAL.

Los módulos se numeran `Semana.Orden` (ej. 1.6) y el orden de este documento **es** el orden de ejecución. Ya no hay "Día N": con los módulos nuevos (facturación, baja, reclamos, derechos, soporte, PWA, cupones) el plan real son unas 5 semanas.

## Cómo está armado cada prompt

Todos siguen la misma anatomía, para que los modelos gratuitos no se pierdan:

- **Depende de / Entrega:** qué tiene que existir antes y qué deja listo.
- **TAREA:** el objetivo en una frase.
- **Requisitos y reglas de negocio:** numerados, verificables.
- **CRITERIOS:** pruebas de aceptación concretas (qué tiene que pasar y qué tiene que fallar).
- **SALIDA:** lista exacta de entregables.

Regla de oro: si tu modelo se cuelga o devuelve archivos cortados, dividí el módulo en 2 chats (primero modelo + servicios, después UI + tests).

---

## CONTEXTO FIJO (pegar siempre al inicio)

```
PROYECTO: "PoliserviciosNOA", portal de servicios (poliservicios) para
Tucumán, Salta, Santiago del Estero, Catamarca y Jujuy (Argentina).

NEGOCIO:
- Profesionales, oficios y empresas se registran y crean un perfil de
  tipo PERSON o COMPANY.
- VERIFICACIÓN POR WHATSAPP (no hay KYC): el profesional demuestra que
  controla su número enviando un código desde ese número al número de la
  plataforma (WhatsApp Cloud API). NO pedimos DNI, fotos ni datos
  biométricos. Lo que se verifica es la TITULARIDAD DEL NÚMERO, no la
  identidad civil. Por eso la insignia pública es "WhatsApp verificado"
  y NUNCA se escribe "identidad verificada" en la UI, el SEO, el JSON-LD
  ni los textos legales.
- Un número verificado pertenece a UN solo perfil (se guarda en formato
  E.164 y un hash HMAC para unicidad y lista de bloqueo).
- Rubros regulados: la matrícula se muestra como "Matrícula informada"
  (no verificada, salvo revisión manual del admin).
- Empresas: CUIT validado (dígito verificador) + constancia de
  inscripción revisada a mano por el admin → insignia "Empresa
  verificada".
- Suscripción mensual por Mercado Pago. El monto sale de la tabla Plan
  (valor inicial $10.000 ARS, configurable), nunca hardcodeado.
- Límites por perfil: 10 imágenes, 2 rubros (1 principal), 4
  subcategorías, 8 ciudades de cobertura.
- Los clientes buscan por rubro/provincia/ciudad y contactan por
  WhatsApp con el mensaje: "Hola, te vi en [NombrePagina] y me interesa
  tu servicio, quiero solicitar tus servicios".
- Confianza: corazón de clientes que contactaron (1 voto por cliente por
  profesional) y reclamos privados. No hay estrellas.
- La renovación es automática (débito Mercado Pago) y la página envía
  avisos por email antes del vencimiento.

REGLA DE PUBLICACIÓN (única fuente de verdad): un perfil está publicado
solo si: email verificado Y whatsappVerifiedAt Y perfil completo (rubro
principal, ciudad, descripción mínima, matrícula si el rubro la exige)
Y suscripción ACTIVE (o PAST_DUE dentro del período de gracia) Y
moderationStatus = APPROVED Y no suspendido. Existe UNA función pura
evaluatePublishability() y UNA consulta/predicado compartido
publicProfileWhere; ningún módulo duplica esta lógica.

STACK: Next.js 14+ (App Router), TypeScript estricto, Tailwind CSS,
Prisma, PostgreSQL, Auth.js (NextAuth), Zod, Cloudinary, Resend (emails),
Mercado Pago SDK, WhatsApp Cloud API (Meta), Upstash (rate limit),
Vercel (deploy).

REGLAS DE CÓDIGO:
- Todo el código en TypeScript estricto, sin `any`.
- Comentarios en español explicando el porqué de cada bloque.
- Validación con Zod en cliente Y servidor (nunca confiar en el cliente).
- Manejo de errores explícito con mensajes claros para el usuario.
- Secretos solo en variables de entorno, nunca en el código.
- Datos personales (teléfono, email) nunca en logs ni en Sentry.
- Mobile-first: el 90% de los usuarios entra desde el celular.
- Interfaz y textos en español rioplatense (vos).
- Todo job y todo webhook es idempotente.
- Antes de codear, listá en máximo 5 líneas los supuestos que tomaste
  (no me hagas preguntas salvo que algo bloquee). Después entregá
  archivos COMPLETOS con su ruta, no fragmentos.
```

## Plantilla de ESTADO ACTUAL

```
ESTADO ACTUAL:
- Módulos terminados: [lista, ej. 1.1 a 1.5]
- Estructura de carpetas: [pegar salida de `tree -L 3 src`]
- schema.prisma actual: [pegar completo]
- Variables de entorno definidas: [solo los nombres, sin valores]
- Funciones compartidas ya existentes: [evaluatePublishability,
  publicProfileWhere, normalizeArWhatsApp, rate limiter, logger...]
- Problemas conocidos: [si hay]
```

---

## Orden maestro de ejecución

| Módulo | Qué hace | Depende de |
|---|---|---|
| **SEMANA 1 — Base, acceso y verificación por WhatsApp** | | |
| 1.1 | Setup del proyecto | — |
| 1.2 | Modelo de datos núcleo | 1.1 |
| 1.3 | Seed de grupos, rubros y subcategorías | 1.2 |
| 1.4 | Seed de ciudades | 1.2 |
| 1.5 | Autenticación, roles y registro | 1.2 |
| 1.6 | Verificación de WhatsApp (reemplaza al KYC) | 1.5 |
| 1.7 | Antiabuso y revisión de alta | 1.6 |
| 1.8 | Panel de perfil (rubros, cobertura, persona/empresa) | 1.3, 1.4, 1.6 |
| 1.9 | Regla única de publicación | 1.8 |
| **SEMANA 2 — Imágenes, pagos y facturación** | | |
| 2.1 | Galería de imágenes | 1.9 |
| 2.2 | Planes y precio configurable | 1.9 |
| 2.3 | Suscripción con Mercado Pago | 2.2 |
| 2.4 | Webhook de Mercado Pago | 2.3 |
| 2.5 | Facturación electrónica | 2.4 |
| 2.6 | Baja online y arrepentimiento | 2.4, 2.5 |
| 2.7 | Cron diario: renovaciones y avisos | 2.4 |
| **SEMANA 3 — Contacto, confianza, búsqueda y perfil público** | | |
| 3.1 | Contactos y corazón (backend) | 2.4 |
| 3.2 | Card de profesional | 3.1 |
| 3.3 | Home y buscador | 3.2 |
| 3.4 | Perfil público | 3.2 |
| 3.5 | Invitación a valorar por email | 2.7, 3.1 |
| 3.6 | Dashboard del profesional | 3.1 |
| 3.7 | Reclamos y reportes | 3.4 |
| **SEMANA 4 — Administración, legales, seguridad y calidad** | | |
| 4.1 | Panel de administración | 3.7 |
| 4.2 | Soporte y moderación | 4.1 |
| 4.3 | Ajustes de precio con aviso | 2.7, 4.1 |
| 4.4 | Derechos del titular y borrado de datos | 4.1 |
| 4.5 | SEO | 3.3, 3.4 |
| 4.6 | Documentos legales | 4.4 |
| 4.7 | Seguridad | todo lo anterior |
| 4.8 | Tests | todo lo anterior |
| 4.9 | PWA, rendimiento y QA | 4.8 |
| **SEMANA 5 — Deploy y lanzamiento** | | |
| 5.1 | Deploy a producción | 4.9 |
| 5.2 | Monitoreo y respaldos | 5.1 |
| 5.3 | Plan de pruebas con pagos reales | 5.1 |
| 5.4 | Cupones, socios fundadores y reglas de apertura | 5.1 |
| 5.5 | Landing de captación y contenido | 5.4 |
| 5.6 | Piloto y mejoras | 5.5 |
| 5.7 | Auditoría final y checklist | 5.6 |

## Máquina de estados del alta (referencia para todos los módulos)

| Paso | Condición | Qué habilita |
|---|---|---|
| 1 | Registro + email verificado | Entrar a /panel |
| 2 | Perfil completo (rubro principal, ciudad, descripción, matrícula si aplica) | Poder verificar y pagar |
| 3 | WhatsApp verificado (1.6) | Poder pagar |
| 4 | Suscripción ACTIVE o cupón/mes de prueba | Poder publicarse |
| 5 | Aprobación manual (solo si el flag `requireManualApproval` está activo) | Publicación |
| 6 | Publicado | Aparece en búsqueda, cards y sitemap |

El paso 3 va **antes** del pago: es gratis y evita cobrar a alguien que después no puede publicarse.

## Qué cambió respecto de la versión con KYC

| Antes | Ahora |
|---|---|
| DNI + reconocimiento facial con proveedor externo | Código enviado desde el WhatsApp del profesional a la plataforma |
| `identityStatus`, `dniHash`, `KycAttempt` | `whatsappE164`, `whatsappHash`, `whatsappVerifiedAt`, `WhatsAppVerification` |
| Insignia "Identidad verificada" | Insignia "WhatsApp verificado" (y "Empresa verificada" para empresas revisadas) |
| Costos por verificación y panel de costos de KYC (M4) | Se elimina; no hay costo por verificación |
| Duplicados por hash de DNI | Duplicados por número de WhatsApp, CUIT, email y señales de riesgo |
| Webhook del proveedor KYC | Webhook de WhatsApp Cloud API (firma `X-Hub-Signature-256`) |
| Representante legal de empresa pasa KYC | Empresa: CUIT + constancia revisada a mano |
| Admin: "identidades duplicadas o rechazadas" | Admin: lista de bloqueo, señales de riesgo, aprobación manual de altas |
| Legales con datos biométricos | Legales sin biometría; se aclara que "WhatsApp verificado" no implica verificar identidad |

**Contrapeso por tener una validación más liviana:** unicidad de número, lista de bloqueo, aprobación manual opcional de las primeras altas, matrícula informada, reclamos, corazones solo de quienes contactaron, reportes y moderación.

---

## Prompt de revisión (usar al final de cada módulo)

```
Revisá el código que generaste recién como si fueras un revisor senior.
Buscá: bugs, casos borde sin manejar, fallas de seguridad (inyección,
IDOR, falta de autorización, condiciones de carrera), validaciones
faltantes, datos personales que se filtren a logs o respuestas, y
problemas de rendimiento. Verificá además que no haya ninguna referencia
residual a KYC, DNI o "identidad verificada", y que la lógica de
publicación use solo evaluatePublishability/publicProfileWhere.
Listá los problemas por gravedad y entregá los archivos corregidos
completos.
```

## Prompt de error (cuando algo falla)

```
Obtengo este error al [acción]:
[pegar error completo con stack trace]

Archivo involucrado: [pegar código]
Explicá la causa raíz en 3 líneas y dame el archivo corregido completo.
```

## Prompt de migración: retirar el KYC de un proyecto ya empezado

Usar **solo** si ya generaste código con el flujo anterior (Día 4 con KYC).

```
TAREA: El proyecto ya tiene código con KYC (DNI + reconocimiento
facial). Hay que retirarlo por completo y reemplazarlo por verificación
de titularidad del número de WhatsApp (módulos 1.6 y 1.7).

PASOS:
1. INVENTARIO: listá cada archivo, tabla, campo, variable de entorno,
   ruta, job, test y texto de UI que mencione KYC, DNI, identityStatus,
   dniHash, KycAttempt, proveedor KYC o "Identidad verificada". No
   modifiques nada todavía.
2. MIGRACIÓN PRISMA: eliminá los campos y tablas de KYC, agregá
   whatsappE164, whatsappHash (único), whatsappVerifiedAt a Profile y el
   modelo WhatsAppVerification. Los perfiles que estaban publicados NO se
   despublican de golpe: tienen 14 días de gracia (campo
   whatsappGraceUntil) y reciben un email pidiendo verificar el número.
3. REEMPLAZOS: consultas de búsqueda, cards, perfil público, JSON-LD,
   admin, cron, tests y emails pasan de "identidad VERIFIED" a
   "whatsappVerifiedAt no nulo" (o dentro de la gracia).
4. TEXTOS: insignia "WhatsApp verificado"; revisá legales y FAQ.
5. DATOS: lista de pasos para pedir al proveedor KYC la eliminación de
   las sesiones y datos asociados, y para borrar los webhooks y
   credenciales.
6. LIMPIEZA: variables de entorno, dependencias y rutas huérfanas.

CRITERIOS: una búsqueda global de "kyc", "dni" e "identity" no devuelve
código vivo; la app compila; los perfiles existentes siguen visibles
durante la gracia y se despublican si no verifican.

SALIDA: inventario, migración, archivos modificados completos y
checklist de verificación.
```
