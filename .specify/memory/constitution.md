# Constitución del proyecto — PoliserviciosNOA

Versión: 1.0.0
Fecha de ratificación: 2026-11-02
Última enmienda: 2026-11-02

## Principios

### P1 — Denegar por defecto
Todo acceso a datos, rutas y acciones está denegado por defecto. Solo se permite lo explícitamente autorizado. RLS en base de datos actúa como segunda barrera incluso si la aplicación tiene un bug.

### P2 — El navegador nunca habla con la base de datos
Ninguna credencial de base de datos llega al cliente. Prisma corre exclusivamente en el servidor. `DATABASE_URL`, `NEXTAUTH_SECRET` y secretos similares nunca llevan prefijo `NEXT_PUBLIC_`.

### P3 — Mínimo privilegio
La app se conecta a la base con el rol `app_runtime` (no dueño de tablas, sin `BYPASSRLS`, solo SELECT/INSERT/UPDATE/DELETE en tablas necesarias). `app_migrator` solo para `prisma migrate deploy` en CI mediante `DIRECT_URL`.

### P4 — Defensa en profundidad
Si una capa falla, la siguiente frena el ataque: RLS en BD + controles de propiedad en la aplicación + validación Zod en entrada + DTOs de salida.

### P5 — Ningún secreto en repositorio, cliente, logs ni Sentry
`.env*` en `.gitignore`; `.env.example` solo con nombres de variables. `server-only` en módulos de servidor. Script de CI escanea `.next/static` tras el build. Redactor de logger y `beforeSend` de Sentry eliminan secretos antes de enviarlos.

### P6 — Todo cambio nuevo trae un test que intenta el ataque y falla
Cada punto de seguridad (SQLi, IDOR, mass assignment, XSS, upload malicioso, fuerza bruta, etc.) tiene al menos un test adversarial que verifica que el ataque es rechazado.

### P7 — Validación con Zod en toda entrada
Body, query, params, FormData, cookies y headers relevantes validados con esquemas Zod `.strict()`. Prohibido pasar el body del request directamente a Prisma.

### P8 — SQL parametrizado siempre
Prohibido `$queryRawUnsafe` y `$executeRawUnsafe`. Reglas de ESLint rompen el CI. Columnas dinámicas y `ORDER BY` solo con lista blanca.

### P9 — Autenticación obligatoria del lado del servidor
Cada Server Component, Server Action y Route Handler no público llama a `requireUser`/`requireRole`, que re-consulta rol y estado a la base. Los componentes de cliente nunca deciden permisos.

### P10 — Stack mantenible por una PyME
Next.js + TypeScript + Prisma + PostgreSQL (Neon/Supabase) + Vercel. Sin Docker, Kubernetes ni microservicios. Hosting objetivo < U$D 20/mes.

## Gobernanza

- La constitución se modifica por enmienda registrada en este archivo.
- Cambios que eliminen o redefinan un principio suben la versión MAJOR.
- Nuevas secciones o expansión material suben la versión MINOR.
- Clarificaciones y correcciones de redacción suben PATCH.
- Cualquier modificación debe sincronizarse con `CLAUDE.md`, `decisions.md` y los templates de Spec Kit.
