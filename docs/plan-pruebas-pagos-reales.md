# Plan de pruebas en producción con pagos reales — PoliserviciosNOA

Objetivo: validar todo el ciclo de pago de punta a punta con montos reales
bajos antes de abrir la plataforma al público. Cada caso incluye pasos, resultado
esperado y la tabla o registro que hay que revisar para confirmarlo.

> Depende de: 5.1 (deploy a producción). Todas las pruebas se hacen contra el
> entorno de producción con credenciales reales de Mercado Pago, pero con el
> monto de suscripción al mínimo posible (`SUBSCRIPTION_AMOUNT` bajo, ej. $100
> ARS o el mínimo que permita Mercado Pago) para limitar el gasto.

---

## Antes de empezar

- Verificá que `/api/health` responda 200 con `database: ok`, `mercadopago: ok`
  y `upstash: ok`.
- Verificá que el webhook de Mercado Pago esté cargado en el panel de MP con
  la URL `https://tudominio.com/api/webhooks/mercadopago` y el `MP_WEBHOOK_SECRET`
  configurado en Vercel.
- Verificá que `requireManualApproval = true` en la tabla `SiteSetting` (arranque
  con aprobación manual activa).
- Tené a mano al menos 3 números de WhatsApp distintos (vos y dos personas más)
  para la prueba de verificación.
- Anotá el monto de prueba que vas a usar y la fecha de inicio.

---

## Caso 1 — Alta de profesional completa (con y sin aprobación manual)

**Qué valida:** registro, email verificado, perfil completo, verificación de
WhatsApp real, suscripción, cobro, activación y publicación.

### Con aprobación manual activa (arranque)

| Paso | Qué hacer |
|------|-----------|
| 1 | Registrarse como profesional con email y contraseña. Verificar el email (revisar bandeja de entrada). |
| 2 | Completar el perfil: rubro principal, ciudad, descripción (20+ caracteres), al menos una foto en la galería. |
| 3 | Verificar el número de WhatsApp (pedir código, escribirlo desde ese número). |
| 4 | Ir a `/panel/suscripcion`, aceptar los términos y datos fiscales, clic en "Suscribirme". |
| 5 | Completar el pago en Mercado Pago con una tarjeta de prueba real (monto mínimo). |
| 6 | Verificar que el perfil **no** aparezca en la búsqueda pública todavía (está en `PENDING_REVIEW`). |
| 7 | Entrar como admin a `/admin/aprobaciones`, aprobar el perfil. |
| 8 | Verificar que el perfil aparezca publicado en la búsqueda pública y en su card. |

**Resultado esperado:**
- `Profile.moderationStatus = 'APPROVED'` después de aprobar.
- `Profile.isPublished = true` y `Subscription.status = 'ACTIVE'`.
- Email de confirmación de pago recibido (revisar `EmailLog`).
- El perfil aparece en `/buscar` y en `/[provincia]/[rubro]`.

**Registro a revisar:** `Profile`, `Subscription`, `Payment`, `EmailLog` (template `pago_aprobado`).

### Sin aprobación manual (después del lanzamiento)

Repetir el mismo flujo pero con `requireManualApproval = false`. El perfil debe
quedar publicado automáticamente al activarse la suscripción, sin pasar por
`/admin/aprobaciones`.

**Registro a revisar:** `Profile.isPublished = true` sin intervención de admin.

---

## Caso 2 — Verificación de WhatsApp real con 3 personas y casos límite

**Qué valida:** el código llega al número correcto, se acepta solo desde ese
número, y los casos borde no dejan números huérfanos.

### 2.1 — Tres personas distintas verifican su número

| Paso | Qué hacer |
|------|-----------|
| 1 | Persona A se registra, verifica email, completa perfil, pide código de WhatsApp. |
| 2 | Persona A escribe el código desde su número al número de la plataforma. |
| 3 | Repetir con Persona B y Persona C (números distintos). |

**Resultado esperado:**
- Cada uno recibe el código por WhatsApp.
- `WhatsappVerification` queda con `verificado = true` para cada número.
- Cada número se asocia a un solo perfil (unicidad).

**Registro a revisar:** `WhatsAppVerification` (una fila por número, `verificadoAt` no nulo), `Profile.whatsappVerifiedAt`.

### 2.2 — Código vencido

| Paso | Qué hacer |
|------|-----------|
| 1 | Pedir un código de verificación. |
| 2 | Esperar más de los minutos configurados (`WHATSAPP_CODE_MINUTES`, default 15). |
| 3 | Escribir el código vencido desde el número. |

**Resultado esperado:** el sistema rechaza el código, no verifica el número, y
se puede pedir uno nuevo.

**Registro a revisar:** `WhatsAppVerification` (intento fallido, no hay `verificadoAt`).

### 2.3 — Código reutilizado

| Paso | Qué hacer |
|------|-----------|
| 1 | Pedir un código, usarlo y verificar correctamente. |
| 2 | Volver a escribir el mismo código desde el mismo número. |

**Resultado esperado:** el segundo uso no tiene efecto (ya está verificado) o se
rechaza como código ya consumido.

**Registro a revisar:** `WhatsAppVerification` (solo una verificación exitosa).

### 2.4 — Número ya usado por otro perfil

| Paso | Qué hacer |
|------|-----------|
| 1 | Perfil A verifica el número 549XXXXXXXXX. |
| 2 | Perfil B intenta verificar el mismo número 549XXXXXXXXX. |

**Resultado esperado:** el sistema rechaza la verificación porque el número ya
pertenece a otro perfil (hash único en `BlockedIdentifier` o en la unicidad de
`Profile.whatsappE164`).

**Registro a revisar:** `Profile.whatsappHash` (único), `BlockedIdentifier`.

### 2.5 — Escribir desde otro número

| Paso | Qué hacer |
|------|-----------|
| 1 | Perfil A pide código para su número X. |
| 2 | Escribir el código desde un número Y distinto. |

**Resultado esperado:** el sistema no verifica nada (el remitente no coincide
con el número que pidió el código).

**Registro a revisar:** `WhatsAppVerification` (no hay verificación exitosa para X).

### 2.6 — Responder "NO FUI YO"

| Paso | Qué hacer |
|------|-----------|
| 1 | Alguien recibe un código de verificación que no pidió. |
| 2 | Responder "NO FUI YO" por WhatsApp al número de la plataforma. |

**Resultado esperado:** el sistema libera el número (si estaba asociado a un
perfil impostor, ese perfil se despublica y se añade a la lista de bloqueo).

**Registro a revisar:** `BlockedIdentifier`, `Profile.moderationStatus = 'SUSPENDED'` del perfil afectado.

---

## Caso 3 — Renovación automática

**Qué valida:** la suscripción se renueva sola al final del período y el perfil
sigue publicado.

Como esperar un mes entero no es viable, se usa una de estas dos estrategias:

| Estrategia | Cómo |
|------------|------|
| A | Crear un plan de prueba con `currentPeriodEnd` en 2-3 días (desde Prisma Studio) y esperar a que llegue el vencimiento. |
| B | Manualmente: poner `Subscription.currentPeriodEnd` a ayer y `status = 'ACTIVE'`, luego correr el cron diario a mano (`GET /api/cron/daily` con `CRON_SECRET`) para que procese el vencimiento y la renovación. |

**Resultado esperado:**
- Mercado Pago cobra la renovación (preapproval recurrente).
- `Subscription.currentPeriodEnd` se extiende un mes.
- `Profile.isPublished` sigue siendo `true`.
- Email de aviso de renovación enviado (`EmailLog`).

**Registro a revisar:** `Subscription` (fechas), `Payment` (nuevo pago recurrente), `EmailLog`.

---

## Caso 4 — Pago rechazado y período de gracia

**Qué valida:** un rechazo de renovación no despublica de inmediato; entra en
gracia y avisa al usuario.

| Paso | Qué hacer |
|------|-----------|
| 1 | Tener una suscripción `ACTIVE` próxima a vencer. |
| 2 | Forzar un rechazo en el pago de renovación (tarjeta con fondos insuficientes en MP, o webhook de MP con estado `rejected`). |
| 3 | Verificar que el perfil siga publicado durante la gracia. |
| 4 | Pasados los días de gracia (`PAYMENT_GRACE_DAYS`, default 2), verificar que se despublique. |

**Resultado esperado:**
- `Subscription.status = 'PAST_DUE'` con `graceUntil` seteado.
- `Profile.isPublished = true` durante la gracia.
- Email de aviso de pago rechazado enviado.
- Después de la gracia: `status = 'EXPIRED'`, `isPublished = false`.

**Registro a revisar:** `Subscription` (status, graceUntil), `Profile.isPublished`, `EmailLog`.

---

## Caso 5 — Cancelación y despublicación al fin del período

**Qué valida:** al cancelar, el perfil sigue visible hasta el fin del período
pagado y luego se despublica.

| Paso | Qué hacer |
|------|-----------|
| 1 | Tener una suscripción `ACTIVE`. |
| 2 | Ir a `/baja` y solicitar la baja online. |
| 3 | Verificar que `cancelAtPeriodEnd = true` y el perfil siga publicado. |
| 4 | Al llegar `currentPeriodEnd`, verificar que se despublique. |

**Resultado esperado:**
- `Subscription.cancelAtPeriodEnd = true`.
- `Profile.isPublished = true` hasta `currentPeriodEnd`.
- Después de `currentPeriodEnd`: `status = 'CANCELLED'`, `isPublished = false`.

**Registro a revisar:** `Subscription` (cancelAtPeriodEnd, status), `Profile.isPublished`.

---

## Caso 6 — Arrepentimiento dentro de los 10 días

**Qué valida:** reembolso del último pago, nota de crédito, cancelación y
despublicación inmediata.

| Paso | Qué hacer |
|------|-----------|
| 1 | Tener una suscripción activa pagada hace menos de 10 días. |
| 2 | Ir a `/arrepentimiento` y solicitar el arrepentimiento. |
| 3 | Verificar que se procese el reembolso en Mercado Pago. |
| 4 | Verificar que se genere una nota de crédito. |
| 5 | Verificar que la suscripción quede cancelada y el perfil despublicado. |

**Resultado esperado:**
- `CancellationRequest` creada con estado completado.
- `Payment` reembolsado en Mercado Pago (estado `refunded`).
- `CreditNote` generada (nota de crédito).
- `Subscription.status = 'CANCELLED'`, `Profile.isPublished = false`.
- Email de confirmación de arrepentimiento enviado.

**Registro a revisar:** `CancellationRequest`, `CreditNote`, `Subscription`, `Profile.isPublished`, `Payment`.

---

## Caso 7 — Reembolso manual desde Mercado Pago

**Qué valida:** un reembolso hecho directamente en el panel de Mercado Pago se
refleja en la base (via webhook).

| Paso | Qué hacer |
|------|-----------|
| 1 | Tener un pago aprobado en Mercado Pago. |
| 2 | Ir al panel de Mercado Pago y hacer un reembolso total o parcial. |
| 3 | Esperar que el webhook de MP llegue y procese el reembolso. |

**Resultado esperado:**
- `Payment.status = 'refunded'` (o `partially_refunded`).
- Si es reembolso total de la suscripción: `Subscription.status = 'CANCELLED'`,
  `Profile.isPublished = false`.
- `WebhookEvent` registrado con el evento de reembolso.

**Registro a revisar:** `Payment`, `Subscription`, `Profile.isPublished`, `WebhookEvent`.

---

## Caso 8 — Flujo de cliente: contacto, voto, invitación y reclamo

**Qué valida:** un cliente puede contactar, votar a las 24 h, recibir la
invitación a las 48 h y hacer un reclamo.

| Paso | Qué hacer |
|------|-----------|
| 1 | Cliente entra al sitio, busca un profesional y hace clic en WhatsApp desde la card o el perfil público. |
| 2 | Se registra el clic anónimo y la intención de contacto (24 h). |
| 3 | Pasadas 24 h, el cliente puede votar (corazón) al profesional. |
| 4 | Pasadas 48 h, el cliente recibe el email de invitación a valorar. |
| 5 | El cliente hace un reclamo desde `/soporte` o `/libro-de-quejas`. |

**Resultado esperado:**
- `ContactIntent` registrada (clic anónimo, sin datos personales del cliente).
- `ProfileVote` creada solo si hay contacto previo y pasaron 24 h.
- `VoteInvite` creada a las 48 h.
- `Complaint` (o `Reclamo`) creada con número de trámite.

**Registro a revisar:** `ContactIntent`, `ProfileVote`, `VoteInvite`, `Complaint`/`Reclamo`, `EmailLog`.

---

## Script SQL de conciliación

Este script compara lo que dice Mercado Pago (pagos aprobados) contra lo que
quedó registrado en la base (`Payment` + `Invoice`). Se corre contra la base
de producción y devuelve las discrepancias.

```sql
-- =====================================================================
-- Conciliación: Payments vs Invoices vs Mercado Pago
-- =====================================================================
-- Ejecutar contra la base de producción de PoliserviciosNOA.
-- Devuelve pagos en Mercado Pago que no tienen Payment o Invoice asociada,
-- y pagos registrados que no tienen confirmación de Mercado Pago.
-- =====================================================================

-- 1. Pagos aprobados en la base sin factura asociada
SELECT
  p.id AS payment_id,
  p.mp_payment_id,
  p.status AS payment_status,
  p.amount,
  p.created_at AS pago_creado,
  i.id AS invoice_id,
  i.status AS invoice_status
FROM "Payment" p
LEFT JOIN "Invoice" i ON i.payment_id = p.id
WHERE p.status = 'approved'
  AND i.id IS NULL
ORDER BY p.created_at DESC;

-- 2. Facturas sin pago asociado (huérfanas)
SELECT
  i.id AS invoice_id,
  i.number AS numero_factura,
  i.status AS invoice_status,
  i.payment_id,
  p.id AS payment_id
FROM "Invoice" i
LEFT JOIN "Payment" p ON p.id = i.payment_id
WHERE i.payment_id IS NOT NULL
  AND p.id IS NULL
ORDER BY i.created_at DESC;

-- 3. Suscripciones activas sin pago reciente en los últimos 35 días
-- (posible renovación fallida no procesada)
SELECT
  s.id AS subscription_id,
  s.profile_id,
  s.status,
  s.current_period_end,
  s.price_frozen,
  p.name AS perfil_nombre,
  u.email
FROM "Subscription" s
JOIN "Profile" p ON p.id = s.profile_id
JOIN "User" u ON u.id = p.user_id
WHERE s.status = 'ACTIVE'
  AND s.current_period_end < NOW() - INTERVAL '35 days'
  AND NOT EXISTS (
    SELECT 1 FROM "Payment" pay
    WHERE pay.profile_id = s.profile_id
      AND pay.status = 'approved'
      AND pay.created_at > s.current_period_end - INTERVAL '40 days'
      AND pay.created_at < s.current_period_end + INTERVAL '5 days'
  )
ORDER BY s.current_period_end;

-- 4. Resumen de discrepancias por estado
SELECT
  'pagos_sin_factura' AS tipo,
  COUNT(*) AS cantidad
FROM "Payment" p
LEFT JOIN "Invoice" i ON i.payment_id = p.id
WHERE p.status = 'approved' AND i.id IS NULL

UNION ALL

SELECT
  'facturas_sin_pago',
  COUNT(*)
FROM "Invoice" i
LEFT JOIN "Payment" p ON p.id = i.payment_id
WHERE i.payment_id IS NOT NULL AND p.id IS NULL

UNION ALL

SELECT
  'suscripciones_sin_renovacion',
  COUNT(*)
FROM "Subscription" s
WHERE s.status = 'ACTIVE'
  AND s.current_period_end < NOW() - INTERVAL '35 days';
```

**Cómo interpretar:**
- Cualquier fila en "pagos sin factura" significa que un pago fue aprobado pero
  no se emitió comprobante (revisar `FAILED` en facturación o webhook no
  procesado).
- Cualquier fila en "suscripciones sin renovación" significa que una suscripción
  activa está vencida y no se procesó la renovación (revisar webhook de MP o
  cron diario).

---

## Checklist de aprobación de este módulo

- [ ] Caso 1 con aprobación manual: perfil se publica solo tras aprobar en `/admin/aprobaciones`.
- [ ] Caso 1 sin aprobación manual: perfil se publica solo al activar la suscripción.
- [ ] Caso 2.1: 3 números distintos verificados, cada uno a un solo perfil.
- [ ] Caso 2.2: código vencido no verifica.
- [ ] Caso 2.3: código ya usado no se reusa.
- [ ] Caso 2.4: número duplicado rechazado.
- [ ] Caso 2.5: escribir desde otro número no verifica.
- [ ] Caso 2.6: "NO FUI YO" libera el número y despublica al impostor.
- [ ] Caso 3: renovación procesada, suscripción extendida, perfil sigue publicado.
- [ ] Caso 4: pago rechazado → PAST_DUE con gracia → EXPIRED y despublicado.
- [ ] Caso 5: cancelación → cancelAtPeriodEnd → despublicado al fin del período.
- [ ] Caso 6: arrepentimiento → reembolso → nota de crédito → despublicado.
- [ ] Caso 7: reembolso manual en MP → Payment refunded → base actualizada.
- [ ] Caso 8: contacto → voto a 24h → invitación a 48h → reclamo con trámite.
- [ ] Script SQL ejecutado sin discrepancias críticas (o todas explicadas).

Con todos los puntos en verde, el ciclo de pago está validado y se puede pasar
a 5.4 (cupones, socios fundadores y reglas de apertura).
