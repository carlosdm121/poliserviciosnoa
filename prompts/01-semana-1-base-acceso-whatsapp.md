# Semana 1 — Base, datos, acceso y verificación por WhatsApp

Pegar siempre antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

> Este archivo reemplaza al antiguo "Semana 1" (que incluía el KYC en el Día 4) e integra el modelo de rubros, ciudades, cobertura y empresas desde el principio, para no tener que "adaptar" módulos después.

---

## Módulo 1.1 — Setup del proyecto

**Depende de:** nada. **Entrega:** esqueleto ejecutable con validación de entorno, logger y UI base.

```
TAREA: Dejá listo el esqueleto del proyecto.

1. Next.js 14+ (App Router), TypeScript con "strict": true y
   noUncheckedIndexedAccess, Tailwind, ESLint, Prettier, alias "@/".
2. Estructura: src/app, src/components (ui, shared), src/lib (db, auth,
   env, logger, rate-limit, phone, cuit, publishing), src/server
   (services, actions, jobs), src/emails, prisma/.
3. src/lib/env.ts: validá con Zod TODAS las variables al arrancar y
   fallá con un mensaje claro si falta alguna. Separá las públicas de
   las de servidor. Variables (solo nombres): DATABASE_URL, DIRECT_URL,
   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, RESEND_API_KEY,
   EMAIL_FROM, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
   CLOUDINARY_API_SECRET, MP_ACCESS_TOKEN, MP_PUBLIC_KEY,
   MP_WEBHOOK_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
   CRON_SECRET, SITE_URL, APP_NAME, WHATSAPP_PLATFORM_NUMBER,
   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET,
   WHATSAPP_WEBHOOK_VERIFY_TOKEN, PHONE_HASH_PEPPER,
   VOTE_MIN_HOURS_AFTER_CONTACT.
4. Prisma + PostgreSQL local con docker-compose y scripts npm (dev,
   build, typecheck, lint, test, db:migrate, db:seed).
5. Logger estructurado (JSON) con REDACCIÓN automática de campos:
   email, phone, whatsapp, token, authorization, code.
6. Limitador de tasa reutilizable sobre Upstash: función
   rateLimit(key, limit, windowSeconds) con fallback en memoria para
   desarrollo.
7. Layout base mobile-first: header, footer con enlaces a /terminos,
   /privacidad, /politica-de-pagos, "Darme de baja", "Botón de
   arrepentimiento" y "Libro de quejas" (todavía apuntan a páginas
   vacías), tokens de diseño en Tailwind, fuente optimizada con
   next/font y componentes base: Button, Input, Select, Dialog, Toast,
   Skeleton, Badge.
8. GitHub Actions: typecheck + lint + tests en cada push.
9. .env.example con los nombres y sin valores.

CRITERIOS: npm run dev, typecheck, lint y test pasan; si falta una
variable de entorno la app falla con un mensaje claro; el logger nunca
imprime un teléfono ni un email en claro.

SALIDA: archivos completos, comandos y README corto con los pasos para
levantar el entorno.
```

---

## Módulo 1.2 — Modelo de datos núcleo

**Depende de:** 1.1. **Entrega:** schema.prisma con usuarios, perfiles, taxonomía, cobertura, imágenes y tablas transversales. Los modelos de pagos, contactos, votos, reclamos, etc. se agregan en su propio módulo.

```
TAREA: Diseñá schema.prisma (PostgreSQL) para el núcleo del portal.

PRIMERO: devolveme un diagrama erDiagram en Mermaid y esperá mi
confirmación mental en la misma respuesta listando los supuestos; luego
entregá el schema completo.

ENUMS: Role (CLIENT | PROFESSIONAL | MODERATOR | ADMIN), ProfileType
(PERSON | COMPANY), Province (TUCUMAN | SALTA | SANTIAGO_DEL_ESTERO |
CATAMARCA | JUJUY), ModerationStatus (PENDING_REVIEW | APPROVED |
SUSPENDED), TeamSize (T1_5 | T6_20 | T21_50 | T50_PLUS),
WebhookProvider (MERCADOPAGO | WHATSAPP).

MODELOS:
- User, Account, Session, VerificationToken (adaptador de Auth.js).
  User: role (default CLIENT), emailVerified, passwordHash (opcional,
  solo profesionales), status (ACTIVE | BLOCKED), createdAt.
- Profile (1:1 con User profesional): type, slug único, displayName,
  description, baseCityId, coversWholeProvince (Boolean),
  coversOtherProvinces (Province[]), licenseNumber (String?),
  whatsappE164 (String?), whatsappHash (String? ÚNICO),
  whatsappVerifiedAt (DateTime?), moderationStatus, suspendedAt,
  suspensionReason, isPublished (Boolean, valor DERIVADO que recalcula
  un único servicio), publishedAt, heartsCount (Int 0), contactsCount
  (Int 0), whatsappClicks (Int 0), viewsCount (Int 0).
  NO existen campos de identidad civil: nada de DNI, hash de DNI ni
  estados de KYC.
- CompanyProfile (1:1 opcional con Profile): companyName, tradeName,
  cuit, cuitHash ÚNICO, logoUrl, teamSize, yearFounded?, website?,
  documentKey? (clave en almacenamiento privado), documentReviewedAt?,
  verifiedAt?, verifiedBy?.
- CategoryGroup (name, slug único, icon, sortOrder).
- Category (groupId, name, slug único, icon, sortOrder, isActive,
  requiresLicense, licenseLabel?).
- Subcategory (categoryId, name, slug único dentro del rubro, sortOrder,
  isActive).
- ProfileCategory (profileId, categoryId, isPrimary). Única
  (profileId, categoryId).
- ProfileSubcategory (profileId, subcategoryId). Máx. 4 por perfil.
- City (province, name, slug, sortOrder, isActive). Única
  (province, slug).
- ProfileCoverage (profileId, cityId). Única (profileId, cityId). Máx. 8.
- Image (profileId, publicId único, url, order, isHidden, createdAt).
- WebhookEvent (provider, externalId, payloadHash, status RECEIVED |
  PROCESSED | FAILED, processedAt). Única (provider, externalId).
- EmailLog (userId?, template, dedupeKey, sentAt). Única
  (template, dedupeKey) para no duplicar envíos.
- AuditLog (actorId, action, entityType, entityId, metadata Json,
  createdAt). Solo se inserta, nunca se actualiza.
- SiteSetting (key único, value Json), para banderas como
  requireManualApproval.

RESTRICCIONES QUE PRISMA NO EXPRESA (entregalas en SQL dentro de la
migración):
- Índice único parcial: una sola ProfileCategory con isPrimary = true por
  perfil.
- Exigí que la ciudad base pertenezca a una provincia válida (la
  validación de ciudad-provincia se hace en servidor; dejá el comentario).

ÍNDICES: Profile(isPublished, baseCityId), ProfileCategory(categoryId),
ProfileCoverage(cityId), City(province), Subcategory(categoryId),
Profile(heartsCount). Explicá cada uno en una línea. Agregá índice
trigram (pg_trgm) sobre displayName y description para la búsqueda.

CRITERIOS: la migración corre en una base vacía; el schema no contiene
ninguna columna de DNI ni de KYC; dos perfiles no pueden tener el mismo
whatsappHash ni el mismo cuitHash.

SALIDA: schema.prisma completo, migración (incluido el SQL parcial) y
explicación breve de cada índice.
```

---

## Módulo 1.3 — Seed de grupos, rubros y subcategorías

**Depende de:** 1.2. **Entrega:** `prisma/data/categories.ts` y `prisma/seed.ts` idempotentes.

> Nota: el plan original hablaba de "8 grupos" pero la lista tiene 7. Este prompt usa 7 grupos y 57 rubros. Si querés un octavo grupo, agregalo a la lista antes de pegar.

```
TAREA: Escribí prisma/seed.ts idempotente (upsert por slug, para poder
correrlo varias veces sin duplicar) que cargue estos 7 grupos y 57
rubros, TODOS con isActive=true, con ícono de lucide-react y sortOrder:

1. HOGAR Y CONSTRUCCIÓN
   Plomería; Electricidad; Gas matriculado (requiresLicense);
   Albañilería; Pintura; Carpintería; Herrería; Cerrajería;
   Aire acondicionado y refrigeración; Pisos y cerámicos;
   Durlock y yesería; Techistas e impermeabilización; Vidriería;
   Jardinería y poda; Pileteros; Control de plagas;
   Limpieza de hogares y oficinas; Tapicería;
   Alarmas y cámaras de seguridad.

2. TRANSPORTE Y MECÁNICA
   Fletes y mudanzas; Remises y traslados; Mecánica del automotor;
   Mecánica de motos; Gomería; Chapa y pintura; Auxilio mecánico;
   Lavadero de autos.

3. TECNOLOGÍA Y OFICINA
   Técnico en computación; Reparación de celulares;
   Diseño web y gráfico; Community manager;
   Contadores y gestoría (requiresLicense);
   Estudios jurídicos (requiresLicense); Traducciones.

4. SERVICIOS PERSONALES Y CUIDADO
   Peluquería y barbería; Manicura y estética; Masajistas;
   Cuidado de adultos mayores; Niñeras;
   Paseadores y cuidado de mascotas;
   Veterinarios a domicilio (requiresLicense); Entrenadores personales.

5. EDUCACIÓN
   Clases particulares; Idiomas; Música; Apoyo escolar.

6. EVENTOS Y GASTRONOMÍA
   Fotografía y video; DJ y sonido; Catering; Pastelería y tortas;
   Alquiler de livings y mobiliario; Animación infantil;
   Decoración de eventos.

7. TURISMO Y REGIONALES
   Guías turísticos (requiresLicense); Alquileres turísticos;
   Transporte turístico; Artesanías y productos regionales.

SUBCATEGORÍAS: para CADA rubro generá entre 3 y 6 subcategorías
realistas del mercado argentino. Nivel de detalle esperado:
- Plomería: Destapaciones; Instalación de agua y sanitarios; Cloacas y
  cámaras sépticas; Termotanques y calefones; Pérdidas y filtraciones.
- Electricidad: Instalaciones nuevas; Reparaciones y cortocircuitos;
  Tableros; Iluminación; Electricista industrial.
- Fletes y mudanzas: Mudanzas locales; Mudanzas entre provincias;
  Fletes pequeños; Traslado de muebles; Camión con hidrogrúa.
- Guías turísticos: Quebrada de Humahuaca; Valles Calchaquíes;
  Cerros y trekking; Circuitos históricos; Ruta del vino.

REQUISITOS:
- Cada rubro con slug sin tildes ni espacios (ej. aire-acondicionado).
- Los rubros regulados con licenseLabel adecuado (ej. "Matrícula de
  gasista").
- Los datos en `prisma/data/categories.ts` (estructura tipada) para
  editarlos sin tocar la lógica.

CRITERIOS: correr el seed dos veces deja exactamente 7 grupos, 57 rubros
y sus subcategorías, sin duplicados.

SALIDA: categories.ts y seed.ts completos.
```

---

## Módulo 1.4 — Seed de ciudades

**Depende de:** 1.2. **Entrega:** `prisma/data/cities.ts` y su carga idempotente.

```
TAREA: Agregá al seed la carga de ciudades (upsert por province+slug)
en `prisma/data/cities.ts`. Incluí como mínimo estas, con la capital
primero, y agregá todas las localidades relevantes de más de ~5.000
habitantes que recuerdes para cada provincia (marcalas en un comentario
para que yo las revise):

TUCUMÁN: San Miguel de Tucumán; Yerba Buena; Tafí Viejo;
Banda del Río Salí; Alderetes; Concepción; Monteros; Aguilares;
Famaillá; Lules; Tafí del Valle; Simoca; Bella Vista; Juan Bautista
Alberdi; Las Talitas.

SALTA: Salta Capital; San Lorenzo; Orán (San Ramón de la Nueva Orán);
Tartagal; General Güemes; Cafayate; Rosario de la Frontera;
Metán; Cerrillos; Embarcación; Rosario de Lerma; Cachi; San Antonio
de los Cobres.

SANTIAGO DEL ESTERO: Santiago del Estero Capital; La Banda;
Termas de Río Hondo; Frías; Añatuya; Fernández; Clodomira; Quimilí;
Loreto; Monte Quemado.

CATAMARCA: San Fernando del Valle de Catamarca; Belén; Tinogasta;
Andalgalá; Santa María; Recreo; Fiambalá; Valle Viejo; Fray Mamerto
Esquiú; Saujil.

JUJUY: San Salvador de Jujuy; Palpalá; San Pedro de Jujuy;
Libertador General San Martín; Perico; Humahuaca; Tilcara; Purmamarca;
La Quiaca; El Carmen; Abra Pampa; Monterrico.

Además agregá "Otra localidad" por provincia para cubrir zonas rurales
(con aviso en la UI de que el admin la asignará luego a una ciudad real).

CRITERIOS: correr el seed dos veces no duplica ciudades; cada ciudad
pertenece a una sola provincia y el slug es único dentro de ella.

SALIDA: cities.ts completo con tipado y la parte del seed.
```

---

## Módulo 1.5 — Autenticación, roles y registro

**Depende de:** 1.2. **Entrega:** ingreso para profesionales y clientes, protección de rutas y modal de ingreso reutilizable.

```
TAREA: Implementá la autenticación con Auth.js.

PROFESIONALES (rol PROFESSIONAL):
- Registro con email + contraseña (hash argon2id), validación Zod
  (contraseña mínima razonable), email de verificación con Resend y
  recuperación de contraseña por enlace de un solo uso con vencimiento.
- Al registrarse se crea User + Profile vacío (type elegido: PERSON o
  COMPANY), moderationStatus = PENDING_REVIEW, isPublished = false.
- Sin verificación de email no puede avanzar a pagar ni a publicar.

CLIENTES (rol CLIENT):
- Ingreso con Google (OAuth) y enlace mágico por email (Resend). Sin
  contraseña y sin verificación de identidad. Rol CLIENT por defecto.
- Rate limiting en el envío de enlaces mágicos: 3 por hora por email.
- Modal de ingreso reutilizable que se abre al tocar "WhatsApp" o el
  corazón sin sesión y VUELVE a la acción original tras ingresar
  (parámetro returnTo validado contra una lista de rutas internas).

AUTORIZACIÓN:
- Estrategia de sesión JWT con el rol en el token, PERO las acciones
  sensibles (pagos, admin, borrado) vuelven a leer el rol y el estado
  del usuario desde la base.
- Middleware: /panel solo PROFESSIONAL; /admin solo ADMIN y MODERADOR;
  /mis-contactos solo CLIENT. Un usuario BLOCKED no inicia sesión.
- Helpers requireUser, requireRole y requireProfessionalProfile para
  usar en todas las server actions.
- Rate limiting en login, registro y recuperación de contraseña.
- Cookies httpOnly, secure y sameSite.

CRITERIOS: un cliente logueado ve su nombre en el header con la opción
"Mis contactos y votos"; un cliente no puede entrar a /panel; un
profesional no puede entrar a /admin; el mensaje de error del login no
revela si el email existe.

SALIDA: archivos completos (config de Auth.js, acciones, páginas,
middleware, modal, plantillas de email) y tests de autorización.
```

---

## Módulo 1.6 — Verificación de WhatsApp (reemplaza al KYC)

**Depende de:** 1.5. **Entrega:** verificación de titularidad del número por mensaje entrante, con webhook de WhatsApp Cloud API y simulador para desarrollo.

> Antes de empezar, en Meta for Developers: crear la app, agregar el producto WhatsApp, dedicar un número a la plataforma (no puede usarse a la vez en la app de WhatsApp común), generar un token permanente con un usuario del sistema y suscribir el webhook al campo `messages`. Confirmá requisitos y costos vigentes en la documentación de Meta. Como el profesional **inicia** la conversación, la plataforma puede responder dentro de la ventana de 24 h sin plantilla.

### Prompt 1.6.1 — Utilidades de teléfono

```
TAREA: Creá src/lib/phone.ts con libphonenumber-js.

FUNCIONES:
1. normalizeArWhatsApp(input: string): devuelve E.164 canónico para
   celulares argentinos con formato +549XXXXXXXXXX, o un error tipado
   con mensaje en español. Debe aceptar: "381 4123456",
   "0381 15-4123456", "(381) 154123456", "+54 9 381 412 3456",
   "5493814123456" y "543814123456". Debe rechazar fijos y números de
   otros países.
2. arPhoneVariants(e164): devuelve las variantes con y sin el "9" tras el
   54, porque WhatsApp Cloud API a veces entrega el número del remitente
   sin ese 9. Toda comparación de números usa estas variantes.
3. hashPhone(e164): HMAC-SHA256 con PHONE_HASH_PEPPER sobre el canónico.
4. maskPhone(e164): "+54 9 381 ***-**56" para mostrar en UI y logs.

CRITERIOS: tests Vitest con al menos 15 entradas válidas e inválidas; el
hash es idéntico para las variantes con y sin 9.

SALIDA: phone.ts y sus tests.
```

### Prompt 1.6.2 — Modelo, flujo y webhook

```
TAREA: Implementá la verificación de titularidad del número de WhatsApp.

MODELO WhatsAppVerification: id, profileId, phoneE164, codeHash (HMAC
del código, nunca el código en claro), expiresAt (15 min), status
(PENDING | VERIFIED | EXPIRED | CANCELED | LOCKED), attempts (Int),
messageId (wamid, único, nullable), verifiedAt, createdAt. Índice en
(profileId, status).

FLUJO:
1. En /panel/perfil el profesional carga su número. El servidor lo
   normaliza (1.6.1), invalida verificaciones PENDING anteriores y crea
   una nueva con un código de 6 caracteres sacado de un alfabeto sin
   caracteres ambiguos (sin 0/O/1/I), generado con crypto.randomInt.
2. La UI muestra el código y un botón que abre
   https://wa.me/{WHATSAPP_PLATFORM_NUMBER}?text= con el texto
   "Verifico mi número en [NombrePagina]. Código: {CODIGO}" (codificado
   con encodeURIComponent), más instrucciones claras de 3 pasos y una
   cuenta regresiva de 15 minutos.
3. La UI consulta el estado cada 3 segundos (polling liviano contra una
   ruta autenticada que solo devuelve el estado) y al verificarse
   muestra la confirmación sin recargar.

WEBHOOK /api/webhooks/whatsapp:
- GET: handshake de Meta (hub.mode, hub.verify_token con
  WHATSAPP_WEBHOOK_VERIFY_TOKEN, devolver hub.challenge).
- POST: leé el cuerpo CRUDO, validá X-Hub-Signature-256 (HMAC-SHA256 con
  WHATSAPP_APP_SECRET, comparación con timingSafeEqual). Firma inválida
  → 401.
- Ignorá todo lo que no sea un mensaje de texto entrante (estados de
  entrega, reacciones, medios).
- Idempotencia: registrá el id del mensaje (wamid) en WebhookEvent; si
  ya existe, respondé 200 sin repetir.
- Extraé el código con una expresión tolerante a mayúsculas, espacios y
  puntuación. Buscá la verificación PENDING no vencida por codeHash.
- Comparación de remitente: el número que envía el mensaje (from) debe
  coincidir con phoneE164 usando arPhoneVariants. Si coincide, en UNA
  transacción: marcar VERIFIED, guardar whatsappE164, whatsappHash y
  whatsappVerifiedAt en Profile y cancelar otras PENDING.
- Si el hash ya existe en otro perfil (error P2002): NO verificar y
  responder por WhatsApp un mensaje genérico indicando que el número ya
  está asociado a otra cuenta y cómo contactar a soporte.
- Si el número no coincide: sumar attempts; al llegar a 5 pasar a LOCKED.
  Nunca revelar a quién pertenece un código ni qué número se esperaba.
- Responder al remitente con la API de WhatsApp Cloud (texto simple)
  "Número verificado. Ya podés volver a [NombrePagina]" o el mensaje de
  error correspondiente. Si falla el envío, igual queda verificado.
- Responder 200 rápido; ante error transitorio de base de datos devolver
  500 para que Meta reintente.

REGLAS:
- Si el profesional cambia el número, se borra whatsappVerifiedAt y
  whatsappHash y se recalcula la publicación (queda despublicado hasta
  reverificar).
- Rate limiting: 5 códigos por hora por perfil y 20 por día por IP.
- Una sola verificación PENDING por perfil.
- Sin whatsappVerifiedAt no se puede pagar ni publicar.

INTERFAZ PROVEEDOR: definí `VerificationProvider` con las implementaciones
WhatsAppInboundProvider (principal), ManualProvider (el admin marca el
número como verificado con registro en AuditLog y motivo) y
MockProvider para desarrollo y tests. Agregá una ruta
/api/dev/whatsapp-simulate que solo existe cuando NODE_ENV !== "production"
y permite simular un mensaje entrante con remitente y texto.

CRITERIOS:
- Un código solo sirve una vez, vence a los 15 minutos y se invalida tras
  5 intentos.
- Un webhook con firma falsa es rechazado con 401.
- Reenviar el mismo webhook 5 veces verifica una sola vez.
- Dos perfiles no pueden verificar el mismo número.
- Probar con las variantes +549... y +54... del remitente funciona.

SALIDA: modelo y migración, servicio, webhook, UI, simulador, proveedor,
tests con payloads de ejemplo de Meta y checklist corto de configuración
en Meta for Developers.
```

---

## Módulo 1.7 — Antiabuso y revisión de alta

**Depende de:** 1.6. **Entrega:** contrapesos que reemplazan lo que antes aportaba el KYC.

```
TAREA: Agregá las defensas contra cuentas falsas y estafadores, ahora
que la verificación es por WhatsApp y no por documento.

1. LISTA DE BLOQUEO: modelo BlockedIdentifier (type: WHATSAPP_HASH |
   EMAIL | CUIT_HASH, valueHash único por tipo, reason, createdBy,
   createdAt). Se consulta al registrar, al verificar el número y al
   cargar un CUIT. Un identificador bloqueado no puede verificar.
   Solo se agrega con acción del admin (AuditLog) cuando un perfil es
   suspendido por fraude.

2. PROTECCIÓN CONTRA SUPLANTACIÓN DEL NÚMERO: alguien podría cargar el
   número de otra persona e intentar que ella envíe el código. Mitigar:
   - Texto prellenado explícito en el mensaje de verificación.
   - Al verificarse un número, la plataforma envía al propio número un
     aviso: "Se verificó este número en [NombrePagina]. Si no fuiste
     vos, respondé NO FUI YO".
   - Si el titular responde NO FUI YO: liberar el número, despublicar el
     perfil implicado, marcarlo PENDING_REVIEW, agregar una señal de
     riesgo y avisar al admin.

3. SEÑALES DE RIESGO: modelo RiskSignal (profileId, type, details Json,
   createdAt, resolvedAt?). Tipos: EMAIL_DESECHABLE (lista de dominios
   configurable), MULTIPLES_ALTAS_MISMA_IP (hash de IP + user-agent con
   retención corta, 30 días), DESCRIPCION_CON_CONTACTO_EXTERNO
   (teléfonos, enlaces o @usuarios dentro de la descripción), NO_FUI_YO,
   REPORTES_MULTIPLES. Se muestran en /admin (módulo 4.1).

4. APROBACIÓN MANUAL CONFIGURABLE: SiteSetting `requireManualApproval`.
   Si está activo, un perfil que cumple todo queda en PENDING_REVIEW
   hasta que el admin lo apruebe. Para el lanzamiento se recomienda
   activarlo en las primeras altas y desactivarlo cuando el volumen
   crezca. El admin puede aprobar, rechazar con motivo (email al
   profesional) o suspender; todo con AuditLog.

5. REGLAS DE TEXTO: la descripción del perfil se sanea y se rechazan
   teléfonos/enlaces externos para evitar que se saltee el contacto por
   la plataforma (se informa el motivo con un mensaje claro).

CRITERIOS: un número en la lista de bloqueo no puede verificarse; "NO FUI
YO" despublica el perfil implicado y libera el número; con el flag
activo un perfil completo y pagado NO aparece hasta ser aprobado.

SALIDA: modelos, migración, servicios, cambios en el webhook de 1.6,
acciones del admin (solo servicios; la UI va en 4.1) y tests.
```

---

## Módulo 1.8 — Panel de perfil (rubros, cobertura, persona o empresa)

**Depende de:** 1.3, 1.4, 1.6. **Entrega:** /panel/perfil completo con selectores dependientes y validación transaccional.

```
TAREA: Construí /panel/perfil.

SECCIONES (formulario por pasos, guardado parcial, mobile-first):
1. Tipo y datos básicos: PERSON o COMPANY, nombre a mostrar, descripción
   (mínimo y máximo de caracteres).
   - COMPANY: razón social, nombre comercial, CUIT, logo, tamaño del
     equipo (1-5, 6-20, 21-50, 50+), año de fundación (opcional), sitio
     web (opcional) y carga de la constancia de inscripción en
     almacenamiento PRIVADO (no público) para revisión manual.
2. Ubicación: provincia → ciudad base (select dependiente: al cambiar la
   provincia se limpia la ciudad).
3. Zonas de cobertura: selector múltiple de ciudades agrupadas por
   provincia, contador "3/8", atajo "Toda la provincia" y opción de otras
   provincias habilitadas. La ciudad base cuenta como cubierta.
4. Rubros: RUBRO PRINCIPAL (obligatorio, combobox con buscador y
   agrupado por CategoryGroup) y RUBRO SECUNDARIO (opcional, distinto del
   principal). Contador "Rubros: 1/2".
5. Hasta 4 subcategorías (solo las de los rubros elegidos).
6. Matrícula: si algún rubro tiene requiresLicense, campo obligatorio con
   la etiqueta licenseLabel y la leyenda "Se mostrará como Matrícula
   informada".
7. WhatsApp: número + estado de verificación (módulo 1.6).

VALIDACIONES (Zod en cliente y servidor, y re-validación dentro de la
transacción):
- Máximo 2 rubros: bloqueá la fila del Profile con SELECT ... FOR UPDATE
  vía $queryRaw y dejá un comentario explicando la condición de carrera
  que evita (dos guardados simultáneos que superarían el límite).
- Máximo 4 subcategorías y máximo 8 ciudades de cobertura (misma técnica
  de bloqueo).
- La ciudad debe pertenecer a la provincia elegida.
- Las subcategorías deben pertenecer a los rubros elegidos.
- CUIT: 11 dígitos con dígito verificador (módulo 11) y prefijo de
  persona jurídica (30, 33, 34); src/lib/cuit.ts con tests de casos
  válidos e inválidos. Un CUIT no puede estar en dos perfiles (cuitHash)
  ni figurar en la lista de bloqueo.
- Si cambia el rubro o el tipo de perfil, se vuelve a evaluar la
  publicación.

REGLA DE PRIVACIDAD: los documentos de empresa se guardan con clave
privada y se borran al aprobar o rechazar la revisión, según la política
de retención del módulo 4.4.

CRITERIOS: enviar 3 rubros por la API devuelve error 400; un perfil sin
rubro principal no se puede publicar; cambiar de provincia limpia la
ciudad; un CUIT duplicado es rechazado.

SALIDA: componentes, server actions, validadores, cuit.ts y tests.
```

---

## Módulo 1.9 — Regla única de publicación

**Depende de:** 1.8. **Entrega:** la función y el predicado que usa TODO el proyecto.

```
TAREA: Centralizá la lógica de publicación.

1. src/lib/publishing.ts con evaluatePublishability(profile, now): función
   PURA que devuelve { publishable: boolean, reasons: string[] } con
   códigos de motivo (EMAIL_NO_VERIFICADO, WHATSAPP_NO_VERIFICADO,
   PERFIL_INCOMPLETO, MATRICULA_FALTANTE, SIN_SUSCRIPCION_ACTIVA,
   APROBACION_PENDIENTE, SUSPENDIDO). La suscripción cuenta si está
   ACTIVE, o PAST_DUE dentro del período de gracia configurable (por
   defecto 2 días). Perfil completo = rubro principal, ciudad base,
   descripción mínima y matrícula si el rubro la exige.
2. syncPublication(profileId): recalcula y actualiza isPublished y
   publishedAt dentro de una transacción. Es el ÚNICO lugar que escribe
   isPublished. Se invoca desde: webhook de pagos, cron, guardado del
   perfil, verificación de WhatsApp, acciones de moderación.
3. publicProfileWhere: predicado Prisma compartido (isPublished = true,
   whatsappVerifiedAt no nulo, moderationStatus = APPROVED, sin
   suspensión y suscripción vigente) que usan la búsqueda, el sitemap,
   las cards, el perfil público y la ruta de contacto. Ningún módulo
   reescribe estas condiciones.
4. En /panel, un checklist visual "Para publicar tu perfil" con cada
   motivo pendiente y un botón para resolverlo.
5. Test de tabla (Vitest) con al menos 20 combinaciones de estados.

CRITERIOS: cada motivo de no publicación aparece en el checklist; una
búsqueda en todo el código no encuentra isPublished escrito fuera de
syncPublication.

SALIDA: publishing.ts, predicado, checklist de UI y tests.
```
