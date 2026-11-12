# Ajustes al flujo de publicación

Fecha: 2026-11-12
Estado: aprobado

## Objetivo

Alinear el producto con el modelo mental del dueño del sitio antes de la prueba
de punta a punta del alta autoservicio:

1. El link público del profesional no lleva `/p/`.
2. La home muestra a los mejor valorados.
3. El mail de pago acreditado incluye el link público.
4. El marco de `/panel` y `/admin` usa los colores de la página pública.

## 1. URL pública sin `/p/`

### Problema

`src/app/[provincia]/[[...filtros]]/page.tsx` ya ocupa el primer segmento de la
URL. No se puede crear un `src/app/[slug]/page.tsx` paralelo: Next.js rechaza
dos segmentos dinámicos distintos en el mismo nivel.

### Solución

Reescritura interna en `src/middleware.ts`: `/<slug>` se sirve con
`/p/<slug>`, sin cambiar la barra de direcciones.

Se reescribe solo si el segmento tiene la forma que produce `generarSlugPerfil`:
nombre slugificado + `-` + 4 caracteres al azar. Ninguna ruta fija de la app
(`/buscar`, `/login`, `/panel`, …) ni ninguna provincia (`/tucuman`, …) termina
así, de modo que no hace falta mantener una lista de rutas reservadas.

La regla vive en `src/lib/slug-perfil.ts`, sin imports, porque el middleware
corre en el runtime edge y no puede arrastrar `@prisma/client`.

### Compatibilidad

- `/p/<slug>` sigue funcionando: nadie que ya compartió un link queda roto.
- El canónico, el sitemap y el JSON-LD apuntan a la forma corta.
- Sin cambios de esquema ni de datos.

### Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/slug-perfil.ts` | nuevo: patrón del slug |
| `src/middleware.ts` | reescritura |
| `src/lib/perfil-publico.ts` | `urlPerfil`, canónico, Open Graph |
| `src/components/profesionales/ProfessionalCard.tsx` | link de la card |
| `src/lib/email.ts` | link del mail de corazón |
| `src/app/sitemap.ts` | URL del sitemap |
| `src/app/p/[slug]/page.tsx` | JSON-LD |
| `src/app/admin/espacios/page.tsx` | link del admin |
| `src/components/admin/FormularioCrearEspacio.tsx` | link del mensaje de alta |
| `src/app/actions/personalizacion.ts` | `revalidatePath` (hoy usa el id, no el slug) |

## 2. Home: mejor valorados

Sección entre los rubros y los accesos por provincia.

- Hasta 6 tarjetas, reutilizando `ProfessionalCard` y `searchProfiles({})`, que
  ya ordena por `heartsCount` descendente.
- **Si ningún perfil tiene corazones, la sección no se renderiza.** Un ranking
  en cero es peor que no tener ranking.

## 3. Mail de pago con link

`enviarEmailPagoAprobado` recibe `urlEspacio` y agrega el link público antes del
botón al panel. El webhook de MercadoPago ya lee el perfil para el email: suma
`slug` al `select`.

Fuera de alcance: la acreditación manual del admin no manda email hoy y sigue
igual.

## 4. Marco visual de los paneles

El sitio público usa barra blanca, azul `noa-blue` y borde negro de 3 px. El
panel de admin usa una barra negra que compite con la cabecera pública, que se
renderiza igual porque `app/layout.tsx` envuelve todo.

- `src/app/admin/layout.tsx`: barra blanca, acento azul, navegación con sección
  activa en azul.
- `src/components/admin/AdminNav.tsx`: nuevo, cliente, solo para marcar la
  sección activa con `usePathname`.
- `src/components/panel/PanelNavbar.tsx`: activo en azul en vez de negro.

Sin rediseño pantalla por pantalla. Los bordes negros de las páginas se
conservan: son el mismo lenguaje que el resto del sitio.

## Fuera de alcance

- Aprobación manual del alta (la bandera sigue apagada).
- Rediseño de cada pantalla del panel.
- Cambios en la base de datos.

## Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- Actualizar las cuatro aserciones de test que esperan `/p/`.
- Test nuevo: el patrón acepta un slug de `generarSlugPerfil` y rechaza rutas
  fijas y provincias.
