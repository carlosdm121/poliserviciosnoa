# Piloto y mejoras — PoliserviciosNOA (módulo 5.6)

Análisis de los problemas detectados con los primeros profesionales, priorizado
por impacto en ingresos y confianza, con estimación de esfuerzo de cada uno.

> Este documento es el entregable del módulo 5.6. No asume datos reales de
> piloto: define qué medir, cómo interpretar y qué corregir. Cuando el piloto
> tenga números, se llenan las columnas "Registrado" y se re-prioriza.

---

## Cómo leer este documento

Cada problema tiene:

1. **Qué se mide** — el evento o consulta que confirma el problema.
2. **Impacto** — en ingresos (dinero que deja de entrar) y confianza (profesionales que se van o clientes que no encuentran a nadie).
3. **Esfuerzo** — bajo (días), medio (semana), alto (más de una semana).
4. **Acción** — qué se corrige y en qué archivo.

El orden de ejecución sigue la matriz: alto impacto + bajo esfuerzo primero.

---

## 1. Abandono en el paso del alta

**Qué se mide:** en qué paso deja el profesional de avanzar:
- Registro (crea cuenta)
- Perfil (completa rubro, ciudad, descripción, fotos)
- Verificación de WhatsApp (pide código, lo manda)
- Pago (abre checkout, paga)

**Datos que hay que extraer** (contra la base de producción):

```sql
-- Usuarios que se registraron pero nunca crearon perfil
SELECT COUNT(*) FROM "User" u
LEFT JOIN "Profile" p ON p.user_id = u.id
WHERE p.id IS NULL;

-- Usuarios con perfil pero sin WhatsApp verificado
SELECT COUNT(*) FROM "Profile" p
WHERE p.whatsappVerifiedAt IS NULL;

-- Usuarios con WhatsApp verificado pero sin suscripción
SELECT COUNT(*) FROM "Profile" p
WHERE p.whatsappVerifiedAt IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Subscription" s
    WHERE s.profile_id = p.id AND s.status = 'ACTIVE'
  );

-- Usuarios con suscripción PENDING (abandonaron en el pago)
SELECT COUNT(*) FROM "Subscription" s
WHERE s.status = 'PENDING';
```

**Interpretación esperada (hipótesis de partida):**

| Paso | Hipótesis | Acción si es alto |
|------|-----------|-------------------|
| Registro | Bajo (es gratis y rápido) | Simplificar formulario de registro |
| Perfil | Medio (pide fotos y descripción) | Permitir guardar incompleto y terminar después |
| WhatsApp | Medio-alto (es el paso más nuevo y desconocido) | Mejorar mensajes de error, reintento automático |
| Pago | Alto (es donde sale el dinero) | Reducir fricción en el checkout, más medios de pago |

**Registrado (llenar con datos reales):** completar al terminar el piloto.

---

## 2. Códigos de verificación vencidos sin usar

**Qué se mide:** cuántos códigos de WhatsApp se generan y nunca se usan antes de vencer (15 minutos por defecto, `WHATSAPP_CODE_MINUTES`).

```sql
-- Códigos generados y vencidos sin usar (últimos 7 días)
SELECT COUNT(*) FROM "WhatsAppVerification"
WHERE status = 'EXPIRED'
  AND createdAt > NOW() - INTERVAL '7 days';

-- Tasa de vencimiento sobre totales generados
SELECT
  COUNT(*) FILTER (WHERE status = 'EXPIRED')::float / COUNT(*) AS tasa_vencimiento
FROM "WhatsAppVerification"
WHERE createdAt > NOW() - INTERVAL '7 days';
```

**Interpretación:**
- Tasa > 30%: el paso de verificación es confuso o el código tarda en llegar.
- Tasa 10-30%: aceptable para un paso nuevo.
- Tasa < 10%: bien.

**Mejoras de código ya implementadas:**
- `src/server/jobs/limpieza.ts` pasa las verificaciones `PENDING` vencidas a `EXPIRED` cada corrida del cron (2 veces al día).
- `src/services/verificacion-whatsapp.ts:obtenerEstado` marca vencida al consultar, para que la UI no muestre cuenta regresiva muerta.

**Acción pendiente:** agregar al panel `/admin/monitoreo` un contador de verificaciones vencidas en las últimas 24 h, para ver si la tasa sube. (ver acción M-2 abajo)

---

## 3. Números de WhatsApp con problemas de formato

**Qué se mide:** cuántos intentos de `solicitarCodigo` fallan por número inválido, y cuántos números en la base no pasan `normalizarWhatsapp`.

```sql
-- Perfiles cuyo número no es E.164 válido (debería ser 0 si la normalización funciona en alta)
SELECT COUNT(*) FROM "Profile"
WHERE whatsappE164 !~ '^549[0-9]{10}$';

-- Intentos de código rechazados por formato inválido (requiere loguear el intento)
-- No hay tabla de intentos fallidos todavía; ver acción M-3.
```

**Interpretación:**
- Si hay perfiles con número inválido en la base, la normalización se saltó en algún punto (probablemente verificación manual o migración).
- Si hay muchos rechazos por formato, el formulario no explica bien qué escribir.

**Mejoras de código ya implementadas:**
- `src/lib/phone.ts:normalizarWhatsapp` acepta 8+ variantes de escritura argentina.
- `src/lib/phone.ts:explicarTelefonoInvalido` devuelve mensaje legible al usuario.
- `src/services/verificacion-whatsapp.ts:solicitarCodigo` valida el formato antes de crear nada.

**Acción pendiente:** registrar en log (redactado) los rechazos por formato para ver si hay un patrón (ver acción M-3 abajo).

---

## 4. Aprobación manual demorando altas

**Qué se mide:** cuánto tiempo pasa un perfil en `PENDING_REVIEW` antes de que un admin lo apruebe o rechace.

```sql
-- Perfiles pendientes de aprobación y cuánto llevan
SELECT
  p.id,
  p.name,
  p.createdAt,
  EXTRACT(EPOCH FROM (NOW() - p.createdAt)) / 86400 AS dias_pendiente
FROM "Profile" p
WHERE p.moderationStatus = 'PENDING_REVIEW'
ORDER BY p.createdAt ASC;
```

**Interpretación:**
- Promedio > 2 días: la aprobación manual es un cuello de botella. Los profesionales se cansan y se van.
- Cantidad absoluta alta con pocos admins: necesitan más moderadores o bajar el umbral de aprobación automática.

**Mejoras de código ya implementadas:**
- `src/lib/admin.ts` tiene la sección `aprobaciones` y `exigirAprobacionManual()` lee la bandera `requireManualApproval`.
- `prisma/seed.ts` activa `requireManualApproval = true` para el arranque en producción.

**Acción pendiente:** mostrar `diasPendiente` en `/admin/aprobaciones` para que el admin vea quién lleva más tiempo esperando (ver acción M-4 abajo).

---

## 5. Matriz de priorización

| ID | Problema | Impacto ingresos | Impacto confianza | Esfuerzo | Prioridad |
|----|----------|------------------|-------------------|----------|-----------|
| M-1 | Abandono en pago (PENDING sin completar) | Alto | Medio | Medio | 1 |
| M-2 | Códigos de verificación vencidos sin usar | Medio | Medio | Bajo | 2 |
| M-3 | Números con formato inválido no detectados | Medio | Bajo | Bajo | 3 |
| M-4 | Aprobación manual sin tiempo visible | Medio | Alto | Bajo | 4 |
| M-5 | Abandono en perfil (fotos/descripción) | Medio | Bajo | Medio | 5 |

**Orden sugerido:** M-4 → M-2 → M-3 → M-1 → M-5.

M-4 y M-2 son bajo esfuerzo y dan visibilidad inmediata. M-1 requiere cambios en el flujo de pago y se deja para después del piloto.

---

## 6. Acciones de código (entregables)

### M-4 — Tiempo pendiente en aprobaciones

Mostrar cuántos días lleva cada perfil en `PENDING_REVIEW` en `/admin/aprobaciones`, para que el admin priorice los más viejos.

**Archivo:** `src/app/admin/aprobaciones/page.tsx`

**Cambio:** en el `select` de `listarAprobaciones`, ya trae `createdAt`. En la UI, agregar una columna "Días pendiente" calculada con `fechaHora` o un texto como "Hace 3 días".

Razón: sin esto, el admin no sabe si un perfil lleva 2 horas o 2 semanas esperando, y la aprobación manual se convierte en cola infinita.

### M-2 — Verificaciones vencidas en monitoreo

Agregar a `src/services/monitoreo.ts` un conteo de verificaciones de WhatsApp vencidas en las últimas 24 h, y mostrarlo en `/admin/monitoreo`.

**Archivos:** `src/services/monitoreo.ts`, `src/app/admin/monitoreo/page.tsx`

Razón: si la tasa de vencimiento sube, es señal de que el paso de WhatsApp está fallando (código no llega, formato confuso, usuario se cansa).

### M-3 — Log de rechazos por formato de teléfono

Registrar en el logger (sin el número claro, solo el enmascarado) cuántas veces `solicitarCodigo` rechaza por formato inválido.

**Archivo:** `src/services/verificacion-whatsapp.ts:solicitarCodigo`

Razón: sin esto no se sabe si el problema es el formulario, el código de área, o los usuarios escribiendo mal.

### M-1 — Tracking de abandono en pago

Cuando un profesional abre un checkout (`crearSuscripcion`) y no vuelve a pagar en 24 h, registrar un evento. Esto permite saber cuántos se quedan en `PENDING` para siempre.

**Archivo:** `src/services/suscripcion.ts` + un job o evento de auditoría.

Razón: un `PENDING` abandonado bloquea el índice único de `profileId` y evita que el profesional se vuelva a suscribir sin intervención manual.

---

## 7. Checklist de cierre del módulo 5.6

- [ ] M-4 implementado: `/admin/aprobaciones` muestra días pendiente por perfil.
- [ ] M-2 implementado: `/admin/monitoreo` muestra verificaciones vencidas 24h.
- [ ] M-3 implementado: `solicitarCodigo` loguea rechazos por formato.
- [ ] M-1 implementado: evento de abandono en checkout a las 24h.
- [ ] Datos reales del piloto cargados en la matriz de priorización.
- [ ] Problemas resueltos en orden de prioridad, no de aparición.

Con esto cerrado, el módulo 5.6 da paso a 5.7 (auditoría final y checklist de pre-lanzamiento).
