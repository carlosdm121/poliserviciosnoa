# Prompt final — Endurecimiento de seguridad (20 puntos)

Pegar antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

**Cuándo usarlo:** después del módulo 4.8 (tests) y **antes del 5.1 (deploy)**. Así el historial de Git queda limpio antes de publicar y los tests existentes detectan regresiones. Volvé a pasarlo como verificación en el 5.7.

**Cómo usarlo:** es un solo prompt dividido en 4 bloques (A a D). El modelo entrega un bloque por vez y espera que escribas "siguiente". Si tu modelo gratuito corta las respuestas, pedí un bloque por chat nuevo (con el CONTEXTO FIJO y el ESTADO ACTUAL actualizado).

**Dos aclaraciones de adaptación al stack:**
- "Key pública para la base de datos" y "RLS" son patrones de Supabase (cliente en el navegador + políticas). En este proyecto el navegador **nunca** habla con la base: Prisma corre en el servidor. Por eso el prompt lo resuelve así: ninguna credencial de base de datos en el cliente, un rol de mínimo privilegio para la app, y RLS activado como segunda barrera (defensa en profundidad) que funciona tanto en Supabase como en Neon.
- Lo que está cifrado a nivel aplicación no se puede buscar. Por eso los datos que se usan para buscar o garantizar unicidad siguen usando los hashes HMAC que ya existen (whatsappHash, cuitHash).

---

## Módulo 6.1 — Endurecimiento final de seguridad

**Depende de:** 4.7 y 4.8. **Entrega:** código, SQL, configuración, scripts de CI, guía de limpieza de Git y tabla de verificación de los 20 puntos.

```
TAREA: Hacé el último pase de endurecimiento de seguridad sobre TODO el
proyecto. Cubrí exactamente los 20 puntos de abajo, agrupados en 4
bloques. Entregá UN bloque por vez, con archivos completos y su ruta,
una tabla de verificación del bloque y la lista de lo que quedó pendiente.
Después esperá que yo escriba "siguiente".

PRINCIPIOS (aplican a todo): denegar por defecto; el navegador nunca
habla con la base de datos; mínimo privilegio; defensa en profundidad
(si falla una capa, la siguiente frena el ataque); ningún secreto en el
repositorio, el cliente, los logs ni Sentry; todo cambio nuevo viene
con un test que intenta el ataque y falla.

============================================================
BLOQUE A — SECRETOS Y REPOSITORIO (puntos 1, 2 y 3)
============================================================

1. OCULTAR API KEYS
   - Auditá todo el código y todos los .env* buscando secretos
     escritos a mano o expuestos al cliente.
   - Solo llevan prefijo NEXT_PUBLIC_ los valores realmente públicos
     (nombre de cloud de Cloudinary, public key de Mercado Pago, site
     key del captcha). Todo lo demás es solo de servidor.
   - Agregá `import "server-only"` en cada módulo que use un secreto.
   - src/lib/env.ts (Zod) debe FALLAR el arranque si un secreto aparece
     con prefijo NEXT_PUBLIC_ o si falta una variable de servidor.
   - Script `scripts/check-client-bundle.ts` que, después del build,
     busca en .next/static patrones de secretos (claves de Mercado
     Pago, Resend, Cloudinary, tokens de Meta, cadenas de conexión) y
     hace fallar el CI si encuentra alguno.
   - .env* en .gitignore; .env.example solo con nombres.
   - Vercel: variables separadas por entorno (Production, Preview,
     Development) y marcadas como sensibles; nada compartido entre
     producción y preview.
   - Ningún secreto en logs, errores devueltos al cliente ni Sentry
     (revisá el redactor del logger y beforeSend de Sentry).

2. ELIMINAR SECRETOS DEL HISTORIAL DE GIT
   Entregá una guía paso a paso (no la ejecutes por tu cuenta) con este
   orden obligatorio:
   a) ROTAR PRIMERO todas las credenciales que alguna vez estuvieron en
      el repo: contraseña de la base de datos, AUTH_SECRET, Mercado
      Pago (access token y webhook secret), Resend, Cloudinary, token y
      app secret de Meta/WhatsApp, Upstash, CRON_SECRET. Reescribir el
      historial NO alcanza, porque un secreto filtrado debe darse por
      comprometido.
   b) Casos especiales: PHONE_HASH_PEPPER y la clave de cifrado de datos
      NO se pueden rotar sin migrar los datos; si alguno se filtró,
      dame el plan de re-hash o re-cifrado.
   c) Detectar con gitleaks o trufflehog sobre TODO el historial, todas
      las ramas y todos los tags.
   d) Limpiar con git filter-repo (o BFG) usando un archivo de
      reemplazos; mostrame los comandos exactos.
   e) Force push de todas las ramas y tags; revisar y borrar forks, PRs
      y caches; pedir a GitHub que purgue vistas en caché si el
      repositorio fue público.
   f) Todos los que colaboran vuelven a clonar (no hacer pull).
   g) Prevención: activar secret scanning y push protection en GitHub,
      hook pre-commit con gitleaks y un job de CI con gitleaks.

3. "KEY PÚBLICA" PARA LA BASE DE DATOS
   - Regla: el navegador no se conecta nunca a la base y ninguna
     credencial de base de datos llega al cliente.
   - Si se usa Supabase: no usar supabase-js en el navegador para tablas
     del negocio; si existe una anon/publishable key, solo funciona con
     RLS que deniega todo; la service_role key jamás va en el cliente ni
     en variables NEXT_PUBLIC_.
   - Si se usa Neon: sin acceso directo desde el cliente.
   - Entregá el SQL de dos roles: app_runtime (usado por la app en
     DATABASE_URL: solo SELECT/INSERT/UPDATE/DELETE sobre las tablas
     necesarias, sin DDL, sin BYPASSRLS, que NO sea el dueño de las
     tablas) y app_migrator (usado solo por `prisma migrate deploy` en
     CI/build mediante DIRECT_URL). Incluí los GRANT y REVOKE
     explícitos y el ALTER DEFAULT PRIVILEGES.
   - Conexión siempre con SSL (sslmode=require o verify-full).

============================================================
BLOQUE B — BASE DE DATOS Y DATOS SENSIBLES (puntos 4, 5, 7 y 13)
============================================================

4. ACTIVAR ROW LEVEL SECURITY (RLS)
   - ENABLE ROW LEVEL SECURITY en TODAS las tablas del schema public.
   - Deny-all para los roles públicos de la plataforma (anon,
     authenticated, public): sin políticas = sin acceso.
   - Para app_runtime: políticas por propietario que leen el usuario y
     el rol desde variables de sesión (set_config('app.user_id', ...,
     true) y set_config('app.role', ..., true) dentro de la transacción
     de cada request). Entregá el helper withUser(userId, role, fn) y
     withSystem(fn) para webhooks y cron (app.role = 'system').
   - Políticas mínimas: Profile (el dueño, o cualquiera si cumple el
     criterio de perfil público), Image, Subscription, Payment, Invoice
     y WhatsAppVerification (solo el dueño y ADMIN), ContactIntent,
     ProfileVote y Complaint (el cliente dueño), AuditLog (solo INSERT
     y SELECT para ADMIN), BlockedIdentifier y RiskSignal (solo staff).
   - Explicá por qué RLS no se aplica si la app se conecta con el dueño
     de las tablas o con un rol con BYPASSRLS, y dejá FORCE ROW LEVEL
     SECURITY si corresponde.
   - Tests SQL que se conectan COMO app_runtime y prueban que el
     usuario A no puede leer ni modificar filas del usuario B aunque la
     aplicación tenga un bug.

5. ENCRIPTAR DATOS SENSIBLES
   - AES-256-GCM a nivel aplicación con node:crypto. Clave de 32 bytes
     en DATA_ENCRYPTION_KEY (base64), IV aleatorio por valor, formato
     "v1:{keyId}:{iv}:{tag}:{ciphertext}" para soportar rotación de
     claves, y un script de re-cifrado.
   - Campos a cifrar: whatsappE164 (se descifra solo al redirigir en
     /api/contacto/[slug] y al exportar los datos del propio titular),
     datos fiscales (CUIT/CUIL/DNI fiscal y domicilio fiscal),
     CompanyProfile.cuit y cualquier dato personal de reclamos.
   - NO cifrar lo que se busca o se ordena: la unicidad y el lookup usan
     los hashes HMAC ya existentes (whatsappHash, cuitHash). El email
     queda en claro porque se usa para el login, con acceso restringido.
   - Las contraseñas NO se cifran: se hashean (punto 10).
   - Helpers encryptField/decryptField con tipos TypeScript estrictos;
     el valor descifrado nunca se loguea ni se devuelve en una respuesta
     salvo en los dos casos de arriba.
   - Script de migración idempotente para cifrar los datos que ya
     existan en claro.
   - Verificá y dejá documentado: cifrado en reposo y de backups del
     proveedor de base de datos.

7. RESTRINGIR EL ACCESO A LOS REGISTROS
   - Controles de propiedad centralizados (getOwnedProfile,
     getOwnedSubscription, etc.): ninguna consulta por id sin filtrar
     por el dueño (previene IDOR).
   - Listá TODAS las consultas que reciben un id desde el cliente con el
     control que aplica cada una.
   - Toda lista tiene paginación con tope máximo (por ejemplo take <= 50).
   - El admin no puede exportar datos en masa sin permiso explícito y
     registro en AuditLog; el MODERADOR no accede a pagos ni datos
     fiscales.
   - Documentos y evidencias privados solo por URL firmada de corta
     duración y con verificación de rol.

13. PARAMETRIZAR LAS QUERIES
   - Prisma sin concatenar strings. Todo $queryRaw usa tagged template
     (Prisma.sql) con parámetros, incluidos el bloqueo de filas
     SELECT ... FOR UPDATE y la búsqueda full-text/trigram.
   - Prohibido $queryRawUnsafe y $executeRawUnsafe: regla de ESLint que
     rompe el CI + test que lo verifica.
   - ORDER BY y columnas dinámicas solo con lista blanca.
   - Los LIKE/ILIKE escapan % y _ del input del usuario.
   - Test con payloads de inyección SQL en los campos de búsqueda,
     filtros y parámetros de URL.

============================================================
BLOQUE C — APLICACIÓN (puntos 6, 8, 9, 10, 11, 12, 14, 15, 16 y 17)
============================================================

6. FORZAR LA AUTENTICACIÓN DEL LADO DEL SERVIDOR
   - El middleware es solo la primera barrera, NUNCA la única.
   - Cada Server Component, server action y route handler que no sea
     público llama a requireUser/requireRole, que lee la sesión y
     vuelve a consultar rol y estado (ACTIVE/BLOCKED) a la base.
   - Nunca se decide un permiso con datos enviados por el cliente (rol,
     userId o profileId en el body o la URL).
   - Los componentes de cliente nunca deciden permisos: ocultar un botón
     no es seguridad.
   - Script de CI que recorre todas las rutas y acciones y FALLA si
     alguna no tiene un guard declarado o una marca explícita de
     "pública".

8. BLOQUEAR LA MANIPULACIÓN DE CAMPOS (mass assignment)
   - Zod con .strict() y lista explícita de campos permitidos por acción.
     Prohibido pasar el body de la request a prisma.create/update.
   - Campos que el cliente NUNCA puede escribir: role, status,
     moderationStatus, isPublished, publishedAt, heartsCount,
     contactsCount, whatsappClicks, viewsCount, whatsappVerifiedAt,
     whatsappHash, emailVerified, planId, planAmount, priceFrozen,
     userId, profileId, clientId y cualquier campo de montos o estados
     de pago. Los montos salen siempre del servidor.
   - Los estados cambian solo a través de servicios de dominio
     (syncPublication, webhooks, acciones de moderación).
   - Tests que envían campos extra y verifican que se rechazan (400) o
     se ignoran sin efecto.

9. PROTEGER LAS COOKIES DE SESIÓN
   - httpOnly, secure en producción, sameSite lax (strict donde no rompa
     el flujo), path "/", sin atributo domain, prefijo __Host- cuando
     sea posible, duración acotada y rotación.
   - Sin datos sensibles en el JWT: solo id, rol y una versión de sesión.
   - Campo sessionVersion en User: se incrementa al cambiar la
     contraseña, bloquear al usuario o cerrar sesión en todos los
     dispositivos, e invalida las sesiones anteriores.
   - Verificación de Origin/Host en todas las acciones y route handlers
     que modifican datos (protección CSRF).
   - Logout real que invalida la sesión.

10. HASHEAR LAS CONTRASEÑAS
   - argon2id con parámetros explícitos (memoria mínima 19 MiB, 2
     iteraciones, paralelismo 1, según OWASP) y rehash transparente al
     iniciar sesión si los parámetros cambian.
   - Comparación en tiempo constante; si el usuario no existe, hacer
     igualmente un hash falso para que el tiempo de respuesta no revele
     si el email está registrado.
   - Política: mínimo 10 caracteres y rechazo de contraseñas comunes
     (lista local; chequeo k-anonymity de Have I Been Pwned opcional).
   - Tokens de recuperación: se guardan HASHEADOS, un solo uso, vencen a
     los 30-60 minutos y al usarse invalidan las sesiones (sessionVersion).

11. RATE LIMITING EN EL LOGIN
   - Upstash con ventana deslizante, por IP y por email (usar el hash
     del email como clave): por ejemplo 5 intentos cada 15 minutos por
     email+IP y 20 por IP, con espera progresiva y bloqueo temporal.
   - Respuesta idéntica exista o no el email; encabezado Retry-After.
   - Mismo mecanismo en registro, recuperación de contraseña, enlaces
     mágicos, generación de códigos de verificación de WhatsApp,
     contacto, votos, reportes, reclamos, soporte y subida de archivos.
   - Si Upstash no responde: el login falla cerrado o pasa a un límite
     local conservador, y se registra una alerta.
   - Aviso por email al usuario cuando su cuenta fue bloqueada
     temporalmente por intentos fallidos.

12. PROTECCIÓN CONTRA BOTS
   - Cloudflare Turnstile (o hCaptcha) en registro, login después de 3
     fallos, enlace mágico, recuperación de contraseña, soporte,
     reportes y reclamos.
   - El token se verifica SIEMPRE en el servidor (siteverify) con el
     secreto en variables de entorno, es de un solo uso y falla cerrado.
   - Además: campo trampa (honeypot) y tiempo mínimo de envío del
     formulario.
   - /api/contacto/[slug] no lleva captcha (es una redirección): se
     protege con rate limiting y con la regla de no contar bots. Los
     webhooks quedan fuera del captcha y se protegen con su firma.

14. VALIDAR TODOS LOS INPUTS
   - Zod en TODA entrada: body, query, params, FormData, cookies y
     headers relevantes. Esquemas compartidos entre cliente y servidor.
   - Límites de longitud, de tamaño de body y de cantidad de elementos;
     enums cerrados; ids con formato validado; normalización (trim,
     Unicode NFKC).
   - Redirecciones (returnTo, back_url) solo contra lista blanca de
     rutas internas.
   - Errores hacia el cliente genéricos y en español; el detalle solo
     en logs.
   - Script de CI que verifica que cada route handler y server action
     importa y usa un esquema.

15. SANITIZAR EL CONTENIDO DEL USUARIO
   - Texto plano por defecto. Prohibido dangerouslySetInnerHTML con
     datos de usuario. Si alguna vez se permite formato, solo con
     sanitize-html o DOMPurify con lista blanca mínima.
   - Descripciones: sin HTML, sin enlaces ni teléfonos externos
     (coherente con el módulo 1.7).
   - JSON-LD: serializar con escape de "<" para que no cierre el
     <script>.
   - URLs de usuario (sitio web): solo http/https, con
     rel="noopener noreferrer nofollow ugc".
   - Emails: escapar el HTML en las plantillas y prevenir inyección de
     cabeceras (sin saltos de línea en asunto ni destinatario).
   - Exportaciones CSV: prevenir CSV injection (prefijar con comilla
     simple los valores que empiezan con =, +, - o @).

16. RESTRINGIR LOS ARCHIVOS QUE SE PUEDEN SUBIR
   - Lista blanca de tipo MIME y extensión, MÁS verificación de la firma
     real del archivo (magic bytes) en el servidor: no confiar en el
     Content-Type del cliente.
   - Imágenes: jpg, png y webp, máx. 5 MB. Constancias de empresa: pdf,
     jpg o png, máx. 10 MB. Sin SVG, HTML, ejecutables ni archivos
     comprimidos.
   - Nombres generados por el servidor; el nombre original se descarta.
   - Preset de Cloudinary restringido (ya definido) y validación
     posterior con su API (formato, bytes, carpeta del perfil).
   - Quitar metadatos EXIF (ubicación, dispositivo) de las imágenes.
   - Documentos y evidencias como recursos privados con URL firmada
     efímera.
   - Cuotas y rate limiting por usuario; job que borra archivos
     huérfanos. Antivirus opcional para constancias (ClamAV o servicio
     externo), indicando cómo integrarlo.

17. DEVOLVER SOLO LOS DATOS NECESARIOS EN LAS RESPUESTAS
   - DTOs explícitos por endpoint y por página; en Prisma, `select` con
     lista blanca, nunca devolver el modelo completo.
   - Campos que NUNCA salen en una respuesta pública: passwordHash,
     whatsappE164 (solo en la redirección de contacto), whatsappHash,
     cuit, datos fiscales, emails de otros usuarios, clientId en votos y
     reclamos hacia el profesional, ids internos de pago de Mercado Pago
     y tokens.
   - Serialización centralizada y errores sin stack trace ni mensajes
     internos de Prisma (mapear los códigos a mensajes genéricos).
   - Test de contrato que recorre las respuestas y FALLA si aparece
     alguna clave de una lista de claves prohibidas.

============================================================
BLOQUE D — INFRAESTRUCTURA (puntos 18, 19 y 20)
============================================================

18. SECURITY HEADERS
   - Middleware con nonce por request y CSP estricta: default-src
     'self'; script-src con nonce y 'strict-dynamic'; img-src 'self'
     data: res.cloudinary.com; connect-src solo los orígenes realmente
     usados (propio, Sentry, Mercado Pago); frame-src Mercado Pago y
     Turnstile; object-src 'none'; base-uri 'self'; form-action 'self'
     y Mercado Pago; frame-ancestors 'none'; upgrade-insecure-requests.
   - Primero en modo Report-Only con un endpoint de reportes, y recién
     después de revisar las violaciones pasar a modo enforce.
   - Strict-Transport-Security (max-age de 2 años, includeSubDomains,
     preload solo cuando el dominio esté listo), X-Content-Type-Options
     nosniff, Referrer-Policy strict-origin-when-cross-origin,
     Permissions-Policy que apague cámara, micrófono y geolocalización,
     Cross-Origin-Opener-Policy y Cross-Origin-Resource-Policy.
   - poweredByHeader desactivado; Cache-Control: no-store en rutas
     autenticadas y en respuestas con datos personales.

19. FORZAR HTTPS
   - Redirección 301 de http a https y de www al dominio principal en
     Vercel/DNS; HSTS; cookies secure; SITE_URL siempre con https.
   - Base de datos con SSL (verify-full si el proveedor lo permite);
     webhooks y callbacks solo por https; sin contenido mixto.
   - Registro DNS CAA. Explicá cómo verificar el resultado (SSL Labs y
     securityheaders.com) y qué nota se espera.

20. ESCANEAR DEPENDENCIAS
   - `npm audit --audit-level=high` en el CI (falla en alta o crítica).
   - package-lock.json versionado e instalación con `npm ci`;
     versiones fijas o rangos acotados.
   - Dependabot o Renovate con agrupación y revisión semanal; las
     correcciones de seguridad se aplican en menos de 48 horas.
   - OSV-Scanner o Snyk como segundo escáner, CodeQL para análisis
     estático del código y gitleaks también en el CI.
   - `npm audit signatures` y revisión de scripts postinstall (usar
     ignore-scripts donde sea posible). No instalar versiones publicadas
     hace menos de 2 semanas.
   - Documento corto con la política de actualización.

============================================================
CRITERIOS DE ACEPTACIÓN (devolvé esta tabla completa al final)
============================================================
Una fila por cada uno de los 20 puntos con tres columnas: cómo se prueba,
resultado esperado y archivo o test que lo cubre. Ejemplos del nivel de
detalle esperado:
- Punto 4: conectado como app_runtime, SELECT en la tabla Subscription
  de otro usuario devuelve 0 filas.
- Punto 8: enviar role=ADMIN en el body del perfil devuelve 400 y el rol
  no cambia.
- Punto 11: el intento número 6 de login devuelve 429 con Retry-After.
- Punto 16: un archivo .exe renombrado a .jpg es rechazado por su firma.
- Punto 17: el test de contrato falla si /api/... devuelve whatsappE164.

SALIDA POR BLOQUE: archivos completos con su ruta, SQL de las
migraciones, scripts de CI, tests, tabla de verificación del bloque y
lista de riesgos residuales.
```

---

## Verificación adversarial (opcional, correrlo al terminar los 4 bloques)

```
TAREA: Actuá como un pentester que audita este proyecto, con el código
completo como entrada. Intentá, en el código y en los tests, estos
ataques e indicame para cada uno si es posible, cómo y cómo se corrige:

1. Leer o modificar datos de otro usuario cambiando un id (IDOR).
2. Elevar privilegios enviando campos extra (role, isPublished,
   heartsCount, planAmount, whatsappVerifiedAt).
3. Inyección SQL en búsqueda, filtros y parámetros de rutas.
4. XSS guardado en descripción, nombre, motivo de reclamo y URL de sitio
   web.
5. Subida de archivos disfrazados (.exe como .jpg, SVG con script, PDF
   malicioso).
6. Fuerza bruta de login, de códigos de verificación de WhatsApp y de
   enlaces mágicos.
7. Enumeración de emails y de números de WhatsApp registrados.
8. Robo de sesión y CSRF contra acciones que modifican datos.
9. Webhooks falsos de Mercado Pago y de WhatsApp.
10. Acceso a documentos privados sin URL firmada o con una vencida.
11. Scraping masivo de números de WhatsApp de los profesionales.
12. Secretos en el bundle del cliente, en logs o en el historial de Git.

SALIDA: tabla de hallazgos por gravedad (crítico, alto, medio, bajo) con
archivo, causa y corrección completa.
```
