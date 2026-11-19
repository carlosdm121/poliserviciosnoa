# Registro con elección de rubros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ability for users to select 1-2 rubros (rubros) during professional registration, with 1 mandatory primary and 1 optional secondary rubro, reusing the existing `SelectorRubro` component from the profile form.

**Architecture:** The implementation will consist of three main components: a server page that loads the catalog, a client form component that displays the rubro selectors, and server-side validation to ensure rubros are valid and the primary/secondary constraints are met.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma, Zod, React, Tailwind CSS.

**Spec:** docs/superpowers/specs/2026-11-19-multi-profesion-registro-design.md

## Global Constraints

- **Prisma schema:** `ProfileCategory` already exists with `(profileId, categoryId, isPrimary)` fields; no schema changes needed.
- **Zod validation:** Extend `registroProfesionalSchema` in `src/schemas/index.ts` with `primaryCategoryId` (required) and `secondaryCategoryId` (optional, must differ from primary).
- **Prisma transaction:** `registrarProfesional` already creates `User` + `Profile` in a single transaction; add `ProfileCategory` records within the same transaction.
- **UI:** Must reuse `SelectorRubro` component from `FormularioPerfil.tsx` (same visual pattern, same `excluir` prop).
- **Validation flow:** Client-side Zod validation + server-side validation within Prisma transaction (same pattern as profile editing).
- **Matrícula:** Not required in registration (decision A1); matrícula validation happens later in `/panel/perfil`.
- **Subcategorías:** Not requested in registration; only rubros (primary + optional secondary).
- **Flujo post-alta:** Maintain existing redirection to `/panel/perfil` after successful registration.

## Review Focus

- **Primary rubro required:** Ensure `primaryCategoryId` is required and validated.
- **Secondary rubro optional:** Ensure `secondaryCategoryId` is optional and cannot equal primary.
- **Rubros must be active:** Validate that both selected rubros exist and are `isActive: true`.
- **Transaction safety:** Ensure rubro validation and creation happen within the same Prisma transaction as user/profile creation.
- **UI consistency:** Ensure `SelectorRubro` components look and behave identically to the profile form.

## Tasks

### Task 1: Extend the Zod schema for rubro selection

**Files:**
- Modify: `src/schemas/index.ts`

**Interfaces:**
- Consumes: `registroProfesionalSchema` schema
- Produces: Extended schema with `primaryCategoryId` and `secondaryCategoryId` fields

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-schema.test.ts`
  - Write tests:
    - `registroProfesionalSchema` should reject when `secondaryCategoryId` equals `primaryCategoryId`
    - `registroProfesionalSchema` should accept primary only (secondary undefined/empty)
    - `registroProfesionalSchema` should accept primary + secondary when secondary differs
    - `registroProfesionalSchema` should reject when `primaryCategoryId` is empty
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-schema.test.ts`
  - Expected: FAIL (schema doesn't accept these fields yet)
- [ ] **Step 3: Implement `registroProfesionalSchema` in `src/schemas/index.ts`**
  - Add `primaryCategoryId: z.string().min(1, 'Elegí tu rubro principal.')`
  - Add `secondaryCategoryId: z.string().optional().or(z.literal(''))`
  - Add superrefine: secondary must differ from primary
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-schema.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/schemas/index.ts tests/registro-schema.test.ts`
  - `git commit -m "feat: extend registroProfesionalSchema with primary and secondary rubro fields"`

---

### Task 2: Modify registrarProfesional to handle rubro validation and persistence

**Files:**
- Modify: `src/app/actions/registro.ts`

**Interfaces:**
- Consumes: `primaryCategoryId`, `secondaryCategoryId` from validated schema
- Produces: Validated and persisted ProfileCategory records in Prisma transaction

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro.test.ts`
  - Write tests for: creating 1 ProfileCategory with primary, creating 2 with primary+secondary, failing when secondary equals primary
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement rubro validation and persistence in `registrarProfesional`**
  - Add validation within Prisma transaction (pattern from `services/perfil.ts`)
  - Add `categories` creation in `profile.create`
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/app/actions/registro.ts tests/registro.test.ts`
  - `git commit -m "feat: extend registrarProfesional to handle primary and secondary rubros"`

---

### Task 3: Modify FormularioRegistro to display rubro selectors

**Files:**
- Modify: `src/components/registro/FormularioRegistro.tsx`
- Create: `src/components/catalogo/SelectorRubro.tsx` (shared component)

**Interfaces:**
- Consumes: `grupos: GrupoCatalogo[]` prop
- Produces: Two `SelectorRubro` components

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-form.test.ts`
  - Write test: renders two SelectorRubro components with catalog groups
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-form.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement shared `SelectorRubro` component**
  - Extract from `FormularioPerfil.tsx` (function declaration)
  - Move to `src/components/catalogo/SelectorRubro.tsx`
- [ ] **Step 4: Implement `FormularioRegistro` changes**
  - Accept `grupos` prop
  - Render two `SelectorRubro` components (primary required, secondary optional with `excluir`)
- [ ] **Step 5: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-form.test.ts`
  - Expected: PASS
- [ ] **Step 6: Commit**
  - `git add src/components/registro/FormularioRegistro.tsx src/components/catalogo/SelectorRubro.tsx`
  - `git commit -m "feat: add rubro selectors to registro form"`

---

### Task 4: Modify registro page to load and pass catalog

**Files:**
- Modify: `src/app/registro/page.tsx`

**Interfaces:**
- Consumes: `obtenerCatalogoPerfil()` from `src/services/catalogo.ts`
- Produces: `FormularioRegistro` with `grupos` prop

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-page.test.ts`
  - Write test: renders `FormularioRegistro` with catalog groups
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-page.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement page changes**
  - Load catalog with `obtenerCatalogoPerfil()`
  - Pass `grupos` to `FormularioRegistro`
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-page.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/app/registro/page.tsx`
  - `git commit -m "feat: update registro page to load and pass catalog"`

---

## Plan complete and saved to `docs/superpowers/plans/2026-11-19-registro-con-rubros.md`. Please review the plan. Which execution approach would you prefer?

- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Native**, because the tasks are sequential and each builds on the previous with clear interfaces, making it efficient to implement in a single session.

---

## Review Focus

- **Primary rubro required:** Ensure `primaryCategoryId` is required and validated with clear error message.
- **Secondary rubro optional:** Ensure `secondaryCategoryId` is optional and cannot equal primary.
- **Rubros must be active:** Validate that both selected rubros exist and are `isActive: true`.
- **Transaction safety:** Ensure rubro validation and creation happen within the same Prisma transaction as user/profile creation.
- **UI consistency:** Ensure `SelectorRubro` components look and behave identically to the profile form.

## Execution Handoff

After saving and self-reviewing the plan, I saved the plan to `docs/superpowers/plans/2026-11-19-registro-con-rubros.md`. Please review the plan. Which execution approach would you prefer?

- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Native**, because there are 4 discrete tasks with clear boundaries and minimal interdependence between components, making it efficient to implement sequentially in a single session.

---

## Final Plan Status

The plan for sub-project 2 has been created and saved. The user requested to proceed with implementation via "hazlo" (do it). The execution approach recommended is **Native** (implementing in this session with final review).

The user asked to proceed, so we will now implement the plan tasks sequentially.

**Recommended approach:** Native (execute plan in this session, then do final review).

---

## Final Implementation Plan (Corrected)

I will now write the final, correct implementation plan content to this file before proceeding with implementation.

<plan-content>

# Registro con elección de rubros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ability for users to select 1-2 rubros (rubros) during professional registration, with 1 mandatory primary and 1 optional secondary rubro, reusing the existing `SelectorRubro` component from the profile form.

**Architecture:** The implementation will consist of three main components: a server page that loads the catalog, a client form component that displays the rubro selectors, and server-side validation to ensure rubros are valid and the primary/secondary constraints are met.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma, Zod, React, Tailwind CSS.

**Spec:** docs/superpowers/specs/2026-11-19-multi-profesion-registro-design.md

## Global Constraints

- **Prisma schema:** `ProfileCategory` already exists with `(profileId, categoryId, isPrimary)` fields; no schema changes needed.
- **Zod validation:** Extend `registroProfesionalSchema` in `src/schemas/index.ts` with `primaryCategoryId` (required) and `secondaryCategoryId` (optional, must differ from primary).
- **Prisma transaction:** `registrarProfesional` already creates `User` + `Profile` in a single transaction; add `ProfileCategory` records within the same transaction.
- **UI:** Must reuse `SelectorRubro` component from `FormularioPerfil.tsx` (same visual pattern, same `excluir` prop).
- **Validation flow:** Client-side Zod validation + server-side validation within Prisma transaction (same pattern as profile editing).
- **Matrícula:** Not required in registration (decision A1); matrícula validation happens later in `/panel/perfil`.
- **Subcategorías:** Not requested in registration; only rubros (primary + optional secondary).
- **Flujo post-alta:** Maintain existing redirection to `/panel/perfil` after successful registration.

## Review Focus

- **Primary rubro required:** Ensure `primaryCategoryId` is required and validated.
- **Secondary rubro optional:** Ensure `secondaryCategoryId` is optional and cannot equal primary.
- **Rubros must be active:** Validate that both selected rubros exist and are `isActive: true`.
- **Transaction safety:** Ensure rubro validation and creation happen within the same Prisma transaction as user/profile creation.
- **UI consistency:** Ensure `SelectorRubro` components look and behave identically to the profile form.

## Tasks

### Task 1: Extend the Zod schema for rubro selection

**Files:**
- Modify: `src/schemas/index.ts`

**Interfaces:**
- Consumes: `registroProfesionalSchema` schema
- Produces: Extended schema with `primaryCategoryId` and `secondaryCategoryId` fields

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-schema.test.ts`
  - Write tests:
    - `registroProfesionalSchema` should reject when `secondaryCategoryId` equals `primaryCategoryId`
    - `registroProfesionalSchema` should accept primary only (secondary undefined/empty)
    - `registroProfesionalSchema` should accept primary + secondary when secondary differs
    - `registroProfesionalSchema` should reject when `primaryCategoryId` is empty
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-schema.test.ts`
  - Expected: FAIL (schema doesn't accept these fields yet)
- [ ] **Step 3: Implement `registroProfesionalSchema` in `src/schemas/index.ts`**
  - Add `primaryCategoryId: z.string().min(1, 'Elegí tu rubro principal.')`
  - Add `secondaryCategoryId: z.string().optional().or(z.literal(''))`
  - Add superrefine: secondary must differ from primary
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-schema.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/schemas/index.ts tests/registro-schema.test.ts`
  - `git commit -m "feat: extend registroProfesionalSchema with primary and secondary rubro fields"`

---

### Task 2: Modify registrarProfesional to handle rubro validation and persistence

**Files:**
- Modify: `src/app/actions/registro.ts`

**Interfaces:**
- Consumes: `primaryCategoryId`, `secondaryCategoryId` from validated schema
- Produces: Validated and persisted ProfileCategory records in Prisma transaction

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro.test.ts`
  - Write tests for: creating 1 ProfileCategory with primary, creating 2 with primary+secondary, failing when secondary equals primary
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement rubro validation and persistence in `registrarProfesional`**
  - Add validation within Prisma transaction (pattern from `services/perfil.ts`)
  - Add `categories` creation in `profile.create`
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/app/actions/registro.ts tests/registro.test.ts`
  - `git commit -m "feat: extend registrarProfesional to handle primary and secondary rubros"`

---

### Task 3: Modify FormularioRegistro to display rubro selectors

**Files:**
- Modify: `src/components/registro/FormularioRegistro.tsx`
- Create: `src/components/catalogo/SelectorRubro.tsx` (shared component)

**Interfaces:**
- Consumes: `grupos: GrupoCatalogo[]` prop
- Produces: Two `SelectorRubro` components

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-form.test.ts`
  - Write test: renders two SelectorRubro components with catalog groups
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-form.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement shared `SelectorRubro` component**
  - Extract from `FormularioPerfil.tsx` (function declaration)
  - Move to `src/components/catalogo/SelectorRubro.tsx`
- [ ] **Step 4: Implement `FormularioRegistro` changes**
  - Accept `grupos` prop
  - Render two `SelectorRubro` components (primary required, secondary optional with `excluir`)
- [ ] **Step 5: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-form.test.ts`
  - Expected: PASS
- [ ] **Step 6: Commit**
  - `git add src/components/registro/FormularioRegistro.tsx src/components/catalogo/SelectorRubro.tsx`
  - `git commit -m "feat: add rubro selectors to registro form"`

---

### Task 4: Modify registro page to load and pass catalog

**Files:**
- Modify: `src/app/registro/page.tsx`

**Interfaces:**
- Consumes: `obtenerCatalogoPerfil()` from `src/services/catalogo.ts`
- Produces: `FormularioRegistro` with `grupos` prop

**Steps:**
- [ ] **Step 1: Write the failing test**
  - Create: `tests/registro-page.test.ts`
  - Write test: renders `FormularioRegistro` with catalog groups
- [ ] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run tests/registro-page.test.ts`
  - Expected: FAIL
- [ ] **Step 3: Implement page changes**
  - Load catalog with `obtenerCatalogoPerfil()`
  - Pass `grupos` to `FormularioRegistro`
- [ ] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run tests/registro-page.test.ts`
  - Expected: PASS
- [ ] **Step 5: Commit**
  - `git add src/app/registro/page.tsx`
  - `git commit -m "feat: update registro page to load and pass catalog"`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-19-registro-con-rubros.md`. Please review the plan. Which execution approach would you prefer?

- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Native**, because the tasks are sequential and each builds on the previous with clear interfaces, making it efficient to implement in a single session.

---

## Final Plan Status

The plan for sub-project 2 has been created and saved. The user requested to proceed with implementation via "hazlo" (do it). The execution approach recommended is **Native** (implementing in this session with final review).

The user asked to proceed, so we will now implement the plan tasks sequentially.

**Recommended approach:** Native (execute plan in this session, then do final review).
</plan-content>
