# Diseño: alta única, promo reservada y panel

**Fecha:** 2026-11-25
**Estado:** borrador para revisión de usuario
**Sub-proyecto:** 3 — alta en una sola pantalla y activación diferida de la promo

## Objetivo

Que el profesional se registre **una sola vez, en un solo formulario**, con todos los datos
personales y del perfil que hacen falta para publicar. Al enviarlo va directo a la pantalla de
promo, donde solo ve el monto y una casilla de código. Al canjear un código de meses gratis, la
promo queda **reservada** (no consumida), se le avisa en pantalla y al aceptar entra a `/panel`.
Los meses corren desde que termina de verificarse, no desde que canjeó.

Concretamente:

1. `/registro` es un único formulario: cuenta (email, contraseña, WhatsApp) + perfil publicable.
2. Al crear la cuenta se redirige a `/panel/suscripcion` (la pantalla de promo).
3. Esa pantalla no vuelve a pedir datos ya cargados: muestra el monto del plan y una casilla de
   código promocional.
4. Canjear un cupón de meses gratis **reserva** el cupón y deja la suscripción `PENDING`; no exige
   email/WhatsApp/datos fiscales.
5. Un modal avisa que la promo quedó reservada. "Aceptar" lleva a `/panel`.
6. La activación es diferida e idempotente: corre al verificar email, al confirmar WhatsApp, al
   guardar datos fiscales de empresa y al abrir `/panel`.
7. Los datos fiscales dejan de pedirse a personas humanas: solo se exigen a empresas.

## Decisiones confirmadas

- **Un formulario, no pasos.** Se reutiliza `FormularioPerfil` con `modo="alta"`; no hay un segundo
  formulario de perfil ni se duplican campos.
- **En el alta no se piden** datos fiscales, cobertura adicional (`otherProvinces` / ciudades extra),
  fotos ni los datos opcionales de empresa (nombre comercial, tamaño, año, web). Eso se completa en
  el panel.
- **Empresa en el alta:** razón social y CUIT obligatorios. El tipo se elige en el mismo formulario.
- **Aceptación de términos:** checkbox obligatorio en el registro. La pantalla de promo solo muestra
  una línea "Al activar aceptás los términos (versión X)"; no repite el checkbox.
- **Promo reservada, no consumida:** al canjear se guarda el código en la suscripción; la redención
  (`CuponRedencion`) y el incremento de `usosActuales` ocurren recién al activar.
- **El monto se congela al reservar.** Un cambio de precio posterior no altera lo prometido.
- **La pantalla de promo es `/panel/suscripcion`.** Si ya hay suscripción activa, se mantiene la
  pantalla actual de suscriptor; si hay reserva pendiente, se muestra el estado de reserva.
- **"Pagar sin código"** no aparece en la vista principal: solo como desplegable discreto al pie
  cuando el perfil ya cumple todos los requisitos de pago.
- **Personas:** no ven datos fiscales ni en el panel ni en la navegación; `/panel/datos-fiscales`
  redirige a `/panel`. El requisito de pago fiscal queda solo para empresas.
- **Modal con `<dialog>` nativo**, foco en "Aceptar"; "Aceptar" → `/panel`.
- **Migración aditiva:** `Subscription.pendingCouponCode String?`.

## Flujo completo

```
/registro  (un formulario)
  → registrarProfesional  (transacción: User + Profile completo + rubros + subcategorías)
  → email de verificación
  → signIn (credentials) → /panel/suscripcion

/panel/suscripcion
  → muestra monto + casilla de código
  → suscribirme({ codigoCupon, aceptaTerminos: true })
      → cupón de meses gratis: reserva (PENDING + pendingCouponCode)
          → modal "Tus N meses gratis quedaron reservados. Verificá tu email y WhatsApp."
          → Aceptar → /panel
      → cupón de descuento o sin código: checkout de Mercado Pago (requiere requisitos)

/panel  (banner "promo reservada" mientras pendingCouponCode != null)
  → el usuario verifica email / WhatsApp / datos fiscales (empresa)
  → activarPromocionSiCorresponde() en cada verificación y al abrir /panel
      → cupón canjeado + suscripción ACTIVE + currentPeriodEnd = hoy + N meses
      → publicación sincronizada
```

## Alcance

**Toca:**

- `prisma/schema.prisma` + migración (campo nuevo).
- `src/schemas/perfil.ts` (extraer base y reglas cruzadas), `src/schemas/index.ts` (schema compuesto).
- `src/app/actions/registro.ts`, `src/services/perfil.ts` (guardado reutilizable en transacción).
- `src/components/perfil/FormularioPerfil.tsx`, `src/app/registro/page.tsx`,
  `src/app/panel/perfil/page.tsx` (agregar `modo="edicion"` al uso existente).
- `src/lib/suscripcion.ts`, `src/services/suscripcion.ts`, `src/app/actions/suscripcion.ts`.
- `src/app/panel/suscripcion/page.tsx`, `src/components/panel/FormularioPago.tsx`.
- Nuevos: `src/components/panel/FormularioPromo.tsx`, `src/components/panel/ModalPromo.tsx`.
- `src/app/panel/page.tsx`, `src/services/panel.ts`, `src/components/panel/PanelNavbar.tsx`.
- `src/app/panel/datos-fiscales/page.tsx`.
- `src/lib/verificacion-email.ts`, `src/app/verificar-email/page.tsx`,
  `src/services/verificacion-whatsapp.ts`.
- Tests y `scripts/verificar-promo.ts`.

**No toca:** administración, facturación, webhook de Mercado Pago, cron de vencidas, moderación ni
galería. El webhook sigue siendo el único que activa suscripciones pagas.

## Modelo de datos

```prisma
model Subscription {
  // ...

  /**
   * Código de un cupón de meses gratis que el profesional canjeó y todavía no
   * se activó porque le faltan verificaciones. La redención se crea recién al
   * activar: hasta entonces el cupo del cupón no se consume.
   *
   * Se guarda el código y no un FK: si el cupón se borra, la reserva sigue
   * diciendo qué se prometió, y el canje se valida contra el código al activar.
   */
  pendingCouponCode String?
}
```

- Migración aditiva, sin backfill: `prisma/migrations/20261125_promo_reservada/migration.sql` con
  `ALTER TABLE "Subscription" ADD COLUMN "pendingCouponCode" TEXT;`.
- `obtenerSuscripcion` agrega `pendingCouponCode: true` al `select`.
- No se crea ningún índice: se consulta siempre por `profileId` (ya único).

## Schemas

### `src/schemas/perfil.ts`

Hoy `perfilSchema` es un `ZodEffects` (objeto estricto + `superRefine`) y no se puede extender. Se
parte en tres piezas:

```ts
export const perfilBaseSchema = z.object({ ... }).strict()   // los mismos campos de hoy

export function reglasCruzadasPerfil(
  valor: z.infer<typeof perfilBaseSchema>,
  ctx: z.RefinementCtx,
): void { ... }                                               // el cuerpo actual del superRefine

export const perfilSchema = perfilBaseSchema.superRefine(reglasCruzadasPerfil)
```

`PerfilInput` y el comportamiento no cambian: `perfil-schema.test.ts` tiene que seguir pasando sin
tocarse.

### `src/schemas/index.ts`

El alta es el perfil completo **más** los datos de cuenta, planos en el mismo objeto (sin anidar
`cuenta`/`perfil`, para que el formulario arme un solo payload):

```ts
export const registroProfesionalSchema = perfilBaseSchema
  .extend({
    email: emailSchema,
    password: passwordSchema,
    whatsapp: whatsappSchema,
    aceptaTerminos: z.literal(true, {
      errorMap: () => ({ message: 'Para crear la cuenta tenés que aceptar los términos.' }),
    }),
  })
  .superRefine(reglasCruzadasPerfil)

export type RegistroProfesionalInput = z.input<typeof registroProfesionalSchema>
```

El `name` del perfil es también el nombre de la cuenta (`User.name`). No hay dos campos "nombre".

## Alta

### Server Action `registrarProfesional`

Se mantienen el rate limit por IP, la lista de bloqueo, la generación de slug, el hash de IP y el
envío del email con rollback. Cambia la creación:

```ts
const { email, password, whatsapp, aceptaTerminos, ...perfil } = parseado.data
const { name } = perfil
```

Dentro de una única transacción:

1. `tx.user.create` con `email`, `passwordHash`, `name`, `role: 'PROFESSIONAL'`, `emailVerified: null`,
   `signupIpHash`.
2. `tx.profile.create` con `userId`, `name`, `slug`, `whatsappE164` (cifrado), `whatsappHash`,
   `moderationStatus: 'PENDING_REVIEW'`. El resto de los campos lo escribe el paso 3.
3. `guardarPerfilEnTx(tx, profile.id, perfil)`. El resto de los campos del perfil los escribe este paso.
4. Si devuelve error, se lanza un `ErrorValidacionAlta` y la transacción revierte entero (no queda
   usuario huérfano).

`guardarPerfilEnTx` es la extracción del cuerpo actual de `guardarPerfil` (sin el `FOR UPDATE`,
porque la fila se acaba de crear en la misma transacción):

```ts
export async function guardarPerfilEnTx(
  tx: Prisma.TransactionClient,
  profileId: string,
  datos: ReturnType<typeof perfilSchema.parse>, // ya parseado y con defaults aplicados
): Promise<Resultado<null>> {
  const validacion = await validarRelaciones(tx, profileId, datos)
  if (!validacion.ok) return validacion
  await escribirPerfil(tx, profileId, datos)
  return ok(null)
}
```

`guardarPerfil` pasa a usar esta función dentro de su transacción. El alta **no** llama a
`sincronizarPublicacion`: un perfil recién creado no está verificado y no corresponde publicarlo.

Mapeo de errores: se conserva el de email/WhatsApp (`P2002`) y se agrega el genérico para CUIT/slug.
El email de verificación se envía **después** del commit; si falla, se borra el usuario por email
como hoy.

### Formulario único

`FormularioPerfil` pasa a tener dos modos:

```ts
type Props =
  | { modo: 'edicion'; datos: EditarPerfil; grupos: GrupoCatalogo[]; ciudades: CiudadCatalogo[] }
  | { modo: 'alta'; grupos: GrupoCatalogo[]; ciudades: CiudadCatalogo[]; versionTerminos: string }
```

- Estado inicial: `modo === 'edicion' ? datos : PERFIL_VACIO`. `PERFIL_VACIO` es una constante de tipo
  `Omit<EditarPerfil, 'id'>` con los valores neutros (`type: 'PERSON'`, strings vacíos, arrays vacíos,
  `company: {}`). El `id` no lo usa el formulario.
- `versionTerminos` llega por prop y no se importa de `@/lib/suscripcion`: ese módulo importa
  `@prisma/client` y no debe entrar al bundle del cliente.
- **Sin rótulos "Paso N"** en ningún modo: quedan los títulos de sección que ya existen.
- En `alta` se agrega arriba la sección **"Tu cuenta"**: email, contraseña, WhatsApp (con la misma
  previsualización normalizada que usa hoy `FormularioRegistro`) y el checkbox de términos con la
  versión vigente.
- En `alta` se ocultan:
  - `tradeName`, `teamSize`, `yearFounded`, `website` (se completan en el panel);
  - `coversWholeProvince`, `otherProvinces` y `cityIds` (cobertura adicional). Se envían con
    `false` / `[]`, que es el default del schema.
- Empresa: se muestran razón social y CUIT, nada más.
- El nombre visible se etiqueta como "Tu nombre o el de tu empresa" con la ayuda "Así te van a
  encontrar en las búsquedas".
- Validación: la misma que hoy (revisión de descripción antes de enviar) + el checkbox de términos.
  El resto lo decide el servidor.
- Envío en `alta`: arma el payload plano y llama a `registrarProfesional`. Si `ok`, hace
  `signIn('credentials', { email, password, redirect: false })` y `router.push('/panel/suscripcion')`
  + `router.refresh()`. Si el `signIn` falla, muestra "Tu cuenta se creó. Entrá desde /login para
  continuar." (el alta ya está hecha y no se revierte por un problema de sesión).
- En `edicion` no cambia nada del comportamiento actual.

`src/app/registro/page.tsx` pasa a cargar `grupos` **y** `ciudades` con `obtenerCatalogoPerfil()` y
renderiza `<FormularioPerfil modo="alta" … versionTerminos={VERSION_TERMINOS} />`. Se elimina
`src/components/registro/FormularioRegistro.tsx` (no queda wrapper): el formulario único es
`FormularioPerfil`.

## Suscripción: reserva y activación

### Requisitos de pago

`EntradaRequisitos` agrega `esEmpresa: boolean`. `evaluarRequisitosPago` solo agrega
`DATOS_FISCALES_INCOMPLETOS` cuando `esEmpresa && !tieneDatosFiscales`:

```ts
if (entrada.esEmpresa && !entrada.tieneDatosFiscales) {
  faltantes.push('DATOS_FISCALES_INCOMPLETOS')
}
```

`leerParaRequisitos` y `asegurarRequisitos` seleccionan `type` y pasan `esEmpresa: type === 'COMPANY'`.
`requisitosDePago` de un perfil de persona deja de devolver el requisito fiscal (hoy devuelve 5;
pasa a devolver 4 en un perfil nuevo).

### `crearSuscripcion`

Nuevo resultado:

```ts
export type ResultadoAlta =
  | { tipo: 'checkout'; urlCheckout: string }
  | { tipo: 'promo'; mesesGratis: number; activa: boolean }
```

Orden nuevo:

1. Parsear `aceptarTerminosSchema` (sin cambios).
2. **Si hay código, validarlo primero** con `validarCuponParaPerfil`, sin mirar requisitos.
3. Calcular `mesesGratis` y `montoConDescuento`.
4. **Si `mesesGratis > 0`:** camino de reserva (no pide `aceptaCuentaTitular` ni requisitos).
5. Si no, camino de pago actual: requisitos → `aceptaCuentaTitular` → plan → preapproval. En el
   `upsert` de la suscripción, `update` incluye `pendingCouponCode: null` (pagar sin código descarta
   cualquier reserva anterior).

Extraer de lo que hoy está duplicado una función `prepararAlta(profileId)` que lee el plan vigente,
verifica que no haya suscripción `ACTIVE` y calcula `montoBase` con `precioDeAlta`. La usan los dos
caminos.

Reserva:

```ts
// dentro de una transacción con SELECT ... FOR UPDATE sobre Profile
await tx.subscription.upsert({
  where: { profileId },
  create: {
    profileId, planId: plan.id,
    planAmount: new Prisma.Decimal(montoBase), // congelado acá
    priceFrozen: actual?.priceFrozen ?? false,
    status: SubscriptionStatus.PENDING,
    mpPreapprovalId: null,
    pendingCouponCode: validacion.data.cupo.codigo, // el código tal como está en la base
    termsVersion: VERSION_TERMINOS,
    termsAcceptedAt: ahora,
  },
  update: {
    planId: plan.id,
    planAmount: new Prisma.Decimal(montoBase),
    status: SubscriptionStatus.PENDING,
    mpPreapprovalId: null,
    pendingCouponCode: validacion.data.cupo.codigo,
    cancelAtPeriodEnd: false, cancelledAt: null,
    pastDueSince: null, graceUntil: null,
    currentPeriodStart: null, currentPeriodEnd: null,
    termsVersion: VERSION_TERMINOS, termsAcceptedAt: ahora,
  },
})
```

Antes de escribir se revalida que el plan siga activo y que no haya `ACTIVE`, igual que hoy. Los
preapprovals que la reserva deja atrás se cancelan después del commit (mismo patrón actual).

Al final del camino de reserva se llama `activarPromocionSiCorresponde(profileId)` una vez. Si
activó (el perfil ya cumplía todo), el resultado es `activa: true`; si no, `activa: false` y la UI
muestra el aviso de reserva.

### `activarPromocionSiCorresponde(profileId): Promise<boolean>`

Reemplaza a `activarMesesGratis`. Idempotente y silenciosa: devuelve `false` si no hay nada que
hacer y **nunca lanza** (las verificaciones no pueden fallar por culpa de la promo).

1. Leer la suscripción. Si no es `PENDING` o no tiene `pendingCouponCode`, return `false`.
2. Evaluar los requisitos con `leerParaRequisitos`. Si falta alguno, return `false`.
3. Transacción con `FOR UPDATE` sobre `Profile` y relectura de la suscripción:
   - si ya no está `PENDING` / ya no hay código, return sin escribir;
   - verificar plan activo (si no, log y return `false`; se reintenta más adelante);
   - leer el cupón por código (`tx.cupon.findUnique`), derivar meses con `mesesGratisDeCupon`. Si el
     cupón ya no otorga meses, log y `false`;
   - `canjearCupon({ tx, … , montoDelPlan: aNumero(planAmount) })`. Si falla, **no** se activa gratis
     fuera de las reglas: se revierte la transacción y la reserva queda para reintentar; log con el
     código;
   - `upsert` de la suscripción: `status: ACTIVE`, `currentPeriodStart: ahora`,
     `currentPeriodEnd: sumarMeses(ahora, meses)`, `pendingCouponCode: null`,
     `mpPreapprovalId: null` (y cancelar el preapproval anterior después del commit).
   - **No se toca `planAmount`**: ya se congeló al reservar.
4. Después del commit, `sincronizarPublicacion(profileId)` (la suscripción activa puede habilitar la
   publicación).
5. Return `true`.

`activarPromocionPorEmail(email)` es un envoltorio de 4 líneas para la página de verificación de
email (busca el perfil por email y delega).

### Puntos de activación

- `src/app/verificar-email/page.tsx`: `verificarEmailConToken` pasa a devolver
  `{ estado, email }`; si el estado es `VERIFICADO` o `YA_VERIFICADO`, llama a
  `activarPromocionPorEmail(email)`.
- `src/services/verificacion-whatsapp.ts` (`confirmar`): llama a `activarPromocionSiCorresponde`
  **antes** de `sincronizarPublicacion` para que la publicación vea la suscripción ya activa.
- `src/services/suscripcion.ts` (`guardarDatosFiscales`): tras el `upsert` exitoso.
- `src/services/panel.ts` (`obtenerEstadoPanel`): si la suscripción tiene `pendingCouponCode`, llama a
  la activación y relee la suscripción antes de calcular el estado. Así abrir el panel es el
  reintento lazy.

## Pantalla de promo (`/panel/suscripcion`)

Se conserva la estructura actual (header + `PanelNavbar` + precio + requisitos + tarjetas +
historial). Cambian las ramas del cuerpo:

```ts
const activa = suscripcion?.status === SubscriptionStatus.ACTIVE
const reservada = suscripcion?.status === SubscriptionStatus.PENDING && suscripcion.pendingCouponCode !== null
const esPromo = activa && suscripcion?.mpPreapprovalId === null
```

| Estado | Qué se muestra |
|---|---|
| `ACTIVE` | La tarjeta actual de suscriptor (promo o pago) + historial. Sin formularios. |
| `PENDING` con `pendingCouponCode` | Tarjeta "Tu promo está reservada": código, qué falta verificar (email/WhatsApp y fiscal si es empresa), texto "Cuando cumplas los requisitos, los meses se activan solos." Sin formulario de código. |
| `PENDING` sin reserva | Aviso actual de "pago sin terminar" + formulario de promo. |
| Sin suscripción o `EXPIRED`/`CANCELLED` | Formulario de promo. |

La tarjeta de precio actual queda como el "monto a pagar" (sale de `getCurrentPlan`, nunca escrito a
mano). El checklist de requisitos existente se sigue mostrando arriba tal cual.

`FormularioPromo` (nuevo, client):

- Recibe `precio`, `monto`, `moneda` y `versionTerminos`.
- Muestra el monto ("$X ARS por mes"), la casilla **Código promocional** (label visible, no
  placeholder-only), la línea "Al activar aceptás los términos y condiciones (versión X)." y el botón
  **Canjear código**.
- Envía `suscribirme({ codigoCupon, aceptaTerminos: true })`. No hay checkbox de términos: se
  aceptaron en el registro.
- Resultado:
  - `promo` → abre `ModalPromo` con `mesesGratis` y `activa`.
  - `checkout` → `window.location.href`.
  - error → mensaje visible; si el error es de requisitos, el texto ya está arriba en el checklist.
- Mientras espera: botón deshabilitado y texto "Canjeando…".

`ModalPromo` (nuevo, client):

- `<dialog>` nativo con `showModal()` en un `useEffect` y `autoFocus` en "Aceptar".
- `activa === true`: "Tus N meses gratis ya están activos."
- `activa === false`: "Tus N meses gratis quedaron reservados. Verificá tu email y WhatsApp para
  activarlos."
- "Aceptar" → `router.push('/panel')`.
- `aria-labelledby` apuntando al título; sin botón de cierre secundario (una sola acción).

**"Pagar sin código":** al pie del cuerpo, solo si `!activa && !reservada && requisitos.length === 0`,
un `<details>` nativo con `<summary>Prefiero pagar sin código</summary>` que revela el
`FormularioPago` actual. Sin JS extra y sin competir visualmente con el código.

`FormularioPago` cambia solo el manejo del resultado: si `tipo === 'promo'`, muestra el mismo
`ModalPromo` (un cupón de meses gratis ingresado desde la pantalla de pago también reserva); si
`tipo === 'checkout'`, redirige como hoy.

## Panel

- `EstadoPanel` agrega `promoReservada: boolean`; `obtenerEstadoPanel` lo deriva de
  `subscription.pendingCouponCode !== null` después de intentar la activación lazy.
- `src/app/panel/page.tsx` muestra, entre el header y los pasos, un banner si `estado.promoReservada`:
  "Tenés una promo reservada. Verificá tu email y WhatsApp para activarla." con enlaces a
  `/reenviar-verificacion` y `/panel/whatsapp`, más un enlace discreto a soporte por WhatsApp.
  El banner no reemplaza los pasos: los complementa.
- `PanelNavbar` se parte en dos:
  - `PanelNavbar.tsx` (server, misma exportación y mismos usos): lee la sesión y el `type` del perfil,
    y renderiza el cliente con `mostrarDatosFiscales={type === 'COMPANY'}`.
  - `PanelNavbarItems.tsx` (client): el contenido actual (`usePathname` + lista), con la sección
    "Datos fiscales" filtrada.
  Las 9 páginas que hoy usan `<PanelNavbar />` no cambian.
- `src/app/panel/datos-fiscales/page.tsx`: si el perfil es `PERSON`, `redirect('/panel')` antes de
  leer datos fiscales.

## Tests

- `tests/perfil-schema.test.ts`: sin cambios; verifica que la extracción no rompió `perfilSchema`.
- `tests/registro-schema.test.ts`: reescribir con el payload compuesto. Casos:
  - alta completa de persona válida;
  - alta de empresa sin razón social / sin CUIT → error;
  - `aceptaTerminos` ausente o `false` → error;
  - secundario igual al principal → error;
  - WhatsApp se normaliza;
  - campos desconocidos → error (strict).
- `tests/registro-form.test.ts`: renderizar `FormularioPerfil modo="alta"` y comprobar que existen
  los campos de cuenta, el checkbox de términos y las secciones del perfil, y que **no** existen
  "Paso 1" ni los campos de cobertura adicional.
- `tests/registro-page.test.ts`: actualizar el mock a `FormularioPerfil` y verificar que la página
  pasa `grupos` y `ciudades`.
- `tests/suscripcion.test.ts`: agregar `esEmpresa` a `COMPLETO`; nuevos casos:
  - persona sin datos fiscales → no falta nada;
  - empresa sin datos fiscales → `DATOS_FISCALES_INCOMPLETOS`;
  - empresa con datos fiscales → no falta nada.
- `scripts/verificar-promo.ts` (integración contra Postgres efímero, mismo patrón que
  `verificar-suscripcion.ts`):
  1. cupón `MES_GRATIS` con `valor = 2`, cupo 1;
  2. perfil persona sin verificar → `crearSuscripcion` devuelve `promo`, `activa: false`;
     suscripción `PENDING` con `pendingCouponCode`, `usosActuales` en 0, sin redención;
  3. verificar email + WhatsApp → activación → `ACTIVE`, `currentPeriodEnd ≈ hoy + 2 meses`,
     `usosActuales` en 1, redención creada, `pendingCouponCode` en `null`;
  4. segunda activación → no-op (`false`, sin doble redención);
  5. empresa sin datos fiscales → reserva, activación `false`; guardar datos fiscales → activación
     `true`;
  6. con `MP_PROVIDER=mock`: reservar en un perfil sin verificar, verificar email + WhatsApp
     directamente en la base (sin llamar a la activación) y pagar sin código → el alta paga deja
     `pendingCouponCode` en `null` y `mpPreapprovalId` con el id del mock.

## Riesgos y bordes

- **Cupón que deja de ser válido entre reserva y activación.** No se activa gratis fuera de las
  reglas del cupón: el canje revierte y la reserva queda para reintentar. Si el cupón venció o se
  agotó, la promo no se activa sola y el banner invita a escribir a soporte. Es preferible a regalar
  meses que nadie autorizó.
- **Precio.** `planAmount` se congela al reservar y la activación no lo reescribe; el precio que se
  muestra al canjear es el que se conserva.
- **Doble clic en "Canjear".** El `FOR UPDATE` + `profileId` único hacen que la segunda reserva pise
  la primera sin duplicar filas; la activación es idempotente y no crea dos redenciones porque
  `CuponRedencion.profileId` es único.
- **Persistencia del "pago sin terminar".** Una reserva de promo descarta el preapproval anterior,
  igual que un alta paga; no quedan cobros recurrentes vivos.
- **Personas que ya tenían datos fiscales cargados.** No se borran: dejan de pedirse y de mostrarse
  en la navegación, pero la fila queda. Borrarla sería destructivo y no aporta nada.
- **El alta ya no publica ni sincroniza.** Es el mismo comportamiento que hoy: la publicación llega
  con las verificaciones y la suscripción.
- **Tests de DB.** No hay Postgres en CI para `scripts/verificar-*`; el script es de verificación
  manual, como los existentes. Los tests de vitest cubren solo lógica pura.
