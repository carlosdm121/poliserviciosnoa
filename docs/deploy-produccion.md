# Deploy a producción — PoliserviciosNOA

Guía paso a paso para llevar el portal a Vercel con PostgreSQL gestionado
(Neon o Supabase). Cada paso es verificable; no avancé al siguiente hasta que
el anterior esté verde.

> Esta guía asume que Fase 4 está completa (4.1 a 4.9 en verde, typecheck,
> lint, tests y build pasan). El módulo que habilita este deploy es el
> **5.1 — Deploy a producción**, que depende de 4.9.

---

## 1. Variables de entorno de producción

Cargá en Vercel (Configuración → Variables de entorno) todas estas claves,
sin valores acá —los valores los tenés en `.env` local y los conseguís de cada
proveedor:

| Variable | Origen | Nota |
|---|---|---|
| `DATABASE_URL` | Neon / Supabase | String de conexión con pooling (ver punto 8) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | Secreto de sesión |
| `NEXTAUTH_URL` | `https://tudominio.com` | URL base de la app |
| `RESEND_API_KEY` | Resend | Para emails transaccionales |
| `MP_ACCESS_TOKEN` | Mercado Pago | Token de la cuenta de producción |
| `MP_WEBHOOK_SECRET` | Mercado Pago | Secreto para validar firmas del webhook |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary | |
| `CLOUDINARY_API_KEY` | Cloudinary | |
| `CLOUDINARY_API_SECRET` | Cloudinary | |
| `UPSTASH_REDIS_REST_URL` | Upstash | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash | |
| `PHONE_HASH_PEPPER` | `openssl rand -hex 32` | **CRÍTICO**: no cambiar nunca después de tener datos. Invalida todos los hashes de teléfonos y códigos, y rompería la verificación de WhatsApp y la lista de bloqueo |
| `CRON_SECRET` | Cualquiera fuerte | Protege los endpoints de cron |
| `WHATSAPP_PLATFORM_NUMBER` | Meta | Número de la plataforma en E.164 sin signos |
| `WHATSAPP_PLATFORM_PHONE_ID` | Meta | ID del número de teléfono |
| `WHATSAPP_ACCESS_TOKEN` | Meta | Token permanente de usuario del sistema |
| `WHATSAPP_APP_SECRET` | Meta | Para validar firmas del webhook de WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Meta | Token que vos elegís para el handshake GET del webhook |
| `ARCA_ACCESS_TOKEN` | Afip SDK | Solo si usás facturación real (`ARCA_REAL=1`) |
| `ARCA_CUIT` | Afip SDK | |
| `ARCA_PUNTO_VENTA` | Afip SDK | |
| `ARCA_TIPO_COMPROBANTE` | Afip SDK | |
| `ARCA_RAZON_SOCIAL` | Afip SDK | |
| `SUBSCRIPTION_AMOUNT` | Vos | Monto del plan, ej. `10000` |
| `SUBSCRIPTION_CURRENCY` | Vos | `ARS` |

Las variables de WhatsApp y ARCA son opcionales en tiempo de build (`SERVER_`
opcional en `src/lib/env.ts`), pero sin ellas en runtime el webhook de WhatsApp
devuelve 401 y la facturación queda en `FAILED` con reintentos.

## 2. Dominio, DNS, HTTPS y redirección www

1. Conectá el repo a Vercel e importalo.
2. Agregá el dominio (ej. `poliserviciosnoa.com`) en Configuración → Dominios.
3. Vercel te da los registros DNS (A y CNAME). Configurálos en tu proveedor de DNS.
4. Activá HTTPS (Vercel lo gestiona automáticamente con Let's Encrypt).
5. Redirección `www` → dominio raíz (o al revés), elegí una y redirigí la otra. Nunca dejar ambas resolviendo: divide cookies de sesión y SEO.

Verificá que `https://tudominio.com` responde y que `NEXTAUTH_URL` coincida exactamente con el dominio final.

## 3. Migraciones: migrar primero, desplegar después

Este proyecto no usa una carpeta de migraciones versionadas (usa `prisma db
push` en desarrollo, como hace `scripts/verificar.ts`). Antes del **primer**
deploy a producción:

1. Creá una migración inicial: corré `npx prisma migrate dev` localmente contra
   una copia de la base de producción (o una base vacía con el mismo schema).
   Esto genera `prisma/migrations/migration_init/`.
2. Subí la carpeta `prisma/migrations/` al repo.
3. En Vercel, el build corre `prisma generate && next build`. Antes de desplegar,
   corré `prisma migrate deploy` una sola vez contra la base de producción para
   aplicar el schema inicial.

En deploys subsiguientes, si agregaste un modelo o un campo (como `CronJobRun`),
generá la migración con `prisma migrate dev`, subila al repo, y `prisma
migrate deploy` la aplicará en el siguiente build.

Estrategia para no perder datos:

- Nunca corrá `prisma migrate reset` ni `prisma db push` en producción. `db
  push` puede borrar datos si hay cambios destructivos.
- `prisma migrate deploy` solo agrega, nunca borra tablas ni columnas.
- Si una migración falla en Vercel, el build se corta y no se despliega nada:
  la base queda en el estado anterior y la app anterior sigue funcionando.

## 4. vercel.json: cron diario y región

El `vercel.json` ya tiene los dos crons:

```json
{
  "crons": [
    { "path": "/api/cron/facturacion", "schedule": "0 9 * * *" },
    { "path": "/api/cron/daily", "schedule": "0 12 * * *" }
  ]
}
```

- `/api/cron/daily` a las 09:00 ART (UTC-3): avisos de vencimiento, expiración de suscripciones y limpieza. Protegido con `CRON_SECRET`.
- `/api/cron/facturacion` a las 06:00 ART: reintenta facturas pendientes de ARCA.

Región: elegí **São Paulo (South America)** si está disponible en tu plan de Vercel, para que la app y la base de datos estén cerca y no pagues tráfico intercontinental.

## 5. Webhooks de producción

Cargá estas URLs en cada proveedor, todas bajo `https://tudominio.com`:

| Proveedor | URL | Qué configurar |
|---|---|---|
| Mercado Pago | `/api/webhooks/mercadopago` | Notificación de pagos. Usá `MP_WEBHOOK_SECRET` para firmar. |
| Meta WhatsApp | `/api/webhooks/whatsapp` | Verify token = `WHATSAPP_VERIFY_TOKEN`. Suscribite al campo `messages`. |

**Handshake GET de Meta:** cuando agregás el webhook, Meta hace un `GET` a la ruta con `hub.mode=subscribe`, `hub.challenge` y `hub.verify_token`. La ruta debe devolver el `hub.challenge` solo si el `hub.verify_token` coincide con `WHATSAPP_VERIFY_TOKEN`. Probá con `curl`:

```bash
curl "https://tudominio.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=PRUEBA123&hub.verify_token=MI_TOKEN"
# Esperado: PRUEBA123
```

Si el token no coincide, responde 401 y no toca la base.

## 6. WhatsApp Cloud API en producción (Meta)

Requisitos antes de salir a público:

- **Número dedicado de la plataforma:** no uses tu celular personal. Es el número desde el que los profesionales reciben el código de verificación y el que figura en el enlace `wa.me` de contacto.
- **Token permanente de usuario del sistema:** generalo en Meta for Developers y guardalo en `WHATSAPP_ACCESS_TOKEN`.
- **Nombre de perfil de empresa:** configuralo en el panel de Meta para que los mensajes salgan con el nombre del portal, no con un número desconocido.
- **Pasar de modo prueba a producción:** Meta puede exigir verificación del negocio y respetar límites de mensajes (plantillas aprobadas, ventanas de 24 h para respuestas gratuitas). Confirmá cada requisito en la documentación vigente de Meta antes del lanzamiento; no asumas que lo que funciona en modo prueba funciona igual en producción.

El webhook de WhatsApp ya valida la firma con `WHATSAPP_APP_SECRET`; si falta o no coincide, devuelve 401.

## 7. Dominio verificado en Resend (SPF, DKIM, DMARC)

Para que los emails (confirmación de suscripción, avisos de vencimiento, notas de crédito, soporte) no caigan en spam:

1. En Resend, agregá y verificá tu dominio (`tudominio.com`).
2. Copiá los registros DNS que Resend te da y creálos en tu proveedor de DNS:
   - **SPF:** `v=spf1 include:_spf.resend.com ~all`
   - **DKIM:** el registro CNAME que te da Resend.
   - **DMARC:** `v=DMARC1; p=quarantine; rua=mailto:dmarc@tudominio.com` (ajustá `p` a `reject` solo cuando confirmes que nada legítimo falla).
3. Verificá en Resend que todos los registros estén en verde antes de enviar emails reales.

La dirección de remitente se configura con `EMAIL_FROM` (default: `PoliserviciosNOA <no-reply@tudominio.com>`).

## 8. Pooling de conexiones de la base de datos

Usá un PostgreSQL gestionado con **connection pooling** (Neon o Supabase lo incluyen por defecto). `DATABASE_URL` tiene que apuntar al endpoint con pooler (puerto 5432 o el de pooling), no al directo, para evitar agotar conexiones bajo carga de serverless.

Prisma abre una conexión por ejecución de serverless function; con pooling y `pgBouncer` en modo transacción se evita el error "too many clients".

## 9. /api/dev/* no existe en producción y aprobación manual activa

- **Rutas de desarrollo:** `/api/dev/whatsapp-simulate` existe solo para probar sin Meta. En producción devuelve `404` (ver `src/app/api/dev/whatsapp-simulate/route.ts`, línea 32-34). Verificá que `https://tudominio.com/api/dev/whatsapp-simulate` devuelve 404 y no expone el simulador.
- **`requireManualApproval` activo para el arranque:** el seed crea el `SiteSetting` clave `requireManualApproval` en `true`, así que cada perfil nuevo nace en `PENDING_REVIEW` y no se publica hasta que un administrador lo apruebe desde el panel (`/admin`). Confirmá en la base de producción que la fila existe con `value = true` después del primer seed. Se puede apagar desde Prisma Studio una vez que el volumen de altas lo justifique.

---

## Checklist de pre-deploy

- [ ] Build local en verde: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- [ ] Todas las variables de entorno cargadas en Vercel
- [ ] Dominio conectado, DNS resuelto, HTTPS activo y redirección www definida
- [ ] `prisma/migrations/` subido al repo y `migrate deploy` parte del build
- [ ] Región São Paulo seleccionada (si disponible)
- [ ] Webhooks de Mercado Pago y Meta cargados y handshake GET probado
- [ ] Número de WhatsApp dedicado, token permanente y perfil de empresa configurados en Meta
- [ ] Dominio verificado en Resend con SPF, DKIM y DMARC
- [ ] `DATABASE_URL` apunta al endpoint con pooling
- [ ] `/api/dev/*` devuelve 404 en producción
- [ ] `requireManualApproval = true` en la base de producción

Con todo esto verde, el portal está listo para recibir los primeros profesionales.
