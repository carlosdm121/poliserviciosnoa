# Semana 4 — Administración, soporte, legales, seguridad y calidad

Pegar siempre antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

> Cambios respecto de la versión anterior: el admin gestiona números verificados, lista de bloqueo, señales de riesgo y aprobación manual (en vez de identidades KYC); los legales ya no hablan de biometría y aclaran qué significa "WhatsApp verificado"; los tests cubren el webhook de WhatsApp.

---

## Módulo 4.1 — Panel de administración

**Depende de:** 3.7. **Entrega:** /admin con permisos por rol y registro de auditoría.

```
TAREA: Creá /admin (solo roles ADMIN y MODERADOR, verificado en
servidor en cada página Y en cada server action).

MATRIZ DE PERMISOS:
- ADMIN: todo.
- MODERADOR: perfiles, moderación, reclamos, reportes y soporte. NO ve
  pagos, facturas, finanzas ni cambia precios, rubros o configuración.

SECCIONES:
1. Usuarios y perfiles: tabla con filtros (WhatsApp verificado sí/no,
   estado de moderación, suscripción, provincia, tipo persona/empresa),
   búsqueda, suspender/reactivar perfil con motivo. Impersonación NO
   permitida.
2. Aprobación de altas: cola de perfiles en PENDING_REVIEW (cuando
   requireManualApproval está activo) con vista previa del perfil,
   aprobar, rechazar con motivo (email al profesional) o suspender.
3. Verificaciones y riesgo: señales de riesgo (RiskSignal) con su
   detalle, números con verificación fallida o bloqueada, casos "NO FUI
   YO", y administración de la lista de bloqueo (agregar y quitar
   identificadores con motivo). Acción "marcar número como verificado a
   mano" (ManualProvider) con motivo obligatorio.
4. Empresas: cola de constancias de inscripción pendientes (documento
   privado, con URL firmada de corta duración), botón "Empresa
   verificada" y rechazo con motivo; el documento se borra al resolver.
5. Matrículas: lista de perfiles con "Matrícula informada" para marcar
   revisión manual.
6. Moderación: reportes pendientes, reclamos (servicios del módulo 3.7),
   ocultar imágenes, anular votos sospechosos (annulVote del módulo 3.1)
   y suspender perfil con motivo.
7. Rubros y ciudades: crear, editar, ordenar, activar/desactivar y
   reasignar "Otra localidad" a una ciudad real.
8. Pagos y finanzas (solo ADMIN): listado, totales del mes, MRR,
   ingreso bruto y NETO (después de comisión de Mercado Pago), perfiles
   activos, vencidos y cancelados, facturas fallidas con reintento
   manual.
9. Configuración (solo ADMIN): requireManualApproval,
   minProfilesToOpenCategory, días de gracia, lista de dominios de email
   descartables.
10. Registro de auditoría (AuditLog): quién hizo qué y cuándo.

REGLAS: toda acción admin escribe en AuditLog; paginación en todas las
tablas; confirmación antes de acciones destructivas; todas las
decisiones sobre un perfil llaman a syncPublication.

CRITERIOS: un usuario común recibe 403 en cualquier ruta /admin y en sus
server actions; un MODERADOR no puede abrir la sección de pagos ni
cambiar configuración; ninguna acción del admin queda sin registro.

SALIDA: páginas, acciones, migración de lo que falte y tests de
autorización por rol.
```

---

## Módulo 4.2 — Soporte y moderación

**Depende de:** 4.1. **Entrega:** tickets, bandeja unificada, SLA y manual de operaciones.

```
TAREA: Armá el sistema de soporte y moderación.

1. Centro de ayuda /ayuda con preguntas frecuentes por tema (para
   profesionales y para clientes), buscables. Incluir una FAQ sobre qué
   significa "WhatsApp verificado" y cómo verificar el número.
2. Formulario /soporte con ticket: SupportTicket (usuario opcional,
   asunto, categoría, mensaje, estado ABIERTO | EN_CURSO | RESUELTO,
   prioridad, asignado a). Confirmación por email con número de ticket.
   Categoría específica "No puedo verificar mi número".
3. Bandeja en /admin/soporte: filtros, asignación, respuestas
   predefinidas (plantillas), historial y cierre. Las respuestas del
   admin se envían por email al usuario.
4. Colas unificadas en /admin con contadores de pendientes: reportes,
   reclamos, matrículas, empresas, altas por aprobar, señales de riesgo,
   votos sospechosos y facturas fallidas.
5. SLA configurables y alertas: primera respuesta en 24 h hábiles,
   resolución en 72 h; job del cron que avisa por email si se vencen.
6. Registro de auditoría de todas las acciones.

TAMBIÉN: generá un "Manual de operaciones" de 2 páginas con quién
responde qué, horarios, plazos, criterios para suspender perfiles y
agregar números a la lista de bloqueo, respuestas modelo y qué escalar al
dueño.

SALIDA: modelos, UI, job de SLA y el manual.
```

---

## Módulo 4.3 — Ajustes de precio con aviso

**Depende de:** 2.7 y 4.1. **Entrega:** aumentos programados con aviso previo.

```
TAREA: Gestioná aumentos de precio con aviso, sobre la tabla Plan del
módulo 2.2.

MODELO: PriceChange: planId, montoNuevo, fechaAviso, fechaAplicacion
(mínimo 30 días después del aviso, configurable), estado (PROGRAMADO |
AVISADO | APLICADO | CANCELADO).

FLUJO:
1. /admin/precios (solo ADMIN): crear un aumento programado.
2. A la fecha de aviso, job del cron: email a todos los suscriptores
   activos con el nuevo monto, la fecha de vigencia y cómo cancelar.
3. A la fecha de aplicación, job del cron: actualizar el monto del
   preapproval de cada suscriptor vía la API de Mercado Pago (verificá en
   la documentación vigente el endpoint y los límites) y el planAmount
   local. Procesar por lotes con reintentos y registrar fallos.
4. Opción de "congelar el precio" para un grupo (ej. socios fundadores)
   con la bandera priceFrozen de la suscripción.
5. El checkout siempre muestra el precio vigente leído de la base de
   datos.

CRITERIOS: nadie es cobrado un monto nuevo sin haber recibido el aviso
con la anticipación configurada; un fallo en un lote no corta el resto;
los suscriptores con precio congelado no cambian.

SALIDA: modelo, panel admin, jobs, plantillas de email y tests.
```

---

## Módulo 4.4 — Derechos del titular y borrado de datos

**Depende de:** 4.1. **Entrega:** acceso, rectificación y supresión (Ley 25.326), con política de retención.

> El plazo fiscal de conservación lo define tu contador; la Ley 25.326 y su reglamentación, tu abogado.

```
TAREA: Implementá el ejercicio de derechos (Ley 25.326): acceso,
rectificación y supresión.

1. /panel/cuenta/datos:
   - "Descargar mis datos": exporta un JSON/ZIP con perfil, imágenes
     (URLs), número de WhatsApp, suscripciones, pagos, contactos y votos
     propios.
   - "Eliminar mi cuenta": confirmación por email y período de gracia de
     30 días con posibilidad de arrepentirse.
2. Proceso de supresión (job del cron): cancelar la suscripción en
   Mercado Pago, borrar imágenes de Cloudinary, borrar documentos de
   empresa y evidencias de reclamos asociadas, borrar registros de
   WhatsAppVerification, anonimizar User y Profile (email y nombre
   reemplazados por valores irreversibles, whatsappE164 borrado) y borrar
   votos y contactos.
3. QUÉ SE CONSERVA: facturas y registros de pago por el plazo fiscal
   legal [PLAZO A CONFIRMAR CON MI CONTADOR], desvinculados de datos
   personales innecesarios. El hash del número de WhatsApp (o del CUIT)
   se conserva en la lista de bloqueo SOLO si el perfil fue suspendido
   por fraude.
4. Lo mismo para clientes (CLIENT): borrar contactos, votos, reclamos
   propios y cuenta.
5. Modelo DataRequest (tipo, estado, fechas) con registro para demostrar
   el cumplimiento.
6. Política de retención en un archivo central (por ejemplo,
   src/lib/retention.ts) y documentada en /privacidad: documentos de
   empresa se borran al resolver la revisión; señales de IP, a los 30
   días; verificaciones de WhatsApp vencidas, a los 30 días.

CRITERIOS: tras la supresión no queda ningún dato personal recuperable
salvo lo exigido por ley; el proceso es idempotente; los votos del
usuario borrado se descuentan de heartsCount.

SALIDA: UI, job, modelo, exportación y tests.
```

---

## Módulo 4.5 — SEO

**Depende de:** 3.3 y 3.4. **Entrega:** metadatos, sitemap, robots y textos únicos por combinación.

```
TAREA: Optimizá el SEO.

- generateMetadata dinámico en home, rubros, provincia+rubro,
  provincia+ciudad+rubro y perfiles (title, description, canonical, Open
  Graph, Twitter cards).
- sitemap.xml dinámico con: rubros, combinaciones provincia/rubro y
  provincia/ciudad/rubro SOLO si tienen al menos 1 perfil que cumpla
  publicProfileWhere (evitar páginas vacías), y perfiles publicados.
- robots.txt: bloquear /panel, /admin, /api y /mis-contactos. Páginas
  de resultados sin perfiles con noindex.
- JSON-LD: Organization, BreadcrumbList y LocalBusiness en perfiles
  (con areaServed y SIN aggregateRating). Nunca usar los términos
  "identidad verificada" en metadatos ni datos estructurados.
- Páginas /[provincia]/[rubro] con texto introductorio único por
  combinación (plantilla con variaciones reales según rubro, provincia y
  ciudades principales, evitando contenido duplicado).
- Imágenes con alt descriptivo y next/image.
- Core Web Vitals: lazy loading, fuentes optimizadas, sin layout shift.

SALIDA: archivos completos y checklist para verificar en Google Search
Console.
```

---

## Módulo 4.6 — Documentos legales

**Depende de:** 4.4. **Entrega:** borradores de /terminos, /privacidad y /politica-de-pagos.

```
TAREA: Redactá borradores de /terminos, /privacidad y /politica-de-pagos
para un portal de servicios en Argentina.

INCLUÍ:
- Rol de intermediario: la plataforma no presta ni garantiza los
  servicios, ni es parte del contrato entre cliente y profesional.
- QUÉ SIGNIFICA "WHATSAPP VERIFICADO": el profesional demostró que
  controla ese número. NO implica verificación de identidad, de
  antecedentes, de idoneidad ni de matrícula. "Matrícula informada" es un
  dato declarado por el profesional, salvo revisión manual indicada.
  "Empresa verificada" significa que se revisó la constancia de
  inscripción presentada.
- Responsabilidades del profesional, contenido prohibido, suspensión de
  cuentas y lista de bloqueo.
- Suscripción mensual, renovación automática, aumentos con aviso previo,
  baja online y botón de arrepentimiento, reembolsos y facturación.
- Tratamiento de datos personales (Ley 25.326): datos que se tratan
  (email, número de WhatsApp, datos fiscales, imágenes, contactos y
  votos de clientes), finalidades, proveedores externos (Mercado Pago,
  Cloudinary, Resend, Meta/WhatsApp Cloud API, Vercel, base de datos y
  Upstash) con eventual transferencia internacional, plazos de
  conservación (ver política de retención del módulo 4.4), derechos de
  acceso, rectificación y supresión y cómo ejercerlos.
- NO se tratan datos biométricos ni se piden documentos de identidad.
- Inscripción de la base de datos ante la AAIP.
- Reclamos y moderación: canal privado, descargo del profesional.
- Defensa del consumidor, Libro de quejas y jurisdicción de Tucumán.

IMPORTANTE: son borradores; al final, indicá en una lista qué puntos debe
revisar un abogado antes de publicar (arrepentimiento, baja, AAIP,
transferencias internacionales, plazos, cláusulas de responsabilidad).
```

---

## Módulo 4.7 — Seguridad

**Depende de:** todo lo anterior. **Entrega:** auditoría y endurecimiento de todo el proyecto.

```
TAREA: Auditá y reforzá la seguridad de TODO el proyecto.

Implementá:
1. Headers de seguridad en next.config: CSP adaptada a Cloudinary,
   Mercado Pago y a los orígenes realmente usados (la verificación de
   WhatsApp usa solo enlaces wa.me y llamadas del servidor a la API de
   Meta, no del navegador), HSTS, X-Frame-Options, Referrer-Policy,
   Permissions-Policy.
2. Rate limiting global y específico: login, registro, recuperación de
   contraseña, enlaces mágicos, generación de códigos de verificación
   de WhatsApp, contacto, votos, reportes, reclamos, subida de imágenes
   y soporte.
3. Revisión de autorización (IDOR) en cada server action y ruta API:
   listá cada endpoint, quién puede llamarlo y cómo se verifica. Incluí
   los webhooks (Mercado Pago y WhatsApp: firma obligatoria), el cron
   (Bearer CRON_SECRET) y confirmá que /api/dev/* NO existe en
   producción.
4. Protección CSRF en acciones sensibles y cookies seguras (httpOnly,
   secure, sameSite).
5. Sanitización de entradas y salidas, y consultas Prisma sin SQL crudo
   inseguro (revisá especialmente los $queryRaw de bloqueo de filas y de
   búsqueda).
6. Documentos y evidencias privados: acceso solo por URL firmada de
   corta duración y con verificación de rol.
7. Datos personales: teléfono, email y códigos nunca en logs ni en
   Sentry; manejo de errores que no filtre stack traces al cliente.
8. Peligros específicos: suplantación del número (módulo 1.7), enumeración
   de usuarios en login y verificación, scraping de números (el número
   solo sale en la redirección de /api/contacto con rate limiting).
9. `npm audit` y pinning de dependencias.

SALIDA: tabla de endpoints con su control de acceso, archivos
modificados completos y lista de riesgos residuales.
```

---

## Módulo 4.8 — Tests

**Depende de:** todo lo anterior. **Entrega:** suite de Vitest + Playwright de los flujos críticos.

```
TAREA: Escribí tests (Vitest para lógica, Playwright para E2E) de:

1. Límite de 10 imágenes con concurrencia y límite de 2 rubros, 4
   subcategorías y 8 ciudades de cobertura con concurrencia.
2. Webhook de Mercado Pago: firma válida/inválida, idempotencia, pago
   aprobado, rechazado, reembolso y cancelación.
3. Webhook de WhatsApp: handshake GET, firma válida/inválida, código
   correcto, vencido y reutilizado, remitente con y sin el 9, número ya
   usado por otro perfil (P2002), 5 intentos que bloquean, idempotencia
   por wamid y respuesta "NO FUI YO".
4. Cron: avisos a 5 y 2 días, expiración, gracia, no duplicación de
   emails y aislamiento de errores entre jobs.
5. Reglas de publicación: tabla de evaluatePublishability (email +
   WhatsApp + perfil completo + suscripción + aprobación + suspensión).
6. Autorización: usuario A no accede a datos de usuario B; cliente no
   entra a /panel; usuario común no entra a /admin; moderador no entra a
   pagos.
7. Normalización de WhatsApp y validación de CUIT.
8. Búsqueda: por rubro secundario, por cobertura de ciudad, por
   provincia completa, filtro persona/empresa, perfiles no publicados
   nunca aparecen.
9. Votos y reclamos: voto sin contacto devuelto 403, doble clic, contador
   reconciliado, reclamo sin contacto rechazado, suspensión automática.
10. E2E: registro → perfil completo → verificación de WhatsApp (con el
    simulador) → pago (mock) → perfil visible en búsqueda → clic a
    WhatsApp que redirige con el mensaje correcto.

Configurá una base de datos de test aislada y scripts en package.json.

SALIDA: archivos de prueba, configuración y comandos.
```

---

## Módulo 4.9 — PWA, rendimiento y QA

**Depende de:** 4.8. **Entrega:** app instalable, rápida en conexiones lentas y revisada como QA senior.

```
TAREA: Optimizá la web para conexiones lentas y celulares de gama baja,
volvela instalable (PWA) y revisá la app completa como QA senior.

PWA Y RENDIMIENTO:
1. Manifest (nombre, íconos, colores, start_url) y service worker (con
   Serwist o equivalente para Next.js): caché primero para estáticos e
   imágenes, red primero para búsqueda; NUNCA cachear pagos, sesiones ni
   la verificación de WhatsApp. Página offline amigable.
2. Imágenes con f_auto, q_auto, anchos responsivos (srcset), miniaturas
   pequeñas en las cards y carga diferida.
3. Presupuesto: JS inicial < 150 KB, LCP < 2,5 s en 4G lenta, análisis
   del bundle y división de código por ruta.
4. Aviso de "Instalar la app" discreto y no invasivo.
5. Tolerancia a fallos: reintentos con mensajes claros, subida de
   imágenes con compresión previa.
6. Pruebas con Lighthouse y throttling "Slow 4G" y "Fast 3G"; informe.

QA:
- Accesibilidad (labels, contraste, foco por teclado, aria).
- Responsive en 360px, 390px, 768px y escritorio.
- Estados de carga, vacío y error en todas las pantallas.
- Consultas N+1 y caché donde corresponda (revalidate).
- Textos en español rioplatense, consistentes y con mensajes de error
  útiles; ninguna aparición de "identidad verificada".
- Páginas 404/500 con marca.

CRITERIOS: Lighthouse móvil > 90 en rendimiento; la home carga útil en
menos de 4 s con 3G rápida; los pagos nunca se sirven desde caché.

SALIDA: lista priorizada de hallazgos, configuración, service worker y
archivos corregidos completos.
```
