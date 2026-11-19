# Diseño: registro con elección de rubros (multi-profesión)

**Fecha:** 2026-11-19
**Estado:** borrador para revisión de usuario
**Sub-proyecto:** 2 — registro de profesional permite elegir rubros en el alta

## Objetivo

El alta de profesional (`/registro`) pida los rubros del profesional en el mismo formulario, con la misma lógica que el perfil:

- al menos **1 rubro**, máximo **2**;
- el **primario es obligatorio** y el **secundario opcional**;
- el secundario no puede repetir el primario;
- el Server Action `registrarProfesional` valida y persiste los rubros como `ProfileCategory` (uno con `isPrimary: true`, el otro opcional con `isPrimary: false`).

El registro nace con `moderationStatus: 'PENDING_REVIEW'` y `type: 'PERSON'`, como hoy. No se crea `ProfileCategory` en el alta actual: este cambio lo añade.

## Decisiones confirmadas

1. **Matrícula (licencia): no se pide en el registro.** Si el rubro elegido tiene `requiresLicense`, la matrícula se pide después en `/panel/perfil` (que ya la maneja con su label correcto). Agregarla al registro duplicaría lógica y alargaría el alta.
2. **Flujo después del alta: mantener la redirección a `/panel/perfil`** como hoy. No se añade ruta intermedia; el formulario de perfil ya es un solo paso y el usuario ve progreso.
3. **Subcategorías y matrícula: no se piden en el registro.** Solo los 2 rubros (primario obligatorio, secundario opcional). El perfil ya completa subcategorías, ciudades, descripción y matrícula.
4. **UI: reutilizar exactamente `SelectorRubro` del perfil** (chips de radio agrupados por grupo), con el mismo patrón visual. Un `SelectorRubro` para el primario (requerido) y otro para el secundario (opcional, excluyendo el primario elegido).

## Alcance y lo que NO toca

- **Toca:** `FormularioRegistro.tsx`, `registroProfesionalSchema` en `src/schemas/index.ts`, `registrarProfesional` en `src/app/actions/registro.ts`.
- **No toca:** admin, lógica no relacionada, schema Prisma (ya soporta N:N con `isPrimary`), perfil, panel, publicación, sincronización de publicación.
- **Prisma:** `ProfileCategory` existe con `(profileId, categoryId, isPrimary)`. Se escribe igual que en `escribirPerfil` de `services/perfil.ts` (borrar y recrear; son 2 filas como máximo).

## Arquitectura y flujo de datos

```
cliente (FormularioRegistro)
  → nombre, email, password, whatsapp, primaryCategoryId, secondaryCategoryId
  → servidor (registrarProfesional)
    → valida con registroProfesionalSchema (Zod)
    → rate limit por IP
    → bloqueo email / whatsapp
    → transacción Prisma: crear User + Profile + ProfileCategory(s)
    → rollback si email de verificación falla
    → ok({ email }) → cliente hace signIn y redirige a /panel/perfil
```

El `selectorRubro` necesita el catálogo (`grupos: GrupoCatalogo[]`) en el cliente. Hoy el registro es una página server con `dynamic = 'force-dynamic'` que renderiza `FormularioRegistro` sin props. El catálogo se carga en el servidor del perfil (`obtenerCatalogoPerfil`) y se pasa como props. Para el registro, `FormularioRegistro` es un client component autónomo que no recibe grupos.

**Opciones para proveer el catálogo al registro:**

| Opción | Cómo | Trade-off |
|--------|------|-----------|
| O1 (recomendada) | `FormularioRegistro` recibe `grupos` como prop desde `page.tsx` (server component carga `obtenerCatalogoPerfil()` y se lo pasa). | Reutiliza `obtenerCatalogoPerfil` tal cual; una sola query en el servidor; cero JS extra en el cliente. |
| O2 | Client component carga el catálogo por sí mismo con un endpoint `/api/catalogo`. | Más request, más código, nueva ruta. |
| O3 | Pasar todo el catálogo embebido en HTML de la página. | Pesa, no es necesario. |

**Elegida: O1.** `src/app/registro/page.tsx` carga el catálogo en el servidor y se lo pasa a `FormularioRegistro` como prop `grupos`. `FormularioRegistro` muestra dos `SelectorRubro` (primario + secundario).

## Esquema (Zod)

Se extiende `registroProfesionalSchema` en `src/schemas/index.ts`:

```ts
import { id, limiteRubros } desde '@/schemas/perfil' // o definidos acá
```

Campos nuevos (además de `name, email, password, whatsapp`):

- `primaryCategoryId: string` — requerido. Mensaje: "Elegí tu rubro principal."
- `secondaryCategoryId: string` — opcional (string vacío o undefined = sin secundario). Si se envía, no puede igualar `primaryCategoryId`.

Validación de forma (Zod):
- ambos son `z.string().min(1, ...)` cuando se envían; el secundario permite vacío.
- superrefine: si `secondaryCategoryId` está presente y es igual a `primaryCategoryId`, error "El rubro secundario tiene que ser distinto del principal."

Validación de relaciones (servidor, dentro de la transacción, como el perfil):
- ambos existen y están `isActive: true` en `category`;
- secundario distinto del primario;
- máximo 2 rubros (implícito: 1 + 1 opcional).

No se valida que el secundario pertenezca a un grupo distinto ni se piden subcategorías.

## Validación en el Server Action

En `registrarProfesional`, después del `safeParse` del schema y dentro de la transacción Prisma abierta para crear el usuario, revalidar relaciones (patrón idéntico a `validarRelaciones` de `services/perfil.ts`, reducido):

1. `tx.category.findMany({ where: { id: { in: [primary, secondary] }, isActive: true } })` → si devuelve menos de los enviados, error "Alguno de los rubros no existe o está desactivado."
2. si `secondary === primary`, error "El rubro secundario tiene que ser distinto del principal."

Dentro de `profile.create` se añaden las `ProfileCategory`:

```ts
profile: {
  create: {
    name, slug, whatsappE164, whatsappHash, type: 'PERSON',
    moderationStatus: 'PENDING_REVIEW',
    categories: {
      create: [
        { categoryId: primaryCategoryId, isPrimary: true },
        ...(secondaryCategoryId ? [{ categoryId: secondaryCategoryId, isPrimary: false }] : []),
      ],
    },
  },
},
```

Nota: `prisma.profile.create` con `categories: { create: [...] }` dentro de `user.create` (anidado) funciona porque `Profile` tiene `categories ProfileCategory[]` y `ProfileCategory` tiene `profileId + categoryId + isPrimary`. El `profileId` lo resuelve Prisma automáticamente en la creación anidada.

## UI

En `FormularioRegistro`, entre el campo WhatsApp y el campo Contraseña (orden: datos de contacto → rubros → contraseña), dos secciones:

- **Rubro principal (requerido):** `SelectorRubro` con `etiqueta="Rubro principal"`, `requerido`, `valor=primaryCategoryId`, `onChange` actualiza estado local, `ayuda` opcional.
- **Rubro secundario (opcional):** `SelectorRubro` con `etiqueta="Rubro secundario"`, `requerido={false}`, `valor=secondaryCategoryId`, `excluir={primaryCategoryId}`, `ayuda="Opcional: otro rubro en el que también trabajás."`

Estado local: `primaryCategoryId`, `secondaryCategoryId` (strings, `''` = sin elegir). Se envían en el `FormData` del submit junto a los campos existentes.

`Errores` se extiende con `'primaryCategoryId' | 'secondaryCategoryId' | 'form'`.

El `SelectorRubro` del perfil se define como función interna no exportada en `FormularioPerfil.tsx`. Para reutilizarlo exactamente en el registro sin acoplar componentes, se extrae `SelectorRubro` a un archivo compartido (ej. `src/components/catalogo/SelectorRubro.tsx`) e importarlo desde ambos formularios. No cambia su comportamiento: mismo marcado, mismas clases, mismo `excluir`.

## Testing

- `tests/registro-schema.test.ts`: schema rechaza secundario igual al primario, acepta solo primario, acepta primario+secundario distinto, rechaza vacío en primario.
- `tests/registro.test.ts` (o contra Postgres efímero como los tests de perfil): alta con 1 rubro crea 1 `ProfileCategory` con `isPrimary: true`; alta con 2 rubros crea 2 filas (una `isPrimary`, otra no); alta con secundario repetido falla; alta con rubro inexistente falla.
- No hay tests de registro hoy (`glob tests/**/*registro*` vacío). Se añaden siguiendo el patrón de `tests/perfil-schema.test.ts`.

## Errores y mensajes

- primario vacío: "Elegí tu rubro principal."
- secundario igual al primario: "El rubro secundario tiene que ser distinto del principal."
- rubro inexistente/desactivado: "Alguno de los rubros no existe o está desactivado."

## Riesgos y límites conocidos

- El alta nace con `moderationStatus: 'PENDING_REVIEW'`; elegir rubros en el registro no acelera la publicación. El profesional sigue sin aparecer hasta completar WhatsApp, suscripción y revisión. Ese comportamiento no cambia.
- Si el rubro primario requiere matrícula (`requiresLicense`), el alta la permite sin matrícula (decisión A1); la matrícula se exige en `/panel/perfil`.
- Race condition: dos altas simultáneas del mismo email/Whatsapp ya se manejan con índices únicos de Prisma y el mensaje de duplicado. Los rubros se escriben dentro de la misma transacción del usuario, sin riesgo de exceder el límite de 2 porque el schema y la revalidación del servidor lo impiden antes de escribir.