# Semana 5 — Deploy, monitoreo, pruebas reales y lanzamiento

Pegar siempre antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

> Cambios respecto de la versión anterior: se reemplaza el webhook del proveedor KYC por el de WhatsApp Cloud API (Meta), las pruebas reales verifican números de WhatsApp en vez de rostros, y la captación de profesionales destaca que verificar el número lleva un minuto y no pide documentos.

---

## Módulo 5.1 — Deploy a producción

**Depende de:** 4.9. **Entrega:** guía paso a paso para producción en Vercel.

```
TAREA: Preparame el deploy a producción en Vercel con PostgreSQL
gestionado (Neon o Supabase).

Incluí:
1. Checklist de variables de entorno de producción (sin valores),
   incluidas las de WhatsApp (WHATSAPP_PLATFORM_NUMBER,
   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
   WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN) y PHONE_HASH_PEPPER
   (aclará que NO puede cambiarse después de tener datos, porque
   invalidaría todos los hashes).
2. Configuración de dominio, DNS, HTTPS y redirección www.
3. Migraciones: `prisma migrate deploy` en el build, y estrategia para
   no perder datos. Orden: migrar primero, desplegar después.
4. Configuración de vercel.json (cron diario a /api/cron/daily) y
   regiones cercanas (São Paulo si está disponible).
5. Webhooks de producción: las URLs exactas que debo cargar en Mercado
   Pago (/api/webhooks/mercadopago) y en Meta for Developers
   (/api/webhooks/whatsapp, con el verify token y la suscripción al campo
   messages). Cómo probar el handshake GET.
6. WhatsApp Cloud API en producción: número dedicado de la plataforma,
   token permanente de usuario del sistema, nombre de perfil de empresa,
   y los pasos que Meta pueda exigir para pasar de modo prueba a
   producción (verificación del negocio, límites de mensajes). Indicá que
   confirme cada requisito en la documentación vigente.
7. Dominio verificado en Resend (SPF, DKIM, DMARC) para que los emails
   no caigan en spam.
8. Pooling de conexiones de la base de datos.
9. Confirmar que /api/dev/* no existe en producción y que
   requireManualApproval está activo para el arranque.

SALIDA: guía paso a paso numerada.
```

---

## Módulo 5.2 — Monitoreo y respaldos

**Depende de:** 5.1. **Entrega:** observabilidad, alertas, health check, backups y runbook.

```
TAREA: Configurá monitoreo y respaldos.
- Sentry (cliente y servidor) con filtrado de datos personales
  (teléfonos, emails, códigos, tokens).
- Alertas: fallas del webhook de pago, del webhook de WhatsApp (firmas
  inválidas repetidas, errores 5xx, caída del envío de respuestas), del
  cron y de la facturación.
- Endpoint /api/health (base de datos y servicios externos, sin exponer
  detalles internos).
- Backups automáticos diarios de la base de datos y procedimiento
  documentado de restauración (probarlo una vez).
- Uptime monitoring externo.
- Panel simple en /admin con los últimos errores de webhooks (Mercado
  Pago y WhatsApp) y de jobs del cron.

SALIDA: archivos, configuración y runbook de incidentes de una página,
con un caso específico: "los profesionales no reciben la confirmación al
verificar su número".
```

---

## Módulo 5.3 — Plan de pruebas con pagos reales

**Depende de:** 5.1. **Entrega:** plan de pruebas en producción con montos mínimos, conciliación incluida.

```
TAREA: Dame un plan de pruebas en producción con pagos reales de bajo
monto para validar todo el ciclo:

1. Alta de profesional: registro, email verificado, perfil completo,
   verificación de WhatsApp real, suscripción, cobro, activación y
   publicación (con y sin aprobación manual).
2. Verificación de WhatsApp real con 3 personas distintas, y los casos
   límite: código vencido, código reutilizado, número ya usado por otro
   perfil, escribir desde otro número y responder "NO FUI YO".
3. Renovación automática (cómo simularla o esperarla con un plan de
   prueba de monto mínimo).
4. Pago rechazado y período de gracia.
5. Cancelación y despublicación al fin del período.
6. Arrepentimiento dentro de los 10 días: reembolso, nota de crédito y
   estado del perfil.
7. Reembolso manual desde Mercado Pago y su reflejo en la base.
8. Cliente: ingreso, contacto por WhatsApp, voto a las 24 h, invitación
   a las 48 h y un reclamo.

Para cada caso: pasos, resultado esperado y qué tabla/registro revisar.
Agregá un script SQL de conciliación entre Payments, Invoices y Mercado
Pago.
```

---

## Módulo 5.4 — Cupones, socios fundadores y reglas de apertura

**Depende de:** 5.1. **Entrega:** herramientas para resolver el problema del huevo y la gallina.

```
TAREA: Implementá las herramientas de lanzamiento.

1. CUPONES: modelo Coupon (código, tipo: MES_GRATIS | PORCENTAJE |
   MONTO_FIJO, valor, cupo máximo de usos, vigencia, rubros o
   provincias habilitadas) y CouponRedemption. Integración con Mercado
   Pago usando período de prueba (free_trial del preapproval) o primer
   cobro con descuento, según el tipo. Un cupón no se puede usar dos veces
   por el mismo perfil, ni por el mismo número de WhatsApp verificado, ni
   por el mismo CUIT.
2. PROGRAMA "SOCIOS FUNDADORES": los primeros 100 profesionales obtienen
   el primer mes gratis, el precio congelado (priceFrozen, módulo 4.3) y
   una insignia "Socio fundador". Contador público de cupos restantes en
   /publica-tu-servicio.
3. REFERIDOS: cada profesional tiene un enlace único; si el referido
   paga su primer mes, ambos reciben un mes de descuento. Evitar
   autorreferidos comparando número de WhatsApp verificado, CUIT, email,
   IP/dispositivo (hash) y datos fiscales.
4. REGLA DE APERTURA POR RUBRO: completá lo que dejó el módulo 3.3. Un
   rubro con "Próximamente" muestra el formulario "Avisame cuando haya"
   (lista de espera de clientes por rubro y ciudad, con baja) y el aviso
   automático por email cuando se abre.
5. Lista de espera de profesionales por rubro (pre-registro) con email
   automático al abrir la plataforma.
6. Panel /admin/lanzamiento: perfiles por rubro y provincia, conversión
   de registro → WhatsApp verificado → pago, cupones usados, referidos y
   lista de espera.
7. Plan de lanzamiento por provincia: empezar por Tucumán, luego sumar
   provincias cuando alcancen un umbral configurable de perfiles.

CRITERIOS: un cupón no se puede usar más veces que su cupo ni dos veces
por la misma persona; los rubros sin oferta no se muestran vacíos; un
autorreferido es rechazado.

SALIDA: modelos, UI, integración de pago, panel y tests.
```

---

## Módulo 5.5 — Landing de captación y contenido

**Depende de:** 5.4. **Entrega:** /publica-tu-servicio y material de lanzamiento.

```
TAREA: Creá una landing /publica-tu-servicio para captar profesionales:
propuesta de valor (visibilidad, contactos directos por WhatsApp, sin
comisiones, precio leído de getCurrentPlan()), "verificás tu número en 1
minuto, sin subir documentos ni fotos", cómo funciona en 4 pasos
(registrate, completá tu perfil, verificá tu WhatsApp, activá tu
suscripción), preguntas frecuentes (qué significa WhatsApp verificado,
pagos, cancelación y arrepentimiento, privacidad de los datos),
contador de cupos de socios fundadores, testimonios (con
placeholders), botón de registro y versión optimizada para compartir en
WhatsApp e Instagram (Open Graph con imagen).

Además redactá: mensaje de WhatsApp para contactar oficios en Tucumán,
guion de 30 segundos para video corto, y 10 ideas de contenido para
redes de lanzamiento.
```

---

## Módulo 5.6 — Piloto y mejoras

**Depende de:** 5.5. **Entrega:** priorización y corrección de lo que aparezca con los primeros profesionales.

```
Estos son los problemas detectados en el piloto con los primeros
profesionales: [lista]. Priorizalos por impacto en ingresos y confianza,
estimá el esfuerzo de cada uno y resolvelos en orden entregando los
archivos completos. Revisá específicamente: en qué paso del alta se
abandona (registro, perfil, verificación de WhatsApp, pago), cuántos
códigos de verificación vencen sin usar, si hay números de WhatsApp con
problemas de formato y si la aprobación manual está demorando altas.
```

Ideas para después del lanzamiento:
- Reseñas verificadas de clientes.
- Planes destacados (perfil resaltado por un monto extra).
- Estadísticas ampliadas para el profesional (visitas y clics por semana, por rubro).
- Verificación de identidad **opcional** (con costo o por pedido del profesional) como segundo nivel de insignia, solo si el mercado la pide.
- Expansión a más provincias.

---

## Módulo 5.7 — Auditoría final y checklist

**Depende de:** 5.6. **Entrega:** trazabilidad de requisitos y checklist de pre-lanzamiento.

Usar al terminar todo, con el proyecto completo y la lista de requisitos.

```
TAREA: Hacé una auditoría de trazabilidad de requisitos.

REQUISITOS ORIGINALES:
1. Portal de servicios para Tucumán, Salta, Santiago del Estero,
   Catamarca y Jujuy, con 57 rubros y subcategorías.
2. Perfil por profesional/empresa con validación por titularidad del
   número de WhatsApp (sin KYC ni datos biométricos), un número por
   perfil, lista de bloqueo, revisión manual de empresas y base de datos
   sólida sin duplicados.
3. Suscripción mensual (precio configurable, inicial $10.000 ARS) con
   Mercado Pago, renovación automática y avisos antes del vencimiento.
4. Panel de control con hasta 10 imágenes, hasta 2 rubros y cobertura de
   hasta 8 ciudades.
5. Contacto por WhatsApp con mensaje predefinido, también desde la card.
6. Cards por rubro, creadas automáticamente al activarse el perfil.
7. Corazón de confianza votado por quienes contactaron.
8. Búsqueda por rubro, provincia y ciudad.
9. Facturación, baja, arrepentimiento, reclamos, borrado de datos.
10. Soporte, moderación, cupones y lanzamiento, PWA.
11. Ninguna referencia a "identidad verificada", KYC o DNI en código,
    textos, SEO ni documentos legales.

Para CADA requisito: indicá en qué archivos/rutas está implementado, qué
tests lo cubren y cómo probarlo manualmente. Listá lo que falte, lo que
esté a medias y los riesgos residuales, ordenado por gravedad. Verificá
además que isPublished se escriba solo en syncPublication y que ninguna
consulta pública omita publicProfileWhere.
Terminá con una checklist de pre-lanzamiento de 25 puntos (legales,
pagos, WhatsApp/Meta, seguridad, datos, soporte y operación) con
casillas para tildar.
```
