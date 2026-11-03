# Semana 3 — Contacto, confianza, búsqueda y perfil público

Pegar siempre antes: CONTEXTO FIJO + ESTADO ACTUAL (ver archivo 00).

> Reorden clave: primero el backend de contacto y corazón (3.1), después la card (3.2), y recién entonces las páginas que la usan (3.3 y 3.4). Así no hay que "volver" a módulos ya terminados. La búsqueda ya nace con múltiples rubros, cobertura por ciudades, filtro persona/empresa y la insignia "WhatsApp verificado".

---

## Módulo 3.1 — Contactos y corazón (backend)

**Depende de:** 2.4. **Entrega:** ruta de contacto, registro de contactos, votos con anti-fraude y estadísticas diarias.

```
TAREA: Implementá el backend de contacto por WhatsApp y del corazón de
confianza.

MODELOS:
- ContactIntent: id, profileId, clientId (User, obligatorio SOLO cuando
  hay sesión; los contactos anónimos no crean ContactIntent), createdAt.
  Índice (clientId, profileId, createdAt).
- ProfileVote: id, profileId, clientId, createdAt. Clave ÚNICA
  (profileId, clientId): un voto por cliente por profesional. Un voto se
  puede retirar (se borra el registro).
- ProfileDailyStat: profileId, date, views, whatsappClicks. Única
  (profileId, date). Sin ningún dato personal del visitante.
- Profile ya tiene heartsCount, contactsCount, whatsappClicks y
  viewsCount (módulo 1.2).

RUTA /api/contacto/[slug]:
1. Buscá el perfil con publicProfileWhere. Si no está publicado → 404.
2. Rate limiting por IP.
3. Registrá el clic: whatsappClicks +1 y ProfileDailyStat del día (upsert
   atómico), sin guardar IP ni datos del visitante. No contar bots
   conocidos por user-agent.
4. Si hay un cliente logueado con rol CLIENT: crear ContactIntent (como
   máximo uno por cliente y perfil cada 24 h, para que no se infle
   contactsCount) y sumar contactsCount.
5. Redirigí (302) a https://wa.me/{whatsappE164 sin el +}?text={mensaje}
   con el mensaje: "Hola, te vi en [NombrePagina] y me interesa tu
   servicio, quiero solicitar tus servicios" codificado con
   encodeURIComponent. El número NO aparece en el HTML de ninguna página.
6. Si el visitante no está logueado, igual se lo redirige (no se bloquea
   el negocio).

VOTAR:
- toggleVote(profileId) y canVote(profileId, clientId).
- Reglas: sesión y rol CLIENT; el perfil existe y está publicado; el
  email del cliente no coincide con el del dueño del perfil; existe un
  ContactIntent del cliente a ese perfil con antigüedad >=
  VOTE_MIN_HOURS_AFTER_CONTACT (por defecto 24).
- En UNA transacción: si el voto existe se borra y heartsCount -1; si no
  existe se crea y heartsCount +1. Manejá el doble clic con la
  restricción única y el error P2002.
- Rate limiting: máximo 20 votos o retiros por hora por cliente.

DETECCIÓN BÁSICA DE ABUSO: registrá una RiskSignal cuando un mismo
cliente vota a muchos perfiles en poco tiempo, o cuando varios clientes
con el mismo dominio de email descartable votan al mismo perfil. Dejá un
servicio annulVote(voteId, motivo) que borra el voto, corrige el
contador y registra en AuditLog (la pantalla del admin va en el módulo
4.1).

RECONCILIACIÓN: script que recalcula heartsCount desde ProfileVote y
contactsCount desde ContactIntent, y reporta diferencias.

PÁGINA /mis-contactos (solo CLIENT): lista de profesionales contactados
con botón para votar (si ya pasó el tiempo mínimo) y para reportar un
problema (se completa en 3.7).

CRITERIOS: votar sin contacto previo devuelve 403; el doble clic no
duplica el voto; el contador siempre coincide con ProfileVote; el enlace
abre WhatsApp con el mensaje correcto en celular y escritorio; un perfil
vencido o no publicado devuelve 404.

SALIDA: modelos, migración, ruta, acciones, consulta, script de
reconciliación y tests.
```

---

## Módulo 3.2 — Card de profesional

**Depende de:** 3.1. **Entrega:** el componente `<ProfessionalCard />` y su skeleton.

```
TAREA: Creá <ProfessionalCard /> y <ProfessionalCardSkeleton />.

CONTENIDO:
- Foto principal (primera imagen visible de la galería) con next/image y
  relación de aspecto fija para evitar saltos de diseño.
- Persona: nombre. Empresa: logo + nombre comercial y rango de equipo.
- Rubro principal (y secundario si tiene), ciudad base y provincia, y
  "Atiende en: A, B (+2)" si cubre otras ciudades.
- Insignias: "WhatsApp verificado" (todos los perfiles publicados la
  tienen), "Empresa verificada" (si corresponde) y "Matrícula informada"
  (si corresponde). NUNCA "Identidad verificada".
- Descripción corta (máx. 2 líneas con line-clamp).
- Corazón con contador (ej. ♥ 24).
- Botón verde "WhatsApp" bien visible, de ancho completo, que apunta a
  /api/contacto/[slug].
- Botón secundario "Ver perfil" hacia /p/[slug].

COMPORTAMIENTO:
- Si el visitante NO está logueado, el botón WhatsApp funciona igual pero
  se muestra la nota: "Ingresá antes de contactar para poder valorar a
  este profesional después" (el modal de ingreso del módulo 1.5 se abre
  como sugerencia, no como bloqueo).
- Corazón: si el visitante no puede votar (sin sesión, sin contacto de
  24 h o es el dueño), es solo informativo y al tocarlo muestra un
  tooltip que explica cómo se puede votar. Si puede votar, alterna entre
  vacío y lleno con actualización optimista y reversión si el servidor
  falla.
- Accesibilidad: aria-pressed, aria-label con el conteo, foco visible,
  objetivos táctiles de al menos 44px.
- Skeleton con la misma forma que la card.

REGLAS: la card solo se renderiza para datos que ya vinieron filtrados
por publicProfileWhere; el componente NO reevalúa condiciones de
publicación.

CRITERIOS: el botón WhatsApp de la card abre el chat con el mensaje
correcto; la card se ve bien a 360px; la tarjeta no desplaza el diseño al
cargar la imagen.

SALIDA: componente, skeleton, estilos y tests de render con diferentes
combinaciones de datos (persona, empresa, con y sin matrícula, con y sin
cobertura).
```

---

## Módulo 3.3 — Home y buscador

**Depende de:** 3.2. **Entrega:** home, /buscar y rutas amigables con una única función de consulta.

```
TAREA: Construí la home, el buscador y las rutas por provincia y rubro.

UNA SOLA CONSULTA: searchProfiles(filtros) en src/server/search.ts,
basada en publicProfileWhere (módulo 1.9). La usan /buscar, las rutas
amigables, la home y el sitemap.

BÚSQUEDA /buscar?rubro=&subcategoria=&provincia=&ciudad=&tipo=&q=&pagina=:
- Un perfil aparece si CUALQUIERA de sus 2 rubros coincide; los que lo
  tienen como principal van primero.
- Por ciudad: aparece si la ciudad es su base, la cubre explícitamente o
  si coversWholeProvince cubre esa provincia. Los de ciudad base igual a
  la buscada van primero.
- Filtros: rubro, subcategoría, provincia, ciudad, tipo (Personas /
  Empresas) y texto (búsqueda full-text de PostgreSQL en español o
  ILIKE con índice trigram sobre nombre y descripción).
- Orden: coincidencia de rubro principal, ciudad base, relevancia del
  texto, y luego BANDAS de corazones (0, 1-4, 5-19, 20+) para que un voto
  no decida la posición; dentro de cada banda, orden rotativo estable
  por día (hash de id + fecha) para dar visibilidad pareja.
- Paginación de 12 por página con botón "Ver más" (respuesta liviana).
- Estados vacíos amigables y skeleton loaders.
- Cada resultado usa <ProfessionalCard />.

HOME: hero con buscador (rubro + provincia), grilla de los 7 grupos que
despliegan sus rubros con íconos de lucide-react, contador de perfiles
publicados por rubro, sección "Profesionales destacados" (los más
recientes con suscripción vigente), bloque "¿Ofrecés un servicio?
Publicá tu perfil" y selector de provincia.

REGLA DE APERTURA POR RUBRO: un rubro se muestra "activo" a los clientes
solo si tiene al menos N perfiles publicados en esa provincia (N en
SiteSetting `minProfilesToOpenCategory`, valor inicial 5). Si no, se
muestra "Próximamente" y NO aparece una grilla vacía. (El formulario
"Avisame cuando haya" se agrega en el módulo 5.4; dejá el espacio.)

RUTAS AMIGABLES:
- /[provincia]/[rubro] (ej. /tucuman/plomeria) y
  /[provincia]/[ciudad]/[rubro].
- Validá el slug de provincia contra una lista fija y devolvé 404 si no
  existe, para no chocar con rutas como /p, /panel, /admin o /api.

CRITERIOS: la consulta usa los índices (mostrá el EXPLAIN esperado);
funciona rápido en celular; no muestra perfiles vencidos, sin WhatsApp
verificado, pendientes de aprobación ni suspendidos; un perfil de Yerba
Buena aparece al buscar en San Miguel de Tucumán si lo cubre, pero no en
Salta; buscar por rubro secundario devuelve al perfil.

SALIDA: páginas, componentes, función de consulta, migración de índices y
tests.
```

---

## Módulo 3.4 — Perfil público

**Depende de:** 3.2. **Entrega:** /p/[slug] con galería, contacto, corazón y datos estructurados.

```
TAREA: Creá /p/[slug] (perfil público).

CONTENIDO: galería con lightbox (hasta 10 imágenes visibles), nombre
(persona) o logo y nombre comercial (empresa) con tamaño del equipo,
ambos rubros, subcategorías, ciudad base y zonas de cobertura,
descripción, insignias ("WhatsApp verificado", "Empresa verificada",
"Matrícula informada" con su etiqueta), corazón con contador y misma
lógica de voto que la card, y botón fijo en celular "Contactar por
WhatsApp" que apunta a /api/contacto/[slug].

OTROS:
- Contador de visitas: viewsCount +1 y ProfileDailyStat, sin contar bots
  ni al propio dueño, sin guardar datos del visitante.
- Metadatos Open Graph y Twitter cards.
- JSON-LD LocalBusiness con areaServed (ciudades y provincias que
  cubre). NO incluir aggregateRating: los corazones son una señal de
  confianza y no una puntuación, y inventar una nota viola las pautas de
  datos estructurados de Google.
- 404 si el perfil no cumple publicProfileWhere (vencido, suspendido, sin
  WhatsApp verificado o pendiente de aprobación).
- Aviso discreto: "WhatsApp verificado significa que el profesional
  controla ese número. No implica verificación de identidad ni
  antecedentes."

CRITERIOS: un perfil vencido devuelve 404; el número nunca aparece en el
HTML; las visitas del dueño y de bots no suman; la página pasa
Lighthouse móvil > 90.

SALIDA: página, componentes, JSON-LD y tests.
```

---

## Módulo 3.5 — Invitación a valorar por email

**Depende de:** 2.7 y 3.1. **Entrega:** job que invita a votar sin spamear.

```
TAREA: Registrá en el cron (registro de jobs del módulo 2.7) el envío de
invitaciones a votar.

MODELO VoteInvite: clientId, profileId, sentAt. Clave única
(clientId, profileId). Campo User.voteInvitesOptOut (Boolean).

LÓGICA:
- Buscar ContactIntent con más de 48 h, sin voto del cliente a ese
  perfil, sin invitación previa, con perfil todavía publicado y con
  cliente que no se dio de baja.
- Enviar con Resend: "¿Contrataste a [Nombre]? Contanos cómo te fue" con
  botón "Sí, quiero dejar mi corazón" hacia /p/[slug] con el voto
  habilitado, y un enlace firmado de baja ("No recibir más
  invitaciones") que actualiza voteInvitesOptOut sin pedir login.
- Máximo 3 invitaciones por cliente por semana.

CRITERIOS: ejecutar el cron dos veces no manda correos duplicados; un
cliente dado de baja no recibe más invitaciones; el enlace de baja no
sirve con la firma alterada.

SALIDA: job, plantilla de email, ruta de baja y tests.
```

---

## Módulo 3.6 — Dashboard del profesional

**Depende de:** 3.1. **Entrega:** métricas en /panel sin exponer a los clientes.

```
TAREA: Actualizá /panel con un dashboard.

- Total de corazones, clics a WhatsApp de los últimos 30 días, visitas
  del perfil y evolución semanal (gráfico simple de barras), todo leído
  de ProfileDailyStat y del contador de corazones.
- El profesional NO ve quién votó ni quién contactó (privacidad del
  cliente): solo totales.
- Estado de publicación con el checklist del módulo 1.9, estado de la
  suscripción y próxima fecha de cobro.
- Estados de carga, vacío y error.

CRITERIOS: ninguna consulta ni respuesta de este panel contiene
identificadores de clientes; un profesional solo ve sus propias
métricas.

SALIDA: archivos modificados completos y tests de autorización.
```

---

## Módulo 3.7 — Reclamos y reportes

**Depende de:** 3.4. **Entrega:** canal privado de reclamos y reportes públicos de perfil, con política automática de suspensión.

```
TAREA: Implementá reportes de perfil y un canal de reclamos privado.

REPORTES (cualquier visitante, sin necesidad de login):
- Botón "Reportar perfil" en /p/[slug] con motivo (enum) y comentario
  opcional. Modelo Report: profileId, motivo, comentario, reporterHash
  (hash de IP con sal, no la IP), estado, createdAt. Rate limiting por IP
  y un reporte por visitante y perfil por día. Varios reportes distintos
  generan una RiskSignal.

RECLAMOS (clientes que contactaron):
MODELO Complaint: id, profileId, clientId, contactIntentId, motivo (enum:
NO_SE_PRESENTO, MALA_CALIDAD, COBRO_EXCESIVO, TRATO_INADECUADO, FRAUDE,
OTRO), descripción (máx. 1000), evidencias (hasta 3 imágenes subidas a
un recurso PRIVADO), estado (NUEVO | EN_REVISION | VALIDADO |
DESESTIMADO), resolución, timestamps.

REGLAS:
- Solo un cliente logueado con un ContactIntent hacia ese perfil puede
  reclamar (mismo criterio que el voto).
- Un reclamo por cliente y perfil cada 30 días.
- El profesional recibe aviso por email y puede responder UNA vez
  (descargo) dentro de 5 días hábiles; un job del cron cierra la ventana.
- El admin revisa y marca VALIDADO o DESESTIMADO, con motivo.
- Política automática y configurable:
  - 2 reclamos VALIDADOS en 90 días → advertencia por email.
  - 3 reclamos VALIDADOS en 90 días → suspensión (moderationStatus
    SUSPENDED, syncPublication) y revisión manual del admin.
  - Reclamo por FRAUDE → suspensión preventiva inmediata y propuesta al
    admin de agregar el número a la lista de bloqueo (decisión manual).
- El profesional no ve los datos personales del cliente.
- Los reclamos no son públicos.

UI: botón "Reportar un problema" en el perfil y en /mis-contactos del
cliente; la bandeja del admin se arma en el módulo 4.1 (dejá los
servicios listos).

CRITERIOS: sin contacto previo no se puede reclamar; las reglas de
suspensión se aplican solas y quedan en AuditLog; un reclamo no revela
la identidad del cliente al profesional.

SALIDA: modelos, acciones, UI cliente, emails, job y tests.
```
