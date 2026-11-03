# Mercado Pago — configuración y pruebas

Cómo dejar el cobro andando en desarrollo y cómo probarlo sin gastar plata
real. El código del módulo 2.3 ya está; lo que falta para verlo funcionar son
credenciales y un paso en el panel de Mercado Pago.

---

## 1. Qué hace falta

| Variable | Dónde se saca | Obligatoria |
|---|---|---|
| `MP_ACCESS_TOKEN` | Panel de Mercado Pago → *Tus integraciones* → *Credenciales* | Sí |
| `MP_WEBHOOK_SECRET` | Se genera al crear una suscripción por la API; también aparece en *Notificaciones* | Sí (la usa el módulo 2.4) |
| `NEXTAUTH_URL` | Ya está. Tiene que ser **la URL pública** en producción | Sí |

Y dos cosas que no son variables:

- La ruta `/api/webhooks/mercadopago` tiene que existir en el dominio público.
  Está implementada (módulo 2.4), pero en desarrollo local no llega nada: Mercado
  Pago no puede alcanzar `localhost`. El flujo del webhook se prueba con
  `npm run verificar` (proveedor mock) o publicando la app en una URL accesible.
- La cuenta tiene que estar en modo prueba. En una cuenta real, un preapproval
  de prueba **cobra plata de verdad**.

### Modo prueba contra cuenta real

Fuera de producción se usa el proveedor simulado salvo que se pida lo contrario:

```bash
MP_REAL=1 npm run dev
```

Es la misma regla que Cloudinary (D23) y que WhatsApp: la decisión es explícita,
no inferida del formato del token. Sin `MP_REAL=1`, ni el desarrollo ni
`npm run verificar` tocan la red de Mercado Pago.

---

## 2. Crear la suscripción en el panel

En el panel de Mercado Pago, con **credenciales de prueba**:

1. *Preferencias* → *Plan* → crear un plan mensual de **$10.000 ARS** con cobro
   automático activado.

> El plan del panel **no** es la fuente del precio. El monto sale de
> `Plan.amount` en nuestra base (D24) y viaja en el `auto_recurring.transaction_amount`
> de cada preapproval. El plan de Mercado Pago sirve para que la cuenta del
> administrador lo vea ordenado, no para cobrar. Por eso no hay ninguna variable
> de entorno con su id: si el código lo usara, cambiar el precio en nuestra base
> no cambiaría lo que se cobra, que es justo el bug que el módulo 2.2 evita.

2. *Tus integraciones* → *Notificaciones* → agregar la URL del webhook:

```
https://<tu-dominio>/api/webhooks/mercadopago
```

Eventos a suscribir:

| Evento | Para qué |
|---|---|
| `subscription_preapproval` | Alta, cambios de estado y cancelación |
| `subscription_authorized_payment` | Cada cobro aprobado de la renovación |
| `payment` | Reembolsos y contracargos |

Guardar y copiar el **secret** a `MP_WEBHOOK_SECRET`.

---

## 3. Probar el alta de punta a punta

### 3.1 Tarjetas de prueba

Cualquiera de estas da un resultado distinto, y probarlas todas es la única forma
de saber qué muestra el portal cuando el pago falla.

**Aprobada**

| Tarjeta | Vencimiento | CVV |
|---|---|---|
| 4509 5350 1111 1113 | 11/30 | 123 |
| 5031 4330 0100 1550 | 11/30 | 123 |

**Rechazada por saldo insuficiente**

| Tarjeta | Vencimiento | CVV |
|---|---|---|
| 4000 0000 0000 9995 | 11/30 | 123 |

**Rechazada por error de datos**

| Tarjeta | Vencimiento | CVV |
|---|---|---|
| 4617 8233 5317 3632 | 11/30 | 123 |

Cuando el pago se rechaza, la suscripción **no** se activa y el profesional vuelve
a `/panel/suscripcion/resultado` con el mensaje de "estamos verificando". El
webhook deja la suscripción en `PENDING` si era el primer pago (nunca estuvo al
día) o en `PAST_DUE` con la ventana de `PAYMENT_GRACE_DAYS` si era una
renovación. En los dos casos el perfil no se publica por un pago rechazado.

### 3.2 El recorrido

1. Registrarse como profesional y completar email, WhatsApp y perfil.
2. Ir a **Datos fiscales** y cargar CUIT o DNI.
3. Ir a **Suscripción**: el checklist tiene que estar vacío.
4. Aceptar las condiciones y apretar **Pagar y activar**.
5. Se redirige al checkout de Mercado Pago. Pagar con una tarjeta aprobada.
6. Volver a `/panel/suscripcion/resultado`.
7. **En la base**, si el webhook llegó, la fila queda así:

```
status              ACTIVE
mpPreapprovalId     <id del preapproval>
planAmount          <el precio del plan>
termsVersion        2026-10-16
termsAcceptedAt     <la hora del clic>
currentPeriodStart  <la fecha del pago>
currentPeriodEnd    <un mes después>
```

Si el webhook todavía no llegó (por ejemplo, en local sin URL pública), la fila
queda en `PENDING` con `currentPeriodEnd` en `null`. Eso es transitorio, no un
estado final: el pago se acredita cuando Mercado Pago reintenta la notificación.
Lo que **no** puede pasar es que quede `ACTIVE` sin un pago aprobado en la base;
si pasa, el webhook está confiando en el body en vez de consultar la API.

### 3.3 Probar la baja

1. Pagá una suscripción con tarjeta aprobada y esperá a que el webhook la pase a
   `ACTIVE` (o corré `npm run verificar` para el flujo mock).
2. Volvé a `/panel/suscripcion` y apretá **Cancelar renovación automática**.
3. En la base: `cancelAtPeriodEnd = true`, `cancelledAt` con la hora, `status` sigue
   en `ACTIVE` y el perfil **sigue publicado**.

El paso 3 es el que más se va a nerfear: cancelar no despublica ni devuelve
plata. Si alguna vez `cancelarRenovacion` cambia el estado a `CANCELLED`, se está
despublicando a un profesional que pagó el mes.

---

## 4. Antes de salir a público

- [ ] La cuenta tiene credenciales **reales**, no de prueba.
- [ ] `NEXTAUTH_URL` es el dominio público con HTTPS.
- [ ] El webhook está configurado con `https://`, no con la URL de desarrollo.
- [ ] `MP_WEBHOOK_SECRET` es el de la cuenta real, no el de prueba.
- [ ] Llegó al menos una notificación firmada y quedó `processedAt` en
      `WebhookEvent` (si no, el secret o la URL están mal).
- [ ] Hay alguien que sepa responder un reclamo de "me cobró dos veces" antes del
      primer cobro real.

La última casilla no es un chiste: un rechazo de pago en la renovación deja al
profesional en `PAST_DUE` con una ventana de gracia, y si nadie mira los
reclamos, el que paga dos veces no tiene a quién contárselo.