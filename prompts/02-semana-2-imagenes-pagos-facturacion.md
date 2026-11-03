# Semana 2 — Imágenes, pagos, facturación y renovaciones

Pegar siempre antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

> Cambios respecto de la versión anterior: el pago exige email + WhatsApp verificados (ya no "identidad"), el precio sale de la tabla Plan, se agregan facturación, baja y arrepentimiento, y el cron pasa a ser un registro de jobs idempotentes que los módulos siguientes usan.

---

## Módulo 2.1 — Galería de imágenes (máx. 10)

**Depende de:** 1.9. **Entrega:** subida firmada a Cloudinary con límite de 10 a prueba de concurrencia.

```
TAREA: Implementá la galería en /panel/galeria con Cloudinary.

FLUJO:
1. El servidor genera una firma de subida (signed upload) con carpeta
   por perfil: `perfiles/{profileId}`. Preset restringido a
   jpg/png/webp, máx. 5 MB, transformación automática a 1600px de lado
   mayor, calidad auto.
2. Tras subir, el cliente envía publicId y url al servidor, que valida
   con la API de Cloudinary que el recurso existe y pertenece a esa
   carpeta, y recién ahí crea el registro Image.
3. LÍMITE DE 10: validá en el servidor dentro de una transacción con
   bloqueo de la fila del Profile (SELECT ... FOR UPDATE vía
   $queryRaw) para evitar que dos subidas simultáneas superen 10. Dejá
   un comentario explicando la condición de carrera.
4. Eliminar: borra en Cloudinary y en la base. Reordenar con drag & drop
   (campo order). El admin puede ocultar imágenes (isHidden) y las
   ocultas no se muestran en cards ni en el perfil.
5. Compresión en el cliente antes de subir (conexiones lentas del
   interior) y reintento con mensaje claro si se corta.
6. UI: grilla responsive, barra de progreso, contador "7/10", errores
   claros, miniaturas optimizadas con next/image.
7. Aviso en la UI: no subir imágenes con teléfonos, datos personales de
   terceros ni contenido ajeno.

CRITERIOS: subir la imagen 11 falla con mensaje claro incluso con
peticiones en paralelo; un usuario no puede borrar ni reordenar imágenes
ajenas (IDOR).

SALIDA: archivos completos + un script de prueba que lance 12 subidas
simultáneas y verifique que quedan exactamente 10.
```

---

## Módulo 2.2 — Planes y precio configurable

**Depende de:** 1.9. **Entrega:** tabla Plan y lectura del precio desde la base en todo el sistema.

```
TAREA: Hacé el precio de la suscripción configurable desde el inicio.

MODELO:
- Plan: id, name, amount (Int en centavos o Decimal, definí uno y
  mantenelo en todo el proyecto), currency "ARS", isActive,
  validFrom.
- Subscription (la completa el módulo 2.3) tendrá planId y planAmount
  (monto con el que cobra hoy cada suscriptor) y priceFrozen (Boolean).

REGLAS:
1. Seed con un plan "Mensual" de $10.000 ARS.
2. Función getCurrentPlan() con caché corta; es la ÚNICA fuente del
   precio. Prohibido hardcodear montos en UI, emails o textos legales:
   todo se arma con el valor leído.
3. Helper formatArs(amount) para mostrar "$10.000/mes" en toda la app.
4. Un cambio de precio NO afecta a quienes ya están suscriptos hasta que
   se aplique un ajuste programado con aviso (módulo 4.3).

CRITERIOS: cambiar el monto del plan en la base cambia el precio mostrado
en el checkout sin tocar código; los suscriptores existentes conservan su
planAmount.

SALIDA: modelo, migración, seed, servicio, helper y tests.
```

---

## Módulo 2.3 — Suscripción con Mercado Pago

**Depende de:** 2.2. **Entrega:** alta de suscripción, estado y cancelación de renovación.

```
TAREA: Integrá Mercado Pago Suscripciones (API Preapproval) con el plan
vigente.

MODELO Subscription: profileId, planId, planAmount, status (PENDING |
ACTIVE | PAST_DUE | EXPIRED | CANCELED), mpPreapprovalId único,
currentPeriodEnd, graceUntil, cancelAtPeriodEnd, priceFrozen, createdAt.
Modelo Payment: subscriptionId, mpPaymentId único, amount, mpFee, netAmount,
status (APPROVED | REJECTED | PENDING | REFUNDED | CHARGED_BACK), paidAt,
refundedAt.
Datos fiscales en Profile (o tabla aparte): nombre o razón social,
CUIT/CUIL/DNI, condición frente al IVA, domicilio fiscal. Se piden ANTES
del primer pago (los usa la facturación del módulo 2.5).

REQUISITOS PREVIOS PARA PAGAR (validar en servidor): email verificado,
WhatsApp verificado, perfil completo y datos fiscales cargados. Si falta
algo, mostrar el checklist con el motivo.

FLUJO:
1. Server action "Suscribirme": crea un preapproval con
   auto_recurring { frequency: 1, frequency_type: "months",
   transaction_amount: monto del plan, currency_id: "ARS" },
   external_reference = profileId, back_url a
   /panel/suscripcion/resultado y notification_url a
   /api/webhooks/mercadopago.
2. Guardá Subscription con status PENDING y el mpPreapprovalId.
3. Antes de redirigir, mostrar un resumen claro con precio final,
   periodicidad, renovación automática y cómo cancelar, con un checkbox
   de aceptación de términos (se guarda con fecha y versión de los
   términos).
4. Redirigí al init_point de Mercado Pago.
5. Página /panel/suscripcion: estado, próxima fecha de cobro, historial
   de pagos, botón "Cancelar renovación automática" (cancela el
   preapproval y marca cancelAtPeriodEnd; el perfil sigue visible hasta
   el fin del período pagado).
6. Bloqueá crear una segunda suscripción si ya hay una ACTIVE o PENDING
   (restricción en base, no solo en código).

REQUISITOS: usar credenciales de prueba en desarrollo; todo el flujo
detrás del login; ninguna credencial en el cliente.

SALIDA: servicios, rutas y UI completos, más instrucciones para probar
con usuarios y tarjetas de prueba de Mercado Pago.
```

---

## Módulo 2.4 — Webhook de Mercado Pago

**Depende de:** 2.3. **Entrega:** máquina de estados de la suscripción con idempotencia.

```
TAREA: Creá /api/webhooks/mercadopago.

Eventos: subscription_preapproval (alta/cambios de estado),
subscription_authorized_payment y payment.

REQUISITOS CRÍTICOS:
1. Validá la firma: header x-signature (ts y v1) con HMAC-SHA256 sobre
   el manifest "id:{data.id};request-id:{x-request-id};ts:{ts};" usando
   MP_WEBHOOK_SECRET y comparación en tiempo constante. Inválida → 401.
2. NUNCA confíes en el body: con el id recibido consultá a la API de
   Mercado Pago el estado real del pago/preapproval.
3. Idempotencia: registrá cada evento en WebhookEvent (provider
   MERCADOPAGO); si ya estaba procesado, respondé 200 sin repetir.
4. Reglas de estado:
   - Pago aprobado → Subscription ACTIVE, currentPeriodEnd =
     fecha de pago + 1 mes, crear Payment con mpFee y netAmount
     (fee_details), llamar a syncPublication, email de confirmación y
     disparar la emisión de factura (stub hasta el módulo 2.5).
   - Pago rechazado/pendiente → PAST_DUE con graceUntil = ahora + días
     de gracia configurables.
   - Preapproval cancelado → cancelAtPeriodEnd = true.
   - Pago reembolsado o contracargo → Payment REFUNDED o CHARGED_BACK,
     disparar nota de crédito (stub), recalcular publicación.
5. Responder 200 rápido; ante un error transitorio, devolvé 500 para
   que Mercado Pago reintente.
6. Logs estructurados sin datos sensibles.

CRITERIOS: reenviar el mismo webhook 5 veces genera un solo Payment; un
webhook falso es rechazado; un pago aprobado publica el perfil solo si
también se cumplen las demás condiciones de evaluatePublishability.

SALIDA: archivo completo, tests con payloads de ejemplo y la máquina de
estados explicada en una tabla.
```

---

## Módulo 2.5 — Facturación electrónica (ARCA)

**Depende de:** 2.4. **Entrega:** factura por cada pago aprobado, desacoplada del proveedor.

> Los textos fiscales son orientativos: confirmalos con tu contador antes de lanzar.

```
TAREA: Generá una factura electrónica por cada pago aprobado de
suscripción.

DISEÑO:
1. Interfaz `InvoiceProvider` (emitirFactura, anularFactura,
   obtenerPdf) con una implementación para un proveedor de facturación
   electrónica [NOMBRE: TusFacturas, Facturante, Afip SDK u otro] y un
   `MockInvoiceProvider` para desarrollo, así se puede cambiar de
   proveedor sin tocar el resto del código.
2. Modelo Invoice: paymentId único, tipo de comprobante (configurable:
   A, B o C según mi condición fiscal), punto de venta, número, CAE,
   vencimiento del CAE, importe neto, IVA, total, pdfUrl, estado
   (PENDING | ISSUED | FAILED | VOIDED).
3. Emisión: al confirmar el pago en el webhook se encola la emisión (job
   con reintentos y backoff). Si falla, la suscripción sigue activa y la
   factura queda FAILED para reintento manual desde /admin.
4. Enviar el PDF por email y mostrarlo en el historial de pagos.
5. Usar mpFee y netAmount de Payment para mostrar en /admin el ingreso
   NETO real.
6. Notas de crédito automáticas cuando se hace un reembolso.
7. Reporte mensual exportable en CSV para el contador (ventas, IVA,
   comisiones).

CRITERIOS: un pago aprobado genera exactamente una factura (idempotente
aunque el webhook llegue repetido); un reembolso genera nota de crédito.

SALIDA: interfaz, proveedores, jobs, modelos, UI y tests.
```

---

## Módulo 2.6 — Baja online y botón de arrepentimiento

**Depende de:** 2.4 y 2.5. **Entrega:** baja en 2 clics y arrepentimiento con reembolso consistente.

> Plazos y requisitos legales: confirmalos con un abogado (se mencionan la Ley 24.240, el art. 10 ter de baja y la Res. 424/2020 de arrepentimiento, para que los verifique).

```
TAREA: Implementá la baja y el arrepentimiento del servicio.

1. BOTÓN "DARME DE BAJA": visible en el pie de TODAS las páginas y en
   /panel/suscripcion. Cancela el preapproval en Mercado Pago, marca
   cancelAtPeriodEnd, envía email de confirmación y mantiene el perfil
   visible hasta el fin del período pagado. No más de 2 clics ni motivos
   obligatorios (el motivo es opcional).
2. BOTÓN DE ARREPENTIMIENTO: página /arrepentimiento y botón visible,
   que permite solicitar la revocación dentro de los 10 días corridos
   desde la contratación. Si corresponde: reembolso total vía API de
   Mercado Pago, cancelación, despublicación, nota de crédito (2.5) y
   email con constancia y número de trámite.
3. Modelo CancellationRequest: tipo (BAJA | ARREPENTIMIENTO), motivo,
   estado, fechas, número de trámite.
4. Si el pago ya fue reembolsado, bloquear un segundo reembolso.
5. Página /libro-de-quejas con formulario (enlace a defensa del
   consumidor de Tucumán y datos de contacto del proveedor).

CRITERIOS: cancelar es posible sin hablar con nadie; un reembolso por
arrepentimiento deja todo consistente (pago, factura, perfil publicado).

SALIDA: páginas, acciones de servidor, integración con la API de
reembolsos, plantillas de email y tests.
```

---

## Módulo 2.7 — Cron diario: renovaciones y avisos

**Depende de:** 2.4. **Entrega:** registro de jobs idempotentes que se reutiliza en los módulos 3.5, 4.3 y 4.4.

```
TAREA: Implementá un cron en /api/cron/daily (Vercel Cron, diario a las
09:00 hora Argentina) protegido con `Authorization: Bearer CRON_SECRET`.

ARQUITECTURA: un registro de jobs (src/server/jobs/registry.ts) donde cada
job es una función idempotente con nombre, que recibe la fecha actual
(inyectable para tests) y devuelve un resumen. El endpoint ejecuta todos
los jobs registrados, aísla los errores (un job que falla no corta a los
otros) y devuelve un resumen JSON. Los módulos futuros solo registran un
job nuevo.

JOBS DE ESTE MÓDULO:
1. Avisos: suscripciones ACTIVE cuyo currentPeriodEnd vence en 5 días y
   en 2 días → email "Tu perfil vence pronto" con botón para pagar o
   confirmar la renovación. Usá EmailLog con restricción única
   (template + dedupeKey) para no duplicar.
2. Vencidas: suscripciones cuyo currentPeriodEnd ya pasó y no se
   renovaron → EXPIRED, llamar a syncPublication y enviar el email "Tu
   perfil fue despublicado" con botón para reactivar.
3. Período de gracia: PAST_DUE con graceUntil vencido → EXPIRED.
4. Limpieza de verificaciones de WhatsApp vencidas (PENDING con
   expiresAt pasado → EXPIRED) y de señales de IP con más de 30 días.
5. Idempotente: si el cron corre dos veces el mismo día, no se envían
   emails repetidos.

Plantillas HTML de email en español con tono cercano, marca y botón
claro. Todas las plantillas leen el precio de getCurrentPlan().

CRITERIOS: un script de prueba simula fechas y verifica cada caso;
ejecutar el cron dos veces seguidas no duplica nada; un job que lanza una
excepción no impide que corran los demás.

SALIDA: ruta, registro de jobs, servicios, plantillas, vercel.json y
tests.
```
