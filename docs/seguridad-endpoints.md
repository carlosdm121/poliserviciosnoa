# Tabla de endpoints y control de acceso

Registro de cada ruta API y Server Action del proyecto, quién puede llamarla y
cómo se verifica. Se genera a partir del código; si cambia un endpoint, se
actualiza acá.

## Convenciones

- **Rol en token**: el rol viaja en el JWT de sesión (NextAuth v4, 30 días).
- **Re-verificación**: cada Server Action sensible vuelve a leer el rol de la
  base con `exigirAdmin()` / `exigirSuperAdmin()` en vez de confiar en el token.
- **Rate limit**: `rateLimit(clave, limite, ventana)` de `src/lib/ratelimit.ts`,
  con Redis y fallback en memoria.
- **IDOR**: ninguna consulta filtra solo por un id pasado del cliente; siempre
  se revalida la propiedad contra la sesión.

---

## Rutas públicas (sin sesión)

| Ruta | Método | Qué hace | Control de acceso | Rate limit |
|------|--------|----------|-------------------|------------|
| `/` | GET | Home pública | Ninguna (pública) | No |
| `/buscar` | GET | Búsqueda de perfiles públicos | Ninguna (pública) | No |
| `/[provincia]` / `[[...filtros]]` | GET | Listado provincia + rubro | Ninguna (pública) | No |
| `/p/[slug]` | GET | Perfil público | Ninguna (pública) | No |
| `/api/contacto/[slug]` | GET | Redirige a WhatsApp + registra contacto | Público; bot solo no suma | 30/IP/60s |
| `/api/vistas/[slug]` | POST | Registra visita al perfil | Público; bot no cuenta | 1/IP/slug/1800s |
| `/api/reportes/[slug]` | POST | Reporte anónimo de perfil | Público; dedupe por IP+perfil/día | En servicio |
| `/api/invitacion/dar-de-baja` | GET | Baja de invitaciones por enlace firmado | Firma HMAC con `CRON_SECRET` | No |
| `/api/webhooks/mercadopago` | POST | Webhook de pagos | Firma `x-signature` (HMAC) | No |
| `/api/webhooks/whatsapp` | GET/POST | Webhook de Meta WhatsApp | Firma `x-hub-signature-256` + verify token | No |
| `/api/dev/whatsapp-simulate` | POST | Simulador de mensajes (solo dev) | 404 si `NODE_ENV=production` | No |

---

## Rutas autenticadas (requieren sesión)

| Ruta | Método | Qué hace | Quién puede | Control de acceso | Rate limit |
|------|--------|----------|-------------|-------------------|------------|
| `/api/auth/[...nextauth]` | GET/POST | Login, registro, verify email | Cualquier visitante | Mismo mensaje para email/no-existe y contraseña errónea (anti-enumeración) | No |
| `/api/contacto/[slug]` | GET | Contacto por WhatsApp | Autenticado o anónimo | `getServerSession` opcional; `clientId` solo si rol CLIENT | 30/IP/60s |
| `/api/vistas/[slug]` | POST | Visita | Autenticado o anónimo | `getServerSession` opcional | 1/IP/slug/1800s |
| `/api/panel/datos/exportar` | GET | Exportar mis datos (Ley 25.326) | Dueño del perfil | `getServerSession` + `profile.userId === session.user.id` | No |
| `/api/panel/whatsapp/estado` | GET | Estado de verificación | Dueño del perfil | `getServerSession` + `profile.userId === session.user.id` | No |
| `/api/facturas/[id]/pdf` | GET | Descargar comprobante | Dueño o ADMIN | Sesión + `perfilDeFactura` + rol ADMIN o `profile.id === duenio` | No |
| `/api/evidencias/[id]` | GET | Ver evidencia privada de reclamo | Admin, dueño del reclamo o dueño del perfil | Sesión + `puedeVerEvidencias(reclamoId, userId, role)` | No |
| `/api/admin/facturacion/reporte` | GET | CSV mensual para contador | Solo ADMIN | Sesión + `role === ADMIN` | No |

---

## Server Actions (requieren sesión, `"use server"`)

| Action | Archivo | Qué hace | Quién puede | Control de acceso | Rate limit |
|--------|---------|----------|-------------|-------------------|------------|
| `registrarProfesional` | `actions/registro.ts` | Alta de profesional | Visitante | Zod + bloqueo de identificadores + lista de bloqueo | 5/IP/3600s |
| `reenviarVerificacion` | `actions/verificacion-email.ts` | Reenviar email de verificación | Visitante | Mismo mensaje si el email no existe | 3/IP/3600s y 3/email/3600s |
| `pedirCodigoWhatsApp` | `actions/whatsapp.ts` | Pedir código de verificación | Dueño del perfil | Sesión + perfil de la sesión | En servicio (5/hora, 20/día por IP) |
| `verificarWhatsAppComoAdmin` | `actions/whatsapp.ts` | Verificar número a mano | Solo ADMIN | Sesión + `role === ADMIN` | No |
| `votar` | `actions/votos.ts` | Alternar corazón | CLIENT con contacto previo | Sesión + `role === CLIENT` + contacto 24h antes | 20/cliente/3600s |
| `crearReclamoAction` | `actions/reclamo.ts` | Crear reclamo contra profesional | CLIENT con contacto previo | Sesión + `role === CLIENT` + ContactIntent + 30 días | 5/cliente/3600s |
| `soporteCrearTicket` | `actions/soporte.ts` | Abrir ticket de soporte | Visitante (sesión opcional) | Zod + categoría válida + nombre/email si no hay sesión | 10/IP/3600s |
| `soporte{Responder,Cerrar,Asignar,CambiarEstado}Ticket` | `actions/soporte.ts` | Gestionar ticket | ADMIN o MODERADOR | `exigirAdmin()` | No |
| `pedirFirmaSubida` | `actions/galeria.ts` | Firma para subir imagen | Dueño del perfil | Sesión + perfil de la sesión | 30/perfil/3600s |
| `confirmarImagen` | `actions/galeria.ts` | Registrar imagen subida | Dueño del perfil | Sesión + perfil de la sesión + verificación contra Cloudinary API | No |
| `borrarImagen` | `actions/galeria.ts` | Borrar imagen | Dueño del perfil | Sesión + perfil de la sesión | No |
| `guardarOrden` | `actions/galeria.ts` | Reordenar galería | Dueño del perfil | Sesión + perfil de la sesión | No |
| `suscribirme` | `actions/suscripcion.ts` | Abrir checkout Mercado Pago | Dueño del perfil | Sesión + perfil de la sesión | No |
| `cancelarLaRenovacion` | `actions/suscripcion.ts` | Cancelar renovación | Dueño del perfil | Sesión + perfil de la sesión | No |
| `guardarDatosFiscales` | `actions/suscripcion.ts` | Guardar datos fiscales | Dueño del perfil | Sesión + perfil de la sesión | No |
| `adminAprobarPerfil` | `actions/admin.ts` | Aprobar perfil | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminRechazarPerfil` | `actions/admin.ts` | Rechazar perfil | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminSuspenderPerfil` | `actions/admin.ts` | Suspender perfil | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminAccionPerfil` | `actions/admin.ts` | Acción de formulario (aprobar/rechazar/suspender/reactivar) | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminVerificarWhatsapp` | `actions/admin.ts` | Verificar WhatsApp a mano | ADMIN | `exigirAdmin()` | No |
| `adminResolverEmpresa` | `actions/admin.ts` | Aprobar/rechazar constancia | ADMIN | `exigirAdmin()` | No |
| `adminRevisarMatricula` | `actions/admin.ts` | Revisar matrícula | ADMIN | `exigirAdmin()` | No |
| `adminResolverReporte` | `actions/admin.ts` | Resolver reporte | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminResolverQueja` | `actions/admin.ts` | Resolver queja | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminOcultarImagen` | `actions/admin.ts` | Ocultar/mostrar imagen | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminAnularVoto` | `actions/admin.ts` | Anular voto | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminResolverRiesgo` | `actions/admin.ts` | Resolver señal de riesgo | ADMIN/MODERADOR | `exigirAdmin()` | No |
| `adminBloquear` / `adminDesbloquear` | `actions/admin.ts` | Bloquear/desbloquear identificador | ADMIN | `exigirAdmin()` | No |
| `adminBloquearForm` / `adminDesbloquearForm` | `actions/admin.ts` | Bloqueo desde formulario | ADMIN | `exigirAdmin()` | No |
| `adminSuspenderYBloquear` | `actions/admin.ts` | Suspender + bloquear | ADMIN | `exigirAdmin()` | No |
| `adminSetExigeAprobacion` | `actions/admin.ts` | Cambiar bandera de aprobación manual | Solo ADMIN | `exigirSuperAdmin()` | No |
| `adminGuardarConfiguracion` | `actions/admin.ts` | Guardar configuración del sitio | Solo ADMIN | `exigirSuperAdmin()` | No |
| `adminCrearRubro` / `adminEditarRubro` | `actions/admin.ts` | Gestionar rubros | Solo ADMIN | `exigirSuperAdmin()` | No |
| `adminCrearCiudad` / `adminEditarCiudad` | `actions/admin.ts` | Gestionar ciudades | Solo ADMIN | `exigirSuperAdmin()` | No |
| `adminReasignarLocalidad` | `actions/admin.ts` | Reasignar localidad | Solo ADMIN | `exigirSuperAdmin()` | No |
| `adminReintentarFactura` | `actions/admin.ts` | Reintentar factura FAILED | Solo ADMIN | `exigirSuperAdmin()` | No |

---

## Cron (rutas protegidas por `CRON_SECRET`)

| Ruta | Método | Qué hace | Control de acceso |
|------|--------|----------|-------------------|
| `/api/cron/daily` | GET | Jobs diarios (avisos, vencimientos, limpieza) | `Authorization: Bearer ${CRON_SECRET}` con `timingSafeEqual` |
| `/api/cron/facturacion` | GET | Procesar facturas pendientes | `Authorization: Bearer ${CRON_SECRET}` con `timingSafeEqual` |

---

## Middleware de rutas (`src/middleware.ts`)

| Prefijo | Roles permitidos | Notas |
|---------|------------------|-------|
| `/panel` | PROFESSIONAL | Barrera rápida; cada action re-verifica rol en base |
| `/admin` | ADMIN, MODERADOR | Idem |
| `/mis-contactos` | CLIENT | Idem |

El middleware usa el token de sesión (Edge Runtime, sin consulta a base). No es
la autorización final: cada escritura sensible re-valida el rol contra Prisma.

---

## Headers de seguridad (`next.config.mjs`)

| Header | Valor |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'`; styles `'self' 'unsafe-inline'`; scripts `'self' 'unsafe-eval' 'unsafe-inline' https://sdk.mercadopago.com`; img `'self' data: blob: https://res.cloudinary.com`; font `'self' data:`; connect `'self' https://api.mercadopago.com https://api.resend.com`; frame `'self' https://sdk.mercadopago.com` |

---

## Riesgos residuales

1. **Rate limit en memoria en desarrollo:** si Redis no responde, el contador cae
   a memoria por instancia. En Vercel cada request es una instancia distinta, así
   que el límite es más permissivo en ese escenario. Aceptado: mejor un límite
   blando que bloquear la publicación por un fallo de Redis.

2. **Evidencias por URL directa:** la ruta `/api/evidencias/[id]` redirige a la
   URL de Cloudinary. Una vez en Cloudinary, el acceso depende de que la URL no
   se filtre. Los IDs son cuids (no enumerables) y la ruta verifica sesión y rol
   antes de redirigir.

3. **Cookies de sesión:** NextAuth v4 usa cookies `httpOnly` y `secure` en
   producción (inferido de `NEXTAUTH_URL` HTTPS). El token dura 30 días.

4. **Rate limit por IP detrás de proxies:** la IP se lee de `x-forwarded-for`;
   detrás de varios proxies puede no ser la IP real del usuario final. Aceptado
   para rate limiting: solo se necesita estabilidad por conexión, no identidad.
