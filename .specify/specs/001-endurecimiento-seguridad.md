# Spec — Endurecimiento de seguridad (módulo 6.1, 20 puntos)

Proyecto: PoliserviciosNOA (`poliservicios-noa`)
Stack: Next.js 14 + TypeScript + Prisma + PostgreSQL + NextAuth + Vercel
Depende de: módulos 4.7 y 4.8 (tests existentes)
Entrega: código, SQL, configuración, scripts de CI, guía de limpieza de Git, tabla de verificación de los 20 puntos.

## Alcance

Implementar exactamente los 20 puntos agrupados en 4 bloques (A–D), tal como define `prompts/06-prompt-final-endurecimiento-seguridad.md`.

### Bloque A — Secretos y repositorio (puntos 1, 2, 3)

1. **Ocultar API keys**: `src/lib/env.ts` valida que ningún secreto tenga prefijo `NEXT_PUBLIC_` y falla el arranque si falta una variable de servidor. Script `scripts/check-client-bundle.ts` escanea `.next/static` tras el build y falla el CI si encuentra secretos. `.env*` en `.gitignore`; `.env.example` solo con nombres. Ningún secreto en logs, errores ni Sentry.
2. **Eliminar secretos del historial de Git**: guía paso a paso (rotar credenciales, detectar con gitleaks/trufflehog, limpiar con git filter-repo, force push, pre-commit hook, job de CI). No se ejecuta automáticamente; es documentación para el operador.
3. **"Key pública" para la base de datos**: roles SQL `app_runtime` (mínimo privilegio, no dueño, sin BYPASSRLS) y `app_migrator` (solo `prisma migrate deploy` vía `DIRECT_URL`). GRANT/REVOKE explícitos, `ALTER DEFAULT PRIVILEGES`, `FORCE ROW LEVEL SECURITY`, SSL `verify-full`.

### Bloque B — Base de datos y datos sensibles (puntos 4, 5, 7, 13)

4. **Activar RLS**: `ENABLE ROW LEVEL SECURITY` en todas las tablas del schema `public`. Deny-all para roles públicos. Políticas por propietario mediante variables de sesión `app.user_id` / `app.role`. Helper `withUser`/`withSystem` ya existe (`src/lib/db/rls.sql`). SQL de políticas en `prisma/migrations/` o archivo separado `policies.sql`. Tests SQL conectados como `app_runtime` probando que el usuario A no lee filas del usuario B.
5. **Encriptar datos sensibles**: ya implementado (`src/lib/db/encrypt.ts`, `scripts/encrypt-migrate.ts`). Campos cifrados: `whatsappE164`, `cuit`, `FiscalData.documento`, `FiscalData.domicilioFiscal`. Hashes HMAC (`whatsappHash`, `cuitHash`) para lookup. No cifrar lo que se busca.
7. **Restringir acceso a registros**: controles de propiedad centralizados, ninguna consulta por id sin filtrar por dueño (anti-IDOR), paginación con tope máximo (take <= 50), admin no exporta en masa sin registro en AuditLog, URLs firmadas efímeras para documentos privados.
13. **Parametrizar queries**: regla ESLint `no-unsafe-raw-queries` ya existe; registrarla en `.eslintrc.json`. Script `scripts/check-no-unsafe-queries.ts` ya existe. Test `sql-injection.test.ts` ya existe.

### Bloque C — Aplicación (puntos 6, 8, 9, 10, 11, 12, 14, 15, 16, 17)

6. **Forzar auth del lado del servidor**: `requireUser`/`requireRole` ya existen (`src/lib/session.ts`). Script de CI que recorre rutas y acciones y falla si falta guard o marca de "pública".
8. **Bloquear mass assignment**: Zod `.strict()` en schemas, ya implementado y testeado (`mass-assignment.test.ts`).
9. **Proteger cookies de sesión**: `httpOnly`, `secure` en prod, `sameSite lax`, `path /`, sin `domain`. Faltan: prefijo `__Host-`, verificación de Origin/Host (CSRF) en mutaciones.
10. **Hashear contraseñas**: bcryptjs (costo 12, argon2id no disponible en Vercel — justificado). Faltan: tokens de recuperación hashados, un solo uso, vencimiento 30-60 min.
11. **Rate limiting en login**: `src/lib/ratelimit.ts` existe (Upstash + fallback memoria). Faltan: límite por email+IP, `Retry-After`, respuesta idéntica exista o no el email, aviso por email de bloqueo temporal.
12. **Protección contra bots**: `src/lib/bots.ts` existe (detección por user-agent). Faltan: Turnstile/hCaptcha en registro/login después de 3 fallos, campo trampa (honeypot), tiempo mínimo de envío.
14. **Validar todos los inputs**: Zod en `src/schemas/`. Faltan: validación en todos los route handlers/server actions, script de CI que lo verifique, lista blanca para redirecciones (`returnTo`).
15. **Sanitizar contenido de usuario**: texto plano por defecto, sin `dangerouslySetInnerHTML` con datos de usuario. Faltan: JSON-LD escape de `<`, `rel="noopener noreferrer nofollow ugc"` en URLs, prevención de inyección de cabeceras de email, CSV injection.
16. **Restringir archivos subidos**: Cloudinary, nombres generados por servidor. Faltan: verificación de magic bytes, límites de tamaño (5 MB imágenes, 10 MB constancias), quitar EXIF, URLs firmadas para documentos privados, antivirus opcional.
17. **Devolver solo datos necesarios**: Prisma `select` con lista blanca. Faltan: DTOs explícitos por endpoint, test de contrato que falle si aparecen claves prohibidas (`whatsappE164`, `cuit`, `passwordHash`, etc.).

### Bloque D — Infraestructura (puntos 18, 19, 20)

18. **Security headers**: ya implementado (`src/lib/security-headers.ts`, middleware, test `security-headers.test.ts`). CSP en Report-Only por defecto.
19. **Forzar HTTPS**: HSTS, cookies secure ya están. Faltan: redirección 301 http→https y www→dominio en `vercel.json`, registro DNS CAA.
20. **Escanear dependencias**: `package-lock.json` versionado. Faltan: `npm audit` en CI, Dependabot/Renovate, OSV-Scanner/Snyk, CodeQL, gitleaks en CI, política de actualización.

## Criterios de aceptación (una fila por punto)

Cada punto: cómo se prueba, resultado esperado, archivo/test que lo cubre.

## Riesgos residuales

- RLS SQL requiere acceso a la base de producción para aplicar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` y crear roles.
- La limpieza del historial de Git (punto 2) es manual y requiere rotación previa de todas las credenciales expuestas.
- Turnstile/hCaptcha requiere claves de sitio/secreto del proveedor.
