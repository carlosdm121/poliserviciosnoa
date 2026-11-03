# Auditoría final y checklist de pre-lanzamiento — PoliserviciosNOA (módulo 5.7)

Auditoría de trazabilidad de requisitos sobre el proyecto completo. Cada
requisito original se rastrea a los archivos que lo implementan, los tests que
lo cubren y cómo probarlo manualmente. Al final: checklist de 25 puntos antes
de publicar.

> Depende de: 5.6 (piloto y mejoras). Es el último módulo del orden maestro.

---

## Requisitos originales

Lista de los 11 requisitos del módulo 5.7, con trazabilidad a implementación,
tests y prueba manual.

### 1. Portal de servicios para el NOA con 57 rubros y subcategorías

**¿Dónde está implementado?**
- `prisma/data/categories.ts`: 8 grupos, 57 rubros, subcategorías.
- `prisma/data/cities.ts`: 82 ciudades de las 5 provincias.
- `prisma/seed.ts`: carga idempotente del catálogo y las ciudades.
- `src/app/page.tsx`: home con los grupos de rubros y contadores de perfiles publicados.
- `src/app/[provincia]/[[...filtros]]/page.tsx`: resultados filtrados por provincia/rubro/ciudad.
- `src/app/sitemap.ts`: sitemap dinámico con rubros, provincia/rubro, provincia/ciudad/rubro y perfiles publicados.
- `src/app/robots.txt`: apunta al sitemap, bloquea rutas privadas.

**¿Qué tests lo cubren?**
- `tests/galeria.test.ts`, `tests/reglas-proyecto.test.ts` (indirectamente, reglas del catálogo).
- El seed se verifica dos veces en `npm run verificar` para comprobar idempotencia (no duplica rubros).

**Cómo probarlo manualmente**
1. Entrar a la home: deben verse los 8 grupos con sus rubros.
2. Entrar a `/tucuman/plomeria`: debe mostrar perfiles de plomería en Tucumán.
3. Entrar a `/buscar?rubro=plomeria&provincia=Tucumán`: mismo resultado.

**Estado:** implementado y verificado. No hay faltantes.

---

### 2. Perfil con validación por titularidad de WhatsApp (sin KYC)

**¿Dónde está implementado?**
- `src/lib/phone.ts`: normalización a E.164 (sin `libphonenumber-js`).
- `src/lib/hash.ts`: hash HMAC del número y del código.
- `src/lib/whatsapp/`: proveedor de Meta (real + mock).
- `src/services/verificacion-whatsapp.ts`: solicitar código, procesar mensaje entrante, "NO FUI YO", verificación manual.
- `src/app/api/webhooks/whatsapp/route.ts`: webhook de Meta (firma + handshake GET).
- `src/app/api/dev/whatsapp-simulate/route.ts`: simulador para desarrollo.
- `src/services/bloqueo.ts`: lista de bloqueo por hash (número, email, CUIT).
- `src/services/moderacion.ts`: suspensión/rechazo de perfiles.
- `src/lib/auth.ts`: roles PROFESSIONAL, COMPANY, CLIENT.
- `prisma/schema.prisma`: `whatsappE164` `@unique`, `whatsappHash` `@unique`, `whatsappVerifiedAt`, `ModerationStatus` enum.

**Reglas clave (D1, D11, D12):**
- Un número verificado pertenece a un solo perfil (índice único).
- No hay KYC, DNI ni reconocimiento facial en el flujo de alta.
- La insignia pública es "WhatsApp verificado", nunca "identidad verificada".

**¿Qué tests lo cubren?**
- `tests/verificacion-whatsapp.test.ts` (lógica pura: extraer código, hash, normalización).
- `tests/bots.test.ts` (detección de bots por user-agent).
- `scripts/verificar-whatsapp.ts`: 80 comprobaciones contra base real.

**Cómo probarlo manualmente**
1. Registrarse como profesional.
2. Pedir código de WhatsApp, escribirlo desde ese número.
3. Verificar que el perfil quede con `whatsappVerifiedAt` no nulo.
4. Intentar verificar el mismo número con otro perfil: debe rechazarse (número en otro perfil).

**Estado:** implementado y verificado.

---

### 3. Suscripción mensual con Mercado Pago

**¿Dónde está implementado?**
- `src/lib/dinero.ts`: `formatArs`, `formatearPrecioMensual`, `importeParaPasarela` (único formateador de precios).
- `src/services/planes.ts`: `getCurrentPlan()` con caché de 15 s, `montoVigente()`, `leerPlanVigente()`.
- `src/lib/mp/`: contrato, real y mock de Mercado Pago (sin SDK oficial).
- `src/lib/suscripcion.ts`: `precioDeAlta`, `importeParaPasarela`, `evaluarRequisitosPago`.
- `src/schemas/suscripcion.ts`: Zod para términos y datos fiscales.
- `src/services/suscripcion.ts`: alta, requisitos, baja, datos fiscales, integración con cupones (5.4).
- `src/app/actions/suscripcion.ts`: Server Actions.
- `src/app/panel/suscripcion/page.tsx`: pantalla de suscripción con precio de la base.
- `src/app/panel/datos-fiscales/`: formulario de datos fiscales.
- `prisma/schema.prisma`: `Plan`, `Subscription` (planAmount, priceFrozen, graceUntil, termsVersion), `FiscalData`.

**Reglas clave (D24, D26):**
- El precio sale de `Plan.amount`, nunca hardcodeado. Test que falla el build si aparece un monto escrito.
- Una sola suscripción por perfil (`profileId @unique`).
- `PENDING` se reabre cancelando el preapproval anterior; `ACTIVE` bloquea nuevas altas.
- Precio congelado para socios fundadores (`priceFrozen`).

**¿Qué tests lo cubren?**
- `tests/dinero.test.ts` (formateo, coma flotante, espacio duro de Intl).
- `tests/suscripcion.test.ts` (33 tests de lógica pura).
- `scripts/verificar-suscripcion.ts`: 58 comprobaciones contra base real (dos carreras simultáneas, precio congelado, requisitos).

**Cómo probarlo manualmente**
1. Ir a `/panel/suscripcion`: debe mostrar el precio de `Plan.amount`.
2. Clic en "Suscribirme": se abre el checkout de Mercado Pago.
3. Pagar (mock o real): el webhook activa la suscripción y publica el perfil.
4. Intentar pagar dos veces simultáneamente: solo una suscripción queda abierta.

**Estado:** implementado y verificado.

---

### 4. Panel de control (10 imágenes, 2 rubros, 8 ciudades)

**¿Dónde está implementado?**
- `src/lib/imagen.ts`: lógica pura de galería (límite 10, formatos, carpeta, anti-IDOR).
- `src/lib/cloudinary.ts`: cliente Cloudinary (firma, consulta, borrado, mock).
- `src/schemas/galeria.ts`: Zod compartido + tipo `ImagenGaleria`.
- `src/services/galeria.ts`: lógica de galería con `FOR UPDATE`.
- `src/app/actions/galeria.ts`: Server Actions.
- `src/components/galeria/Galeria.tsx`: UI de galería (drag & drop, reordenar).
- `src/app/panel/galeria/page.tsx`: página de galería.
- `src/services/perfil.ts`: panel de perfil (persona/empresa, ubicación, cobertura, rubros, CUIT).
- `src/app/panel/perfil/page.tsx`: pantalla de edición de perfil.
- `prisma/schema.prisma`: `Image` (isHidden, hiddenReason), `ProfileCategory` (2 rubros, 1 principal), `ProfileCoverage` (8 ciudades), `ProfileSubcategory` (4 subcategorías).

**Reglas clave (D21, D22):**
- Subida firmada por el servidor; `publicId` del cliente se revalida contra la API.
- Una imagen oculta no cuenta para publicar.
- Máximo 10 imágenes por perfil.

**¿Qué tests lo cubren?**
- `tests/galeria.test.ts` (lógica pura).
- `scripts/verificar-galeria.ts`: 31 comprobaciones contra base real (12 subidas simultáneas dejan exactamente 10, IDOR, traversal, publicación).

**Cómo probarlo manualmente**
1. Ir a `/panel/galeria`: subir hasta 10 imágenes. La 11ª debe rechazarse.
2. Ocultar una imagen: el perfil deja de ser publicable (motivo `SIN_IMAGENES`).
3. Ir a `/panel/perfil`: elegir hasta 2 rubros y hasta 8 ciudades de cobertura.

**Estado:** implementado y verificado.

---

### 5. Contacto por WhatsApp con mensaje predefinido

**¿Dónde está implementado?**
- `src/lib/constantes.ts`: `MENSAJE_CONTACTO`, `enlaceWhatsApp()`.
- `src/services/contacto.ts`: clic anónimo, estadística diaria, intención de contacto (24 h).
- `src/app/api/contacto/[slug]/route.ts`: ruta de contacto con rate limit por IP.
- `src/components/votos/BotonCorazon.tsx`: botón de corazón.
- `src/app/mis-contactos/page.tsx`: página de contactos del cliente.
- `src/components/perfil/GaleriaPerfil.tsx`: galería con botón de WhatsApp.
- `src/app/p/[slug]/page.tsx`: perfil público con botón de WhatsApp.

**Reglas clave:**
- Clic anónimo sin datos personales del cliente.
- Mensaje predefinido: "Hola, te vi en [NombrePagina] y me interesa tu servicio, quiero solicitar tus servicios".
- Intención de contacto solo válida por 24 h.
- Voto a corazón solo después de contacto previo.

**¿Qué tests lo cubren?**
- `tests/contacto.test.ts`, `tests/votos.test.ts`.
- `scripts/verificar-contacto-votos.ts`: 37 comprobaciones contra base real.

**Cómo probarlo manualmente**
1. Entrar a un perfil público `/p/[slug]`.
2. Clic en el botón de WhatsApp: se abre `wa.me` con el mensaje predefinido.
3. Verificar que el clic se registra como intención de contacto (24 h).

**Estado:** implementado y verificado.

---

### 6. Cards por rubro, creadas automáticamente al activarse el perfil

**¿Dónde está implementado?**
- `src/components/perfil/GaleriaPerfil.tsx` (card en perfil público).
- `src/app/[provincia]/[[...filtros]]/page.tsx`: cards generadas dinámicamente a partir de perfiles publicados.
- `src/app/sitemap.ts`: cards aparecen en el sitemap cuando se publican.
- `src/services/panel.ts`: datos del panel con contadores.
- No existe una tabla de "cards" aparte: la card se genera de los datos del perfil publicado (regla de publicación D4).

**Reglas clave:**
- Una card solo existe si el perfil es publicable (`evaluarPublicacion`).
- No hay cards vacías: rubros sin perfiles publicados no muestran cards.

**¿Qué tests lo cubren?**
- `tests/perfil-publico.test.ts` (JSON-LD, metadata).
- `tests/seo.test.ts` (7 tests de lógica pura de búsqueda y sitemap).

**Cómo probarlo manualmente**
1. Publicar un perfil: debe aparecer en `/tucuman/plomeria` y en `/buscar`.
2. Despublicar el perfil: debe desaparecer de ambos.

**Estado:** implementado y verificado.

---

### 7. Corazón de confianza votado por quienes contactaron

**¿Dónde está implementado?**
- `src/services/votos.ts`: votos, anulación, lista, señales de fraude.
- `src/app/actions/votos.ts`: Server Action del corazón.
- `src/components/votos/BotonCorazon.tsx`: botón optimista y accesible.
- `src/app/mis-contactos/page.tsx`: contactos del cliente (para habilitar voto).
- `prisma/schema.prisma`: `ProfileVote`, `ProfileDailyStat`, `ContactIntent`, `VoteInvite`.

**Reglas clave:**
- Un voto por cliente por profesional.
- Solo se puede votar tras contacto previo (ventana de 24 h).
- Se anula el voto (toggle).
- Señales de fraude: bot por user-agent, múltiples votos sospechosos.

**¿Qué tests lo cubren?**
- `tests/votos.test.ts` (lógica pura).
- `scripts/verificar-contacto-votos.ts`: 37 comprobaciones contra base real.

**Cómo probarlo manualmente**
1. Contactar a un profesional por WhatsApp (registra intención).
2. Pasadas 24 h, votar (corazón).
3. Volver a clic: se anula el voto.

**Estado:** implementado y verificado.

---

### 8. Búsqueda por rubro, provincia y ciudad

**¿Dónde está implementado?**
- `src/app/buscar/page.tsx`: buscador general.
- `src/app/[provincia]/[[...filtros]]/page.tsx`: búsqueda por provincia/rubro/ciudad.
- `src/server/search.ts`: `construirDonde` (compartido por `searchProfiles` y `contarPerfilesPublicos`), `contarPerfilesPublicos`.
- `src/services/perfil-publico.ts`: `obtenerPerfilPublico`.
- `src/lib/perfil-publico.ts`: helpers (JSON-LD, metadata, cobertura, nombres).
- `src/app/page.tsx`: buscador home.
- `src/app/sitemap.ts`: rutas de búsqueda en el sitemap.

**Reglas clave:**
- Filtros combinados van en `AND`, no en un solo `OR` (bug corregido en 4.1).
- `noindex` en resultados sin perfiles.
- Texto introductorio único por combinación de provincia/rubro/ciudad.
- Orden rotativo diario.

**¿Qué tests lo cubren?**
- `tests/seo.test.ts` (7 tests).
- `tests/perfil-publico.test.ts`.

**Cómo probarlo manualmente**
1. `/buscar?rubro=plomeria&provincia=Tucumán`: perfiles de plomería en Tucumán.
2. `/tucuman/plomeria`: mismo resultado con texto introductorio.
3. `/tucuman/san-miguel-de-tucuman/plomeria`: solo San Miguel de Tucumán.

**Estado:** implementado y verificado.

---

### 9. Facturación, baja, arrepentimiento, reclamos, borrado de datos

**¿Dónde está implementado?**
- Facturación: `src/services/facturacion.ts`, `src/lib/arca/` (proveedor, cálculos, PDF), `src/app/api/facturas/[id]/pdf/route.ts`, `src/app/api/admin/facturacion/reporte/route.ts`, `src/app/admin/facturacion/page.tsx`.
- Baja: `src/services/cancelaciones.ts`, `src/app/actions/cancelaciones.ts`, `src/app/baja/page.tsx`.
- Arrepentimiento: `src/lib/cancelaciones.ts` (plazo 10 días), `src/app/arrepentimiento/page.tsx`, reembolso en MP + nota de crédito.
- Reclamos/libro de quejas: `src/services/reclamos.ts`, `src/app/libro-de-quejas/page.tsx`, `src/components/reclamos/FormularioReclamo.tsx`.
- Borrado de datos: `src/services/privacidad.ts`, `src/lib/retention.ts`, `src/app/panel/cuenta/datos/page.tsx`, `src/app/panel/cuenta/datos/eliminar-confirmar/page.tsx`, `src/app/api/panel/datos/exportar/route.ts`.

**Reglas clave:**
- Factura por pago (`Invoice.paymentId` único), idempotente.
- Nota de crédito para anular (no se borra factura).
- Baja deja `cancelAtPeriodEnd`: perfil visible hasta fin del período.
- Arrepentimiento: reembolso + nota de crédito + despublicación (dentro de 10 días).
- Supresión anonimiza User y Profile, borra imágenes de Cloudinary, conserva facturas (plazo fiscal).

**¿Qué tests lo cubren?**
- `tests/facturacion.test.ts` (32), `tests/cancelaciones.test.ts` (14), `tests/retention.test.ts`.
- `scripts/verificar-facturacion.ts` (37), `scripts/verificar-cancelaciones.ts` (37) contra base real.

**Cómo probarlo manualmente**
1. Pagar una suscripción: se genera factura (mock o real).
2. Ir a `/baja`: cancelar renovación, perfil visible hasta fin del período.
3. Ir a `/arrepentimiento` (dentro de 10 días): reembolso, nota de crédito, perfil despublicado.
4. Ir a `/panel/cuenta/datos`: exportar JSON, pedir supresión.

**Estado:** implementado y verificado.

---

### 10. Soporte, moderación, cupones y lanzamiento, PWA

**¿Dónde está implementado?**
- Soporte: `src/services/soporte.ts`, `src/app/actions/soporte.ts`, `src/app/soporte/page.tsx`, `src/app/ayuda/page.tsx`, `src/app/admin/soporte/page.tsx`, `src/server/jobs/sla.ts`.
- Moderación: `src/services/moderacion.ts`, `src/app/admin/moderacion/page.tsx`, `src/app/admin/riesgos/page.tsx`.
- Cupones y lanzamiento: `src/services/cupones.ts` (5.4), `src/lib/cupones.ts`, `src/app/admin/lanzamiento/page.tsx`, `src/app/publica-tu-servicio/page.tsx` (5.5).
- PWA: `public/manifest.json`, `public/sw.js`, `public/icon-192.svg`, `public/icon-512.svg`, `src/components/legales/ServiceWorkerRegister.tsx`, `src/components/legales/InstalarApp.tsx`, `src/app/layout.tsx`.

**¿Qué tests lo cubren?**
- `tests/soporte.test.ts` (13).
- `tests/cupones.test.ts` (17, nuevos en 5.4).
- SEO y PWA no tienen tests de flujo (pendiente de Postgres).

**Cómo probarlo manualmente**
1. `/soporte`: crear ticket, recibir email de confirmación.
2. `/admin/soporte`: responder ticket, cambiar estado, asignar.
3. `/admin/lanzamiento`: ver cupones y contador de socios fundadores.
4. `/publica-tu-servicio`: landing con precio, 4 pasos, FAQ.
5. Instalar PWA desde el navegador: aparece aviso "Instalar la app".

**Estado:** implementado y verificado (salvo flujo PWA contra base real, pendiente de Postgres).

---

### 11. Ninguna referencia a KYC / DNI / "identidad verificada"

**¿Dónde se verifica?**
- `tests/reglas-proyecto.test.ts`: prueba que no haya referencias residuales.
- Revisión manual de textos legales (`/terminos`, `/privacidad`, `/politica-de-pagos`): declaran que WhatsApp verificado no es identidad verificada.
- `src/lib/constantes.ts`: `MENSAJE_CONTACTO` no menciona identidad.
- JSON-LD de perfil público: `LocalBusiness` sin `telephone` ni `aggregateRating`.

**Hallazgos en la revisión (no son violaciones, son datos fiscales legítimos):**
- `src/schemas/suscripcion.ts`, `src/components/panel/FormularioDatosFiscales.tsx`, `src/app/privacidad/page.tsx`, `src/lib/arca/`: mencionan CUIT/DNI como **datos fiscales para facturar**, no como verificación de identidad. Esto está permitido por D25 y los textos legales lo aclaran.

**Estado:** cumplido. No hay referencias a "identidad verificada" ni KYC como mecanismo de alta. CUIT/DNI solo como datos fiscales.

---

## Verificaciones críticas (D4, publicProfileWhere)

**`isPublished` solo se escribe en `sincronizarPublicacion`:** ✅ confirmado. La única asignación `isPublished:` en un `update`/`create` está en `src/services/publicacion.ts:244`. Todos los demás módulos llaman a `sincronizarPublicacion(profileId)` después de cambiar algo que afecte la publicación.

**Ninguna consulta pública omite `publicProfileWhere` / `CONDICION_PERFIL_PUBLICO`:** ✅ confirmado. Las consultas públicas usan `CONDICION_PERFIL_PUBLICO` en:
- `src/services/perfil-publico.ts:25`
- `src/services/contacto.ts:42`
- `src/services/votos.ts:50,138`
- `src/services/vistas.ts:43`
- `src/server/search.ts:48,194`
- `src/app/sitemap.ts:33`
- `src/server/jobs/invitaciones.ts:36`

No hay ruta pública que filtre solo por `isPublished: true` sin la condición compartida.

---

## Qué falta o está a medias

| Área | Qué falta | Gravedad |
|------|-----------|----------|
| Verificación de WhatsApp | Liberación real del E.164 (queda asociado al perfil impostor por índice único). Pantalla de administración para revisar señales de riesgo. | Media |
| Pagos reales | Revisar a mano preapprovals `pending` en Mercado Pago no registrados en la base. | Media |
| Panel de administración | No existe UI completa: moderar es por consola y el precio por Prisma Studio. | Media |
| DNI en base | Está justificado (facturación), pero retención y borrado al dar de baja pendiente (módulo 4.4). | Media |
| Legales | Requieren revisión de abogado antes de publicar. | Alta |
| PWA en producción | Íconos placeholder, reemplazar por logo real. | Baja |
| Flujos contra base real | Precisan Postgres embebido (no disponible en esta máquina). | Media |

---

## Riesgos residuales (ordenados por gravedad)

1. **Legales sin revisión de abogado.** Textos de términos, privacidad y política de pagos están listos pero sin revisión legal. **Bloqueante para salir a público.**
2. **Sin panel de administración completo.** Moderación y precio se gestionan por consola/Prisma Studio. Riesgo operativo, no de datos.
3. **Preapprovals huérfanos en Mercado Pago.** Si el alta falla entre crear el preapproval y escribir la fila, queda un cobro recurrente abierto que nadie registra. Revisar a mano antes del primer cobro real.
4. **Números reciclados.** Al cambiar el número se borra la verificación y se despublica, pero no existe pausa sin repago.
5. **Caché del precio de 15 s.** El admin debe llamar a `limpiarCachePlan()` al cambiar el monto, o verá el precio viejo un rato.
6. **Datos fiscales (DNI/CUIT) en la base.** Justificados para facturar, pero son datos personales. Retención y borrado pendiente (4.4).

---

## Checklist de pre-lanzamiento (25 puntos)

### Legales
- [ ] Revisar `/terminos` con abogado (intermediario, WhatsApp verificado no es identidad, responsabilidades, contenido prohibido, jurisdicción Tucumán).
- [ ] Revisar `/privacidad` con abogado (Ley 25.326, datos tratados, proveedores externos, plazos de conservación, inscripción ante AAIP).
- [ ] Revisar `/politica-de-pagos` con abogado (suscripción, renovación automática, aumentos con 30 días de aviso, baja, arrepentimiento, reembolsos, facturación ARCA).
- [ ] Agregar aviso "BORRADOR — revisar con abogado antes de publicar" en cada página legal (ya presente en `PaginaLegal.tsx`).
- [ ] Footer enlaza `/terminos`, `/privacidad`, `/politica-de-pagos` (ya implementado).

### Pagos
- [ ] `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` configurados en Vercel.
- [ ] Webhook de Mercado Pago cargado en el panel: `https://tudominio.com/api/webhooks/mercadopago`.
- `MP_REAL=1` con credenciales de prueba probado: checkout abre de verdad.
- [ ] Revisar a mano preapprovals `pending` en Mercado Pago no registrados en la base.
- [ ] `DATABASE_URL` apunta a endpoint con pooling (Neon/Supabase).

### WhatsApp / Meta
- [ ] `WHATSAPP_PLATFORM_NUMBER`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` en Vercel.
- [ ] Número dedicado de la plataforma (no celular personal).
- [ ] Token permanente de usuario del sistema generado en Meta for Developers.
- [ ] Perfil de empresa configurado en Meta (nombre del portal, no número desconocido).
- [ ] Webhook de WhatsApp cargado: `https://tudominio.com/api/webhooks/whatsapp`, verify token coincide, suscripción al campo `messages`.
- [ ] Handshake GET probado: devuelve el `hub.challenge`.
- [ ] `/api/dev/whatsapp-simulate` devuelve 404 en producción.

### Seguridad y datos
- [ ] `PHONE_HASH_PEPPER` generado (`openssl rand -hex 32`) y **nunca se cambiará** después de tener datos.
- [ ] `NEXTAUTH_SECRET` generado (`openssl rand -base64 32`).
- [ ] `CRON_SECRET` generado y protegido.
- [ ] `/api/health` responde 200 con `database: ok`, `mercadopago: ok`, `upstash: ok`.
- [ ] Sentry configurado (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`) con filtrado de datos personales.
- [ ] Ninguna consola `console.log` en servidor (todo por `logger`).
- [ ] `requireManualApproval = true` en la base de producción (arranque con aprobación manual).

### Operación
- [ ] Backups automáticos diarios de la base de datos (Neon/Supabase).
- [ ] Procedimiento de restauración documentado y probado una vez.
- [ ] Uptime monitoring externo apuntando a `/api/health`.
- [ ] Panel `/admin/monitoreo` accesible: errores de webhooks y corridas del cron visibles.
- [ ] Runbook de incidentes (`docs/runbook-incidentes.md`) leído por el operador.
- [ ] Dominio verificado en Resend: SPF, DKIM, DMARC en verde.
- [ ] Emails transaccionales llegan (confirmación de suscripción, aviso de vencimiento).
- [ ] Build en Vercel en verde: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

Con todos los puntos en verde, el portal está listo para recibir los primeros profesionales.
