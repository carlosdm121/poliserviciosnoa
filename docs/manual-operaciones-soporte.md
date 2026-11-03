# Manual de operaciones — Soporte y moderación (módulo 4.2)

PoliserviciosNOA — versión para el equipo de soporte/moderación.

---

## 1. Quién responde qué

| Rol | Puede ver | Puede hacer |
|-----|-----------|-------------|
| **MODERADOR** | Perfiles, aprobaciones, riesgo/bloqueos, empresas, matrículas, moderación, **soporte** | Responder tickets, asignar, cambiar estado, cerrar tickets, moderar reportes y reclamos |
| **ADMIN** | Todo lo anterior + catálogo, finanzas, configuración, auditoría | Lo mismo que moderador + cambiar precios, configurar SLA, aprobar empresas |

El canal de soporte es el formulario público `/soporte` y el centro de ayuda `/ayuda`. Los tickets llegan a la bandeja `/admin/soporte`.

## 2. Horarios y plazos (SLA)

| Paso | Plazo | Cómo se mide |
|------|-------|--------------|
| Primera respuesta al cliente | 24 h hábiles | Desde que se abre el ticket hasta la primera respuesta del equipo |
| Resolución del ticket | 72 h hábiles | Desde que se abre hasta que se cierra (estado RESUELTO) |

Los sábados, domingos y feriados no cuentan. El cron diario corre a las 09:00 ART y avisa por email al buzón de soporte (`CONTACT_EMAIL`) cuando un ticket superó cualquiera de los dos plazos.

El SLA se configura en el panel, sección Configuración, clave `soporte_sla` (JSON con `primeraRespuestaDias` y `resolucionDias`). Valores por defecto: 1 y 3.

## 3. Flujo diario de la bandeja `/admin/soporte`

1. Entrar a `/admin/soporte` (solo MODERADOR y ADMIN).
2. Revisar los tickets filtrando por estado `ABIERTO` o `EN_CURSO`.
3. Leer el asunto y el mensaje. Si hace falta más información, responder pidiéndola (el ticket pasa a `EN_CURSO`).
4. Elegir una plantilla de respuesta predefinida o escribir la respuesta a mano. Al enviar:
   - Si el ticket estaba `ABIERTO`, pasa a `EN_CURSO`.
   - Si es la primera respuesta del equipo, se registra la fecha (corta el SLA de primera respuesta).
   - Se envía un email al cliente con la respuesta.
5. Cuando el problema está resuelto, cambiar el estado a `RESUELTO` (y escribir el motivo). Se registra `resueltoEn` (corta el SLA de resolución).
6. Si un ticket no le corresponde a quien lo lee, asignarlo a otro integrante del equipo (select "Asignar a").

## 4. Plantillas de respuesta

Desde la bandeja se elige una plantilla antes de escribir. Las plantillas iniciales son:

- **Verificar WhatsApp (pasos):** para clientes que no reciben el código de verificación.
- **Pago no acreditado:** para pagos que aún no figuran en Mercado Pago.
- **Perfil no aparece en búsqueda:** para clientes que no ven su perfil publicado.

Cada plantilla usa `{{nombre}}` que se reemplaza con el nombre del cliente. Se pueden editar o agregar nuevas desde la base (`TicketPlantilla`).

## 5. Criterios para suspender perfiles

Un perfil se suspende (`moderationStatus = SUSPENDED`) solo cuando:

- Un reclamo con motivo `FRAUDE` se presenta (suspensión preventiva inmediata).
- Se acumulan 3 reclamos `VALIDADO` en 90 días (aplicación automática por la política de reclamos).
- El administrador decide, con motivo escrito, tras revisar señales de riesgo o reportes.

Nunca se suspende por una sola señal de riesgo: las señales avisan, no bloquean (decisión D17).

## 6. Lista de bloqueo

Desde `/admin/riesgos` se pueden agregar y quitar identificadores bloqueados (teléfono, email, CUIT). Se guarda siempre el **hash**, nunca el valor en claro. Cada bloqueo lleva motivo escrito y quién lo hizo. Sin motivo escrito, el bloqueo no se puede revertir con criterio.

## 7. Qué escalar al dueño del proyecto

Escalar al dueño (no resolver desde soporte):

- Reclamos de fraude reiterados contra un mismo profesional.
- Sospecha de suplantación de número de WhatsApp ("NO FUI YO").
- Errores de facturación con ARCA o Mercado Pago que no se resuelven con el reembolso.
- Cambios de precio de la suscripción (módulo de ajustes de precio).
- Cualquier cliente que amenace con acción legal.

## 8. Registro de auditoría

Toda acción en soporte queda registrada en la auditoría (`/admin/auditoría`): crear ticket, responder, asignar, cambiar estado, cerrar. El registro guarda quién, cuándo, qué cambió y el motivo. Nunca guarda datos personales (teléfono, email) en `before`/`after`.

## 9. Checklist de cierre de ticket

Antes de pasar un ticket a `RESUELTO`:

- [ ] Se respondió al cliente por email al menos una vez.
- [ ] El motivo del cierre queda escrito.
- [ ] Si el cliente no está conforme, se deja abierta la puerta a nuevo ticket.
- [ ] Queda constancia en auditoría de quién cerró y por qué.
