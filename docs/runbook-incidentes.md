# Runbook de incidentes — PoliserviciosNOA

Documento de una página con los procedimientos de respuesta ante incidentes
de producción. Cada caso incluye: cómo detectarlo, qué revisar, cómo
mitigar y cómo confirmar que se resolvió.

---

## Cómo usar este runbook

1. Detectá el síntoma (alerta de Sentry, error en `/api/health`, reporte de un
   usuario, panel de monitoreo en `/admin/monitoreo`).
2. Buscá el caso que coincide en este documento.
3. Seguí los pasos en orden. No saltes pasos de verificación.
4. Cuando el servicio vuelva, anotá qué pasó en el log de incidentes y
   avisá al equipo.

---

## Caso 1: Los profesionales no reciben la confirmación de WhatsApp

**Síntoma:** un profesional pide el código de verificación, nunca recibe el
mensaje de WhatsApp, o lo recibe pero el código no se acepta.

### 1. Confirmar que es un fallo real

- Pedí al profesional que intente pedir el código otra vez (máximo 5 intentos
  antes del bloqueo).
- Revisá `/admin/monitoreo`: si hay errores de webhook de `whatsapp` en las
  últimas 24 h, el webhook de Meta está fallando.
- Probá el endpoint de health: `GET /api/health`. Si `whatsapp` no aparece
  como servicio (no se verifica directamente), revisá los logs de Sentry.

### 2. Qué revisar

| Qué | Dónde | Qué buscar |
|---|---|---|
| Webhook de Meta | `/api/webhooks/whatsapp` | Errores 401 (firma inválida) o 500 (procesamiento falló) |
| Token de Meta | `WHATSAPP_ACCESS_TOKEN` en Vercel | Que no esté vencido. Los tokens de usuario del sistema expiran |
| Número de plataforma | `WHATSAPP_PLATFORM_NUMBER` | Que sea el número dedicado, no un celular personal |
| Verify token | `WHATSAPP_VERIFY_TOKEN` | Que coincida con el configurado en Meta for Developers |
| Logs de Sentry | sentry.io | Errores de `procesarMensajeEntrante` con stack trace |
| Base de datos | Tabla `WhatsAppVerification` | Que existan filas recientes para ese número |

### 3. Mitigación inmediata

Si el webhook de WhatsApp no funciona:

1. **Verificación manual:** desde el panel de administración (`/admin/perfiles/[id]`),
   usá "Verificar WhatsApp a mano" con el motivo y el actor. Esto activa el
   número sin pasar por Meta.
2. **Avisar al profesional:** enviá un email o mensaje por otro canal diciendo
   que su número ya está verificado y puede publicar.
3. **Reconfigurar el webhook:** en Meta for Developers, verifiqué que la URL
   `https://tudominio.com/api/webhooks/whatsapp` siga activa y con el verify
   token correcto.

### 4. Confirmar que se resolvió

- El profesional recibe el código y puede verificar su número.
- `/api/health` responde 200.
- No hay errores nuevos de `whatsapp` en `/admin/monitoreo` durante 1 hora.

---

## Caso 2: Webhook de Mercado Pago falla (pagos no se procesan)

**Síntoma:** un profesional se suscribe, el pago se ve aprobado en Mercado Pago,
pero su perfil no se publica ni recibe el email de confirmación.

### 1. Confirmar

- Revisá `/admin/monitoreo`: errores de webhook de `mercadopago`.
- Probá `GET /api/health`: si `mercadopago` es `error`, la API de MP no
  responde.
- Buscá en Sentry errores de `webhook-mercadopago`.

### 2. Qué revisar

| Qué | Dónde | Qué buscar |
|---|---|---|
| Firma del webhook | `MP_WEBHOOK_SECRET` en Vercel | Que coincida con el panel de Mercado Pago |
| URL del webhook | Mercado Pago → Notificaciones | Que apunte a `/api/webhooks/mercadopago` |
| Estado del pago | Mercado Pago → Actividad | Que el pago esté aprobado, no pendiente |
| Tabla `WebhookEvent` | Base de datos | Que existan filas con `provider = 'mercadopago'` y `error` |

### 3. Mitigación inmediata

Si el webhook no funciona pero el pago está aprobado en Mercado Pago:

1. **Activación manual:** desde Prisma Studio o un script, buscá la
   `Subscription` del perfil y cambiá su estado a `ACTIVE`, seteá
   `currentPeriodEnd` y `priceFrozen` si corresponde.
2. **Publicación manual:** corrá `sincronizarPublicacion(profileId)` para
   publicar el perfil.
3. **Email manual:** enviá el email de confirmación desde Resend o desde la
   consola.

### 4. Confirmar

- El perfil aparece publicado en la búsqueda pública.
- El profesional recibe el email de confirmación.
- `/api/health` responde 200 para `mercadopago`.

---

## Caso 3: El cron diario falla (avisos, vencimientos, facturación)

**Síntoma:** no se envían avisos de vencimiento, las suscripciones vencidas no
se expiran, o las facturas de ARCA no se reintentan.

### 1. Confirmar

- Revisá `/admin/monitoreo`: corridas del cron con `ERROR`.
- Probá `GET /api/cron/daily` con `Authorization: Bearer <CRON_SECRET>` para
  ver el resumen de qué job falló.

### 2. Qué revisar

| Job | Qué hace | Qué revisar si falla |
|---|---|---|
| `avisos` | Emails antes del vencimiento | `EmailLog`, colas de email |
| `vencidas` | Expira suscripciones pasadas | Tabla `Subscription`, estados |
| `limpieza` | Borra señales y verificaciones viejas | Tablas de riesgo y verificación |
| `facturacion` | Reintenta facturas ARCA fallidas | Tabla `Invoice`, proveedor ARCA |
| `avisos-aumento-precio` | Avisa aumentos de precio | Tabla `PriceChange` |

### 3. Mitigación inmediata

- Corré el cron a mano: `GET /api/cron/daily?Authorization: Bearer <CRON_SECRET>`
- Si un job específico falla, revisá el mensaje de error en `CronJobRun`.
- Para facturación: desde `/admin/facturacion`, reintentá las facturas en
  `FAILED` a mano.

### 4. Confirmar

- `/api/cron/daily` responde con `ok: true` y todos los jobs en `ok`.
- `/admin/monitoreo` muestra 0 corridas con error en las últimas 24 h.

---

## Caso 4: Base de datos lenta o caída

**Síntoma:** la web no carga, los formularios fallan, o `/api/health` devuelve
`degradado` con `database: error`.

### 1. Confirmar

- Probá `GET /api/health`: si `database` es `error`, la DB no responde.
- Revisá Sentry: errores de Prisma (`P2002`, `P2014`, `P2021`, etc.).
- Revisá el panel de Neon/Supabase: CPU, conexiones activas, storage.

### 2. Mitigación

- Si es falta de conexiones (pooling agotado): esperá 5 min, las conexiones de
  serverless se liberan solas.
- Si es mantenimiento del proveedor: esperá a que Neon/Supabase lo resuelva.
- Si es una migración fallida: revisá `prisma/migrations` y revertí manualmente.

### 3. Confirmar

- `GET /api/health` responde `database: ok`.
- La web carga normalmente.

---

## Caso 5: Emails no llegan (Resend)

**Síntoma:** los usuarios no reciben emails de confirmación, avisos de vencimiento
o respuestas de soporte.

### 1. Confirmar

- Revisá Sentry: errores de `resend`.
- Revisá la tabla `EmailLog`: si hay filas con `error` no nulo.
- Probá el dominio verificado en Resend: SPF, DKIM, DMARC.

### 2. Mitigación

- Si el dominio no está verificado: verificá en Resend y agregá los registros
  DNS.
- Si Resend está caído: esperá, Resend reintenta solo.
- Para emails críticos (confirmación de suscripción): enviá manualmente desde
  la consola de Resend.

### 3. Confirmar

- Nuevo email se envía sin error en `EmailLog`.
- El destinatario confirma recepción.

---

## Escalamiento

Si ningún paso de este runbook resuelve el incidente en 30 minutos:

1. Abrí un ticket en el panel de soporte del proveedor afectado (Neon,
   Supabase, Mercado Pago, Meta, Resend, Vercel).
2. Notificá a los usuarios afectados por email o por el banner de la home.
3. Documentá el incidente en el log de incidentes con hora de inicio,
   hora de resolución y causa raíz.

---

## Después del incidente

- Anotá en `/admin/auditoria` qué se hizo y quién lo hizo.
- Si el incidente se repite, creá una tarea para prevenirlo (código, documentación
  o configuración).
- Actualizá este runbook si quedó algo fuera.
