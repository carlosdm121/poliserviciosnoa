# Plan de implementación: alta única, promo reservada y panel

**Fecha:** 2026-11-25  
**Spec:** `docs/superpowers/specs/2026-11-25-alta-unica-promo-panel-design.md` (commit `63cb147`)  
**Objetivo:** Un solo formulario de alta → pantalla de promo → reserva de meses gratis → activación diferida → `/panel`

---

## Resumen de fases

| Fase | Descripción | Archivos principales |
|------|-------------|----------------------|
| 0 | Preparación y migración | `prisma/schema.prisma`, migración SQL |
| 1 | Schemas y validación compartida | `src/schemas/perfil.ts`, `src/schemas/index.ts` |
| 2 | Alta: action + guardado en transacción | `src/app/actions/registro.ts`, `src/services/perfil.ts` |
| 3 | Formulario único (`FormularioPerfil` modo `alta`) | `src/components/perfil/FormularioPerfil.tsx`, `src/app/registro/page.tsx` |
| 4 | Suscripción: requisitos condicionales, reserva, activación | `src/lib/suscripcion.ts`, `src/services/suscripcion.ts`, `src/app/actions/suscripcion.ts` |
| 5 | Pantalla de promo + modal | `src/app/panel/suscripcion/page.tsx`, `src/components/panel/FormularioPromo.tsx`, `src/components/panel/ModalPromo.tsx`, `src/components/panel/FormularioPago.tsx` |
| 6 | Panel: banner, navbar, datos fiscales | `src/app/panel/page.tsx`, `src/services/panel.ts`, `src/components/panel/PanelNavbar.tsx`, `src/components/panel/PanelNavbarItems.tsx`, `src/app/panel/datos-fiscales/page.tsx` |
| 7 | Puntos de activación (email, WhatsApp, fiscal, lazy) | `src/lib/verificacion-email.ts`, `src/app/verificar-email/page.tsx`, `src/services/verificacion-whatsapp.ts` |
| 8 | Tests y script de integración | `tests/*`, `scripts/verificar-promo.ts` |
| 9 | Verificación completa y commit | `npm run typecheck`, `npm test`, `npm run db:migrate`, `npm run verificar` |

---

## Fase 0 — Preparación y migración

### Tareas

1. **Agregar campo `pendingCouponCode` a `Subscription`**  
   - Editar `prisma/schema.prisma`: `pendingCouponCode String?` en model `Subscription`.
   - Crear migración: `npx prisma migrate dev --name promo_reservada`
   - Verificar `prisma/migrations/20261125_promo_reservada/migration.sql` contiene solo `ALTER TABLE "Subscription" ADD COLUMN "pendingCouponCode" TEXT;`
   - `npx prisma generate`

### Verificación
```bash
npx prisma migrate dev --name promo_reservada
npx prisma generate
npm run typecheck
```

---

## Fase 1 — Schemas y validación compartida

### 1.1 `src/schemas/perfil.ts` — Extraer base y reglas cruzadas

**Cambios:**
- Crear `perfilBaseSchema = z.object({ ... }).strict()` con todos los campos actuales del perfil (sin el `superRefine`).
- Extraer el cuerpo del `superRefine` actual a `export function reglasCruzadasPerfil(valor, ctx) { ... }`.
- Reconstruir `perfilSchema = perfilBaseSchema.superRefine(reglasCruzadasPerfil)`.
- `PerfilInput` y `EditarPerfil` no cambian.
- **No tocar** `LIMITES_PERFIL` ni `PERFIL_VACIO` (si existe, si no se crea en Fase 3).

**Archivos a tocar:** solo `src/schemas/perfil.ts`.

### 1.2 `src/schemas/index.ts` — Schema compuesto de registro

**Nuevo `registroProfesionalSchema`:**
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

- Eliminar el `registroProfesionalSchema` plano actual.
- `emailSchema`, `passwordSchema`, `whatsappSchema` ya existen en el archivo.

### Verificación
```bash
npm run typecheck
npm test tests/perfil-schema.test.ts   # debe seguir pasando sin cambios
npm test tests/registro-schema.test.ts # fallará hasta reescribirlo (Fase 8)
```

---

## Fase 2 — Alta: action + guardado en transacción

### 2.1 `src/services/perfil.ts` — Extraer `guardarPerfilEnTx`

**Nueva función exportada:**
```ts
export async function guardarPerfilEnTx(
  tx: Prisma.TransactionClient,
  profileId: string,
  datos: z.infer<typeof perfilSchema>, // ya parseado, con defaults
): Promise<Resultado<null>> {
  const validacion = await validarRelaciones(tx, profileId, datos)
  if (!validacion.ok) return validacion
  await escribirPerfil(tx, profileId, datos)
  return ok(null)
}
```

- `guardarPerfil` pasa a usar `guardarPerfilEnTx` dentro de su transacción (con `FOR UPDATE`).
- No tocar `validarRelaciones` ni `escribirPerfil`.
- No llamar a `sincronizarPublicacion` desde `guardarPerfilEnTx`.

### 2.2 `src/app/actions/registro.ts` — Reescribir `registrarProfesional`

**Cambios clave:**
- Input: `RegistroProfesionalInput` (del schema compuesto).
- Dentro de **una sola transacción**:
  1. `tx.user.create` con `email`, `passwordHash`, `name` (del perfil), `role: 'PROFESSIONAL'`, `emailVerified: null`, `signupIpHash`.
  2. `tx.profile.create` con `userId`, `name`, `slug`, `whatsappE164` (cifrado), `whatsappHash`, `moderationStatus: 'PENDING_REVIEW'`.
  3. `guardarPerfilEnTx(tx, profile.id, perfil)` con el resto de campos.
- Si falla el paso 3, lanzar `ErrorValidacionAlta` y la transacción revierte completo.
- **No** llamar a `sincronizarPublicacion`.

### Verificación
```bash
npm run typecheck
npm test tests/registro-page.test.ts   # fallará hasta Fase 3-8
```

---

## Fase 3 — Formulario único (`FormularioPerfil` modo `alta`)

### 3.1 `src/components/perfil/FormularioPerfil.tsx` — Dos modos

**Props:**
```ts
type Props =
  | { modo: 'edicion'; datos: EditarPerfil; grupos: GrupoCatalogo[]; ciudades: CiudadCatalogo[] }
  | { modo: 'alta'; grupos: GrupoCatalogo[]; ciudades: CiudadCatalogo[]; versionTerminos: string }
```

**Estado inicial:**
- `modo === 'edicion' ? datos : PERFIL_VACIO`
- `PERFIL_VACIO`: constante `Omit<EditarPerfil, 'id'>` con `type: 'PERSON'`, strings vacíos, arrays vacíos, `company: {}`.

**En modo `alta`:**
- Sección **"Tu cuenta"** arriba: email, contraseña, WhatsApp (con previsualización normalizada igual a `FormularioRegistro`), checkbox `aceptaTerminos` con texto "Acepto los términos y condiciones (versión {versionTerminos})".
- **Ocultar** (no renderizar, enviar defaults del schema):
  - `tradeName`, `teamSize`, `yearFounded`, `website`
  - `coversWholeProvince`, `otherProvinces`, `cityIds`
- Empresa: se muestran razón social y CUIT (requeridos si `type === 'COMPANY'`).
- Nombre visible: label "Tu nombre o el de tu empresa", ayuda "Así te van a encontrar en las búsquedas".
- **Sin rótulos "Paso N"** en ningún modo (usar títulos de sección existentes).
- Validación cliente: la misma que hoy (revisión descripción) + checkbox términos obligatorio.
- `versionTerminos` por prop (no importar `@/lib/suscripcion`).

**Envío en `alta`:**
```ts
const payload = { ...formData, aceptaTerminos: true } // plano
const res = await registrarProfesional(payload)
if (res.ok) {
  await signIn('credentials', { email: payload.email, password: payload.password, redirect: false })
  router.push('/panel/suscripcion')
  router.refresh()
} else if (res.code === 'CREDENCIALES_INVALIDAS') { ... }
```

### 3.3 Eliminar `src/components/registro/FormularioRegistro.tsx`

- Ya no se usa. Borrar archivo.

### Verificación
```bash
npm run typecheck
npm test tests/registro-form.test.ts   # Fase 8
npm test tests/registro-page.test.ts   # Fase 8
```

---

## Fase 3 — Suscripción: requisitos condicionales, reserva, activación

### 4.1 `src/lib/suscripcion.ts` — Requisitos condicionales

**Cambios en `EntradaRequisitos`:**
```ts
interface EntradaRequisitos {
  // ... campos actuales
  esEmpresa: boolean
}
```

**En `evaluarRequisitosPago`:**
```ts
if (entrada.esEmpresa && !entrada.tieneDatosFiscales) {
  faltantes.push('DATOS_FISCALES_INCOMPLETOS')
}
```

**En `leerParaRequisitos` / `asegurarRequisitos`:**
- Seleccionar `type` del perfil y pasar `esEmpresa: type === 'COMPANY'`.

**Resultado:** perfil persona nuevo → 4 requisitos (sin fiscal); empresa nueva → 5 requisitos.

### 4.2 `src/services/suscripcion.ts` — Lógica de reserva y activación

#### 4.2.1 Nuevo tipo de resultado
```ts
export type ResultadoAlta =
  | { tipo: 'checkout'; urlCheckout: string }
  | { tipo: 'promo'; mesesGratis: number; activa: boolean }
```

#### 4.2.2 `prepararAlta(profileId)` — función auxiliar
- Lee plan vigente, verifica que no haya suscripción `ACTIVE`, calcula `montoBase` con `precioDeAlta`.
- Usada por ambos caminos (promo y checkout).

#### 4.2.3 `crearSuscripcion` — Orden nuevo
1. Parsear `aceptarTerminosSchema` (sin cambios).
2. **Si hay código, validarlo primero** con `validarCuponParaPerfil`, sin mirar requisitos.
3. Calcular `mesesGratis` y `montoConDescuento`.
4. **Si `mesesGratis > 0`:** camino de reserva (no `aceptaCuentaTitular`, no requisitos).
5. **Si no:** camino de pago actual → requisitos → `aceptaCuentaTitular` → plan → preapproval.
   - En `upsert` de suscripción: `update` incluye `pendingCouponCode: null` (pagar sin código descarta cualquier reserva anterior).

#### 4.2.4 Reserva (transacción con `FOR UPDATE` sobre Profile)
```ts
await tx.subscription.upsert({
  where: { profileId },
  create: {
    profileId, planId: plan.id,
    planAmount: new Prisma.Decimal(montoBase), // congelado acá
    priceFrozen: actual?.priceFrozen ?? false,
    status: SubscriptionStatus.PENDING,
    mpPreapprovalId: null,
    pendingCouponCode: validacion.data.cupo.codigo,
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
- Revalidar plan activo y que no haya `ACTIVE` antes de escribir.
- Cancelar preapprovals previos después del commit (patrón actual).

#### 4.2.5 `activarPromocionSiCorresponde(profileId): Promise<boolean>`
- Idempotente, silenciosa, nunca lanza.
1. Leer suscripción. Si no `PENDING` o no `pendingCouponCode` → `false`.
2. `leerParaRequisitos(profileId)`. Si falta alguno → `false`.
3. Transacción con `FOR UPDATE` sobre `Profile` y relectura de suscripción:
   - Si ya no `PENDING` / no código → return sin escribir.
   - Verificar plan activo (si no, log y `false`).
   - Leer cupón por código, derivar meses con `mesesGratisDeCupon`. Si el cupón ya no otorga meses, log y `false`.
   - `canjearCupon({ tx, … , montoDelPlan: aNumero(planAmount) })`. Si falla, **no** se activa gratis fuera de las reglas: se revierte la transacción y la reserva queda para reintentar; log con el código.
   - `upsert` suscripción: `status: ACTIVE`, `currentPeriodStart: ahora`, `currentPeriodEnd: sumarMeses(ahora, meses)`, `pendingCouponCode: null`, `mpPreapprovalId: null` (y cancelar preapproval anterior después del commit).
   - **No se toca `planAmount`**: ya se congeló al reservar.
4. Post-commit: `sincronizarPublicacion(profileId)`.
5. Return `true`.

#### 4.3 `activarPromocionPorEmail(email)` — envoltorio
- Busca perfil por email, delega a `activarPromocionSiCorresponde`.

### 4.4 `src/services/verificacion-whatsapp.ts` — `confirmar`

- En `confirmar`, tras el `upsert` exitoso de `whatsappVerifiedAt`:
```ts
await activarPromocionSiCorresponde(profileId)
// recién después
await sincronizarPublicacion(profileId)
```

### 4.4 `src/services/suscripcion.ts` — `guardarDatosFiscales`

- Tras el `upsert` exitoso de datos fiscales:
```ts
await activarPromocionSiCorresponde(profileId)
```

### Verificación
```bash
npm run typecheck
npm run dev   # verificar flujo completo: registro → promo → verificación → activación
```

---

## Fase 5 — Pantalla de promo (`/panel/suscripcion`) + Modal

### 5.1 `src/components/panel/FormularioPromo.tsx` (nuevo, client)

**Props:**
```ts
interface FormularioPromoProps {
  precio: number
  monto: string      // formateado, ej "$1.234 ARS"
  moneda: string
  versionTerminos: string
}
```

**UI:**
- Monto visible: "{$monto} por mes"
- Input **Código promocional** (label visible, no placeholder-only)
- Línea: "Al activar aceptás los términos y condiciones (versión {versionTerminos})."
- Botón **"Canjear código"**
- Estado loading: botón deshabilitado, texto "Canjeando…"

**Acción:**
- `suscribirme({ codigoCupon, aceptaTerminos: true })`
- Resultado `promo` → abrir `ModalPromo` con `mesesGratis` y `activa`
- Resultado `checkout` → `window.location.href = urlCheckout`
- Error → mensaje visible (si es de requisitos, el checklist de arriba ya lo muestra)

### 5.2 `src/components/panel/ModalPromo.tsx` (nuevo, client)

**Props:**
```ts
interface ModalPromoProps {
  mesesGratis: number
  activa: boolean
  onAccept: () => void  // router.push('/panel')
}
```

**UI:**
- `<dialog>` nativo, `showModal()` en `useEffect`, `autoFocus` en botón "Aceptar".
- `activa === true`: "Tus {mesesGratis} meses gratis ya están activos."
- `activa === false`: "Tus {mesesGratis} meses gratis quedaron reservados. Verificá tu email y WhatsApp para activarlos."
- "Aceptar" → `onAccept()` + `dialog.close()`.
- `aria-labelledby` en título. Sin botón de cierre secundario (una sola acción).

### 5.3 `src/app/panel/suscripcion/page.tsx` — Ramificar cuerpo

**Estados derivados:**
```ts
const activa = suscripcion?.status === SubscriptionStatus.ACTIVE
const reservada = suscripcion?.status === SubscriptionStatus.PENDING && suscripcion.pendingCouponCode !== null
const esPromo = activa && suscripcion?.mpPreapprovalId === null
```

| Estado | Qué renderiza |
|--------|---------------|
| `ACTIVE` | Tarjeta suscriptor actual + historial. Sin formularios. |
| `PENDING` + `pendingCouponCode` | Tarjeta "Tu promo está reservada": código, qué falta (email/WhatsApp + fiscal si es empresa), "Cuando cumplas los requisitos, los meses se activan solos." Sin formulario. |
| `PENDING` sin reserva | Aviso "pago sin terminar" + `FormularioPromo`. |
| Sin suscripción / `EXPIRED` / `CANCELLED` | `FormularioPromo`. |

**Checklist de requisitos:** se sigue mostrando arriba tal cual (usa `requisitosParaMostrar(faltantes)`).

**Formulario de pago sin código:**
```tsx
{!activa && !reservada && requisitos.length === 0 && (
  <details className="mt-8">
    <summary className="text-sm text-muted cursor-pointer">Prefiero pagar sin código</summary>
    <FormularioPago ... />
  </details>
)}
```

### 5.4 `src/components/panel/FormularioPago.tsx` — Adaptar resultado

- Si `tipo === 'promo'` → mostrar mismo `ModalPromo` (un cupón de meses gratis desde acá también reserva); si `tipo === 'checkout'`, redirige como hoy.

### Verificación
```bash
npm run typecheck
npm run dev   # verificación manual en /panel/suscripcion
```

---

## Fase 6 — Panel: banner, navbar, datos fiscales

### 6.1 `src/services/panel.ts` — `obtenerEstadoPanel`

- Agregar `promoReservada: boolean` al retorno.
- Lógica:
  1. Leer suscripción.
  2. Si `pendingCouponCode !== null` → llamar `activarPromocionSiCorresponde(profileId)` y **releer** suscripción.
  3. `promoReservada = suscripcion.pendingCouponCode !== null`.

### 6.2 `src/app/panel/page.tsx` — Banner de promo reservada

- Entre header y pasos, si `estado.promoReservada`:
```tsx
<div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
  <p className="font-bold">Tenés una promo reservada.</p>
  <p className="text-sm mt-1">Verificá tu email y WhatsApp para activarla.</p>
  <div className="mt-3 flex gap-4 text-sm">
    <Link href="/reenviar-verificacion" className="underline">Reenviar email</Link>
    <Link href="/panel/whatsapp" className="underline">Verificar WhatsApp</Link>
    <a href="https://wa.me/..." target="_blank" rel="noopener" className="underline">Ayuda por WhatsApp</a>
  </div>
</div>
```
- No reemplaza los pasos: los complementa.

### 6.3 `src/components/panel/PanelNavbar.tsx` — Server wrapper + cliente

**Archivo actual → se renombra a `PanelNavbarItems.tsx` (client):**
- Contenido actual (`usePathname` + lista estática de secciones).
- Recibe prop `mostrarDatosFiscales: boolean`.
- Filtrar la sección "Datos fiscales" si `false`.
- Las 9 páginas que hoy usan `<PanelNavbar />` no cambian su llamada.

### 6.4 `src/app/panel/datos-fiscales/page.tsx` — Redirigir personas

- Antes de leer datos fiscales:
```ts
const profile = await prisma.profile.findUnique({ where: { userId: sesion.user.id }, select: { type: true } })
if (profile?.type === 'PERSON') redirect('/panel')
```

### Verificación
```bash
npm run typecheck
npm run dev   # verificar navbar, banner, redirección
```

---

## Fase 7 — Puntos de activación (email, WhatsApp, fiscal, lazy)

### 7.1 `src/lib/verificacion-email.ts` — Devolver email

- `verificarEmailConToken` pasa a devolver `{ estado: EstadoVerificacion; email: string }` en lugar de solo `EstadoVerificacion`.
- Cambio mínimo: el email ya se tiene al buscar el token; devolverlo junto al estado.

### 7.2 `src/app/verificar-email/page.tsx` — Disparar activación

```ts
const { estado, email } = await verificarEmailConToken(token)
if (estado === 'VERIFICADO' || estado === 'YA_VERIFICADO') {
  await activarPromocionPorEmail(email)
}
```

### 7.3 `src/services/verificacion-whatsapp.ts` — `confirmar`

- En `confirmar`, tras el `upsert` exitoso de `whatsappVerifiedAt`:
```ts
await activarPromocionSiCorresponde(profileId)
```

### 7.4 `src/services/suscripcion.ts` — `guardarDatosFiscales`

- Tras el `upsert` exitoso de datos fiscales:
```ts
await activarPromocionSiCorresponde(profileId)
```

### Verificación
```bash
npm run typecheck
npm run dev   # probar flujo completo: registro → promo → verificación → activación
```

---

## Fase 8 — Tests y script de integración

### 8.1 `tests/perfil-schema.test.ts`
- **Sin cambios**. Verifica que la extracción no rompió `perfilSchema`.

### 8.2 `tests/registro-schema.test.ts` — Reescribir para payload compuesto

**Casos:**
- Alta completa de persona válida.
- Alta de empresa sin `companyName` / sin `companyCuit` → error.
- `aceptaTerminos` ausente o `false` → error.
- Secundario igual al principal → error (regla cruzada).
- WhatsApp se normaliza.
- Campos desconocidos → error (strict).

### 8.3 `tests/registro-form.test.ts` — Render `FormularioPerfil modo="alta"`

- Comprobar existencia de: campos de cuenta (email, password, WhatsApp), checkbox términos, secciones del perfil.
- Comprobar **ausencia** de: rótulos "Paso 1"/"Paso 2"/..., campos de cobertura adicional (`coversWholeProvince`, `otherProvinces`, `cityIds`), campos opcionales de empresa.

### 8.4 `tests/suscripcion.test.ts` — Agregar `esEmpresa`

- En caso `COMPLETO` agregar `esEmpresa: true`.
- Nuevos casos:
  - Persona sin datos fiscales → **no** falta `DATOS_FISCALES_INCOMPLETOS`.
  - Empresa sin datos fiscales → falta `DATOS_FISCALES_INCOMPLETOS`.
  - Empresa con datos fiscales → no falta nada.

### 8.5 `scripts/verificar-promo.ts` (nuevo, integración contra Postgres efímero)

**Patrón:** igual que `scripts/verificar-suscripcion.ts` (usa `MP_PROVIDER=mock`).

**Escenarios:**
1. Cupón `MES_GRATIS` con `valor = 2`, cupo 1.
2. Perfil persona sin verificar → `crearSuscripcion` devuelve `promo`, `activa: false`; suscripción `PENDING` con `pendingCouponCode`, `usosActuales` en 0, sin redención.
3. Verificar email + WhatsApp → activación → `ACTIVE`, `currentPeriodEnd ≈ hoy + 2 meses`, `usosActuales` en 1, redención creada, `pendingCouponCode = null`.
4. Segunda activación → no-op (`false`, sin doble redención).
5. Empresa sin datos fiscales → reserva, activación `false`; guardar datos fiscales → activación `true`.
6. Con `MP_PROVIDER=mock`: reservar en perfil sin verificar, verificar email + WhatsApp directamente en BD (sin llamar a la activación) y pagar sin código → el alta paga deja `pendingCouponCode` en `null` y `mpPreapprovalId` con el id del mock.

### Verificación
```bash
npm run typecheck
npm test
# tests/perfil-schema.test.ts        ✓
# tests/registro-schema.test.ts      ✓
# tests/registro-form.test.ts        ✓
# tests/registro-page.test.ts        ✓
# tests/suscripcion.test.ts          ✓
# (scripts/verificar-promo.ts se ejecuta manualmente)
```

---

## Fase 9 — Verificación completa y commit

### 9.1 Lint + typecheck + tests
```bash
npm run typecheck
npm test
```

### 9.2 Migración aplicada y client generado
```bash
npx prisma migrate status   # debe mostrar promo_reservada aplicada
npx prisma generate
```

### 9.3 Verificación manual en dev server
```bash
npm run dev
# 1. /registro → formulario único completo → submit → /panel/suscripcion
# 2. /panel/suscripcion → muestra monto + casilla código
# 3. Canjear cupón MES_GRATIS → modal "reservada" → Aceptar → /panel
# 4. /panel → banner promo reservada + enlaces
# 5. Verificar email → activación automática
# 6. Verificar WhatsApp → activación si faltaba
# 7. Empresa: guardar datos fiscales → activación
# 8. Navbar: no muestra "Datos fiscales" para persona
# 9. /panel/datos-fiscales → redirect a /panel para persona
# 10. Pagar sin código (details al pie) → checkout mock
```

### 9.4 Commit y push
```bash
git add -A
git commit -m "feat: alta única, promo reservada y activación diferida

- Migración: Subscription.pendingCouponCode
- Schemas: perfilBaseSchema + reglasCruzadasPerfil + registroProfesionalSchema compuesto
- Alta: registrarProfesional crea User + Profile completo en una transacción
- FormularioPerfil modo alta/edicion, sin pasos, campos fiscales solo para empresa
- Suscripción: validar cupón primero, reservar meses gratis (PENDING + pendingCouponCode)
- activarPromocionSiCorresponde idempotente (email, WhatsApp, fiscal, lazy en panel)
- Pantalla promo: FormularioPromo + ModalPromo (<dialog> nativo)
- Panel: banner promo reservada, navbar server/client, datos-fiscales redirect persona
- Tests actualizados + script verificar-promo.ts"
git push
```

---

## Riesgos y mitigaciones (del spec)

| Riesgo | Mitigación en el plan |
|--------|----------------------|
| Cupón inválido entre reserva y activación | `canjearCupon` revierte la transacción; reserva queda para reintentar; no se regalan meses fuera de reglas |
| Precio cambia tras reserva | `planAmount` se congela al reservar (`new Prisma.Decimal(montoBase)`); activación no lo reescribe |
| Doble clic en "Canjear" | `FOR UPDATE` + `profileId` único; segunda reserva pisa la primera sin duplicar filas; activación es idempotente y no crea dos redenciones porque `CuponRedencion.profileId` es único |
| Persistencia del "pago sin terminar" | Una reserva de promo descarta el preapproval anterior, igual que un alta paga; no quedan cobros recurrentes vivos |
| Personas con datos fiscales previos | No se borran: dejan de pedirse/mostrarse en la navegación, pero la fila queda intacta. Borrarla sería destructivo y no aporta nada. |
| Alta no publica | Comportamiento actual conservado: publicación llega con verificaciones + suscripción. |

---

## Checklist de revisión del plan (auto-review)

- [ ] **Cobertura:** Cada sección del spec tiene tareas mapeadas (migración, schemas, action, formulario, suscripción, panel, activación, tests).
- [ ] **Tipos exactos:** Interfaces y tipos citados textualmente del spec (`ResultadoAlta`, `EntradaRequisitos`, `Props` de componentes).
- [ ] **Review Focus:** Cada fase incluye comando de verificación (`typecheck`, test específico, dev server).
- [ ] **Proporción:** Plan ~300 líneas para spec ~480 líneas (razonable).
- [ ] **Sin scope creep:** No toca administración, facturación, webhook MP, cron, moderación, galería.
- [ ] **Orden de ejecución:** Fases 0→9 respetan dependencias (schemas antes que action; action antes que formulario; suscripción antes que promo; panel después de suscripción).

---

## Próximos pasos

1. Usuario revisa el plan y elige método de ejecución:
   - **subagent-driven** (recomendado para tareas independientes): una subagente por fase.
   - **native** (inline): yo ejecuto fase a fase en esta conversación.
2. Al recibir confirmación, empiezo por **Fase 0**.