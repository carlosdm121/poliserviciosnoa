# Rediseño Visual NoA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el estilo de las 21 páginas públicas + 11 de panel bajo la dirección "Editorial pulido" (borde 3px ink, acento `noa-blue`, sin redondeo ni sombras), rediseñar la `ProfessionalCard` con jerarquía clara y añadir efectos sobrios (hover 150ms, zoom hero).

**Architecture:** Cambios de estilo puros en CSS de capa `components` + utilities Tailwind en JSX. Sin lógica nueva, sin dependencias nuevas. Los componentes compartidos (`ProfessionalCard`, `HeroSlideshow`, `BuscadorHome`) propagan los estilos a varias páginas de una.

**Tech Stack:** Tailwind CSS 3.4, CSS puro en `globals.css` (`@layer components` + reglas planas), lucide-react (ya instalado).

**Spec:** `docs/superpowers/specs/2026-11-19-rediseño-visual-noa-design.md`

## Global Constraints

- Paleta fija: `ink #0A0A0A`, `paper #FFFFFF`, `noa-blue #0A84FF` (único acento), `noa-cyan #22D3EE` (solo hero), `whatsapp #25D366` (solo botón de contacto).
- Sin `border-radius`, sin `box-shadow` difusas, bordes de 3px (2px en `.etiqueta`).
- Transiciones 150–200ms; todo respeta el guard global `prefers-reduced-motion` de `globals.css:522-530`.
- No tocar: `src/app/admin/**`, lógica de negocio, schema Prisma, formulario de registro (sub-proyecto aparte).
- Comandos de verificación: `npm run test` (478 tests), `npm run typecheck`, `npm run lint`.
- Cada tarea termina con commit.

## Review Focus

- **CSS vars heredadas huérfanas**: tras reemplazar `.grupo-card`/`.chip-busqueda`/`.hero-buscador`, puede quedar algún `var(--color-*)` sin uso o, peor, algún estilo roto. Test: grep de `--color-` al final debe devolver solo las definiciones del `:root` y los usos legítimos que se decidan conservar (`.hero-texto .text-noa-cyan`, `.banner-*`).
- **Regresiones visuales en páginas que reutilizan `ProfessionalCard`** (home, `/buscar`, provincias): la card es un componente compartido; un cambio de clases puede romper el layout en grid. Verificación: visual en home + `/buscar` + una provincia.
- **Contraste/texto ilegible**: hover que invierte colores (chip → fondo ink) debe mantener texto legible. Verificación visual + revisar que `.chip-busqueda:hover` use `color: paper`.
- **Zoom del hero con `prefers-reduced-motion`**: el zoom debe desactivarse con el guard existente. Verificación: clase/animación bajo `@media (prefers-reduced-motion: reduce)`.
- **Tests existentes que parsean HTML de la card**: si algún test busca clases o textos exactos de `ProfessionalCard`, puede romperse. Verificación: `npm run test` tras Task 4.

---

### Task 1: Unificación de la sección de rubros (`globals.css`)

**Files:**
- Modify: `src/app/globals.css:176-285` (reglas planas `.seccion-busqueda .grupo-*` / `.chip-busqueda`)

**Interfaces:**
- Consume: tokens Tailwind existentes (`ink`, `paper`, `noa-blue`) vía `@apply`.
- Produce: `.grupo-card`, `.chip-busqueda`, `.grupo-accent-bar` redefinidos — las demás tareas no los tocan.

- [ ] **Step 1: Reescribir `.grupo-card`**

En `globals.css`, dentro del bloque `.seccion-busqueda .grupo-card` (línea ~200), reemplazar el estilo actual (borde 1px, `border-radius: 1rem`, `box-shadow`) por:

```css
.seccion-busqueda .grupo-card {
  background: var(--color-paper, #fff);
  border: 3px solid #0a0a0a;
  padding: 1.25rem 1.25rem 1rem;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.seccion-busqueda .grupo-card:hover {
  border-color: #0a84ff;
  transform: translateY(-2px);
}
```

(Se puede usar `@apply border-[3px] border-ink bg-paper` si se prefiere consistencia con el resto del archivo; decidir según el estilo del archivo — el resto de `@layer components` usa `@apply`, las reglas planas de esta sección usan CSS crudo. Mantener CSS crudo en estas reglas planas para no moverlas de capa.)

- [ ] **Step 2: Reescribir `.chip-busqueda`**

Reemplazar pill redondo por estilo cuadrado borde 2px:

```css
.seccion-busqueda .chip-busqueda {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  background: #fff;
  border: 2px solid #0a0a0a;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #0a0a0a;
  text-decoration: none;
  min-height: 44px;
  min-width: 80px;
  transition: background 0.15s ease, color 0.15s ease;
}

.seccion-busqueda .chip-busqueda:hover,
.seccion-busqueda .chip-busqueda:focus-visible {
  background: #0a0a0a;
  color: #fff;
  outline: none;
}
```

Eliminar `transform: translateY(-2px)` y `box-shadow` del hover actual. Mantener `.conteo` (opacidad) y el guard `prefers-reduced-motion` de la línea ~281.

- [ ] **Step 3: `.grupo-accent-bar` y `.grupo-titulo-texto`**

`.grupo-accent-bar`: quitar `border-radius: 2px` (mantener `background: var(--color-primary)` o cambiar a `#0a84ff` literal — mismo valor). `.grupo-titulo-texto`: sin cambios (ya usa `var(--color-text)` = `#0B1220`… cambiar a `#0a0a0a` para igualar ink).

- [ ] **Step 4: Verificar que no queden usos rotos**

Run: `rg "--color-(bg|border|chip)" src/`
Expected: solo definiciones en `:root` (líneas 24-28) y `.hero-buscador` (que se toca en Task 2). Los usos en `.grupo-*` ya no aparecen.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev` → abrir `http://localhost:3000`, sección "¿Qué estás buscando?".
Expected: cards cuadradas borde 3px negro, chips cuadrados, hover azul/elevación. Sin pills redondeadas.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "style: unifica seccion de rubros a borde 3px ink sin redondeo"
```

---

### Task 2: Buscador del hero + transiciones base (`globals.css`, `Header.tsx`)

**Files:**
- Modify: `src/app/globals.css:374-462` (`.hero-buscador`)
- Modify: `src/components/layout/Header.tsx` (solo si hace falta el subrayado animado)

**Interfaces:**
- Consume: `.campo` (globals.css:108) y `.btn-oscuro` (globals.css:79) ya existentes.
- Produce: `.hero-buscador` contenedor único; nav con subrayado animado.

- [ ] **Step 1: Reescribir `.hero-buscador`**

Reemplazar reglas `.hero-buscador` (contenedor, inputs, button submit — líneas 374-462) por un contenedor cuadrado y quitar los estilos propios de inputs/button (que ahora los aportan `.campo` y `.btn-oscuro` aplicados en JSX):

```css
.hero-buscador {
  background: #fff;
  border: 3px solid #0a0a0a;
  padding: clamp(0.625rem, 2vw, 1rem);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

@media (min-width: 768px) {
  .hero-buscador {
    flex-direction: row;
    align-items: stretch;
    gap: 0.5rem;
    max-width: 900px;
  }
}
```

Eliminar: `.hero-buscador input/select` (bordes, radius 10px, focus azul), `.hero-buscador button[type="submit"]` (fondo azul, radius, hover). Mantener `.hero-confianza` si se usa (grep en `src/`: si nadie lo usa, borrarlo).

- [ ] **Step 2: Aplicar `.campo` y `.btn-oscuro` en el JSX del buscador**

En `src/components/home/BuscadorHome.tsx`: el `<input>` ya usa `campo text-lg` ✓. El `<select>` y el `<button type="submit">` deben usar `campo` y `btn-oscuro` respectivamente (verificar clases actuales y reemplazar las que tengan estilos propios).

- [ ] **Step 3: Subrayado animado en nav del Header**

En `globals.css` `@layer components`, agregar:

```css
.link-nav {
  position: relative;
}
.link-nav::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -4px;
  width: 0;
  height: 2px;
  background: #0a84ff;
  transition: width 0.15s ease;
}
.link-nav:hover::after,
.link-nav:focus-visible::after {
  width: 100%;
}
```

En `Header.tsx`, los 4 links del nav desktop (líneas ~133-176): agregar `link-nav` a las clases y **quitar** el `border-b-2 border-transparent` / estados `border-noa-blue` actuales (el activo se marca con `text-noa-blue` que ya existe). Opcional: mismo tratamiento al menú móvil.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev` → home. Focus en el buscador del hero: inputs con borde 3px ink cuadrado, botón "Buscar" estilo `.btn-oscuro` (negro, se hunde al clic). Hover en nav: subrayado azul crece.

- [ ] **Step 5: Verificación automatizada**

Run: `npm run test && npm run typecheck`
Expected: PASS (478 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/home/BuscadorHome.tsx src/components/layout/Header.tsx
git commit -m "style: buscador del hero con campo/btn-oscuro y subrayado animado en nav"
```

---

### Task 3: Zoom lento del hero (`HeroSlideshow.tsx`, `globals.css`)

**Files:**
- Modify: `src/app/globals.css` (agregar keyframes + guard)
- Modify: `src/components/home/HeroSlideshow.tsx:80-92` (clases de imagen activa)

**Interfaces:**
- Consume: guard global `prefers-reduced-motion` (globals.css:522).
- Produce: clase `.hero-zoom` aplicable a la imagen activa.

- [ ] **Step 1: Agregar keyframes y clase en `globals.css`**

```css
@keyframes hero-zoom {
  from { transform: scale(1); }
  to { transform: scale(1.04); }
}

.hero-zoom {
  animation: hero-zoom 6s ease-out forwards;
}
```

En el guard `prefers-reduced-motion` global ya existe `animation-duration: 0.01ms !important` para `*` — eso desactiva el zoom automáticamente. No hace falta guard extra.

- [ ] **Step 2: Aplicar en `HeroSlideshow.tsx`**

En el map de imágenes (línea ~87-91), la imagen activa (`i === activo`) suma `hero-zoom`:

```tsx
i === activo
  ? 'opacity-100 z-10 hero-zoom'
  : 'opacity-0 z-0 pointer-events-none',
```

- [ ] **Step 3: Verificación visual**

Run: `npm run dev` → home. Expected: la foto activa del hero hace zoom lento de 6s; al cambiar de slide, reinicia. Con DevTools → emulate `prefers-reduced-motion: reduce`, el zoom no se ve.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/home/HeroSlideshow.tsx
git commit -m "style: zoom lento en el hero con respeto a prefers-reduced-motion"
```

---

### Task 4: Rediseño de `ProfessionalCard`

**Files:**
- Modify: `src/components/profesionales/ProfessionalCard.tsx:87-203`
- Modify: `src/app/globals.css` (solo si hace falta una clase auxiliar, p. ej. `.insignia-check`)

**Interfaces:**
- Consume: `.tarjeta`, `.etiqueta`, `.insignia-verificada`, `.btn-whatsapp`, `.btn-linea` (existentes), lucide-react `MapPin` (ya importado) + `Check`, `Heart` (agregar imports).
- Produce: misma interfaz `ProfessionalCard({ profile, logueado, voto })` — sin cambios de props (la usan home, buscar, provincias).

- [ ] **Step 1: Verificar qué tests tocan la card**

Run: `rg -l "ProfessionalCard|WhatsApp verificado|Ver perfil" tests/`
Expected: lista de archivos. Si algún test busca textos/estructura, correr `npm run test` después y arreglar solo si rompe (los textos clave se conservan: "WhatsApp verificado", "Ver perfil", "WhatsApp").

- [ ] **Step 2: Reestructurar el JSX de la card**

Estructura objetivo (misma data, nueva presentación):

```tsx
<article className="tarjeta group flex h-full flex-col transition-colors duration-150 hover:border-noa-blue">
  {/* Imagen: igual que hoy (aspect-[4/3], borde inferior, placeholder inicial) */}

  <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
    {/* Badges: fila compacta, .etiqueta, check en verificado */}
    <div className="flex flex-wrap items-center gap-2">
      <span className="insignia-verificada">
        <Check className="h-3 w-3" aria-hidden="true" />
        WhatsApp verificado
      </span>
      {/* empresa verificada / matrícula igual, solo .etiqueta */}
    </div>

    {/* Nombre: font-display uppercase (jerarquía máxima) */}
    <h3 className="font-display text-[1.75rem] uppercase leading-[0.95] tracking-tight">
      {nombre}
    </h3>

    {/* Chips de rubros */}
    <div className="flex flex-wrap gap-2">
      <span className="etiqueta">{profile.primaryCategory}</span>
      {profile.secondaryCategory && <span className="etiqueta">{profile.secondaryCategory}</span>}
    </div>

    {/* Ubicación + cobertura: text-sm/xs, muted */}
    {/* Bio line-clamp-2 si existe */}

    {/* Corazones: línea sutil, sin borde */}
    <div className="mt-auto flex items-center gap-2 border-t-2 border-ink/10 pt-3">
      <BotonCorazon … />  {/* verificar que BotonCorazon no tenga borde grueso propio;
                              si lo tiene, pasarle o aplicar clase que lo aplane */}
    </div>

    {/* Acciones apiladas */}
    <div className="space-y-2">
      <a className="btn-whatsapp w-full">WhatsApp</a>
      <Link className="btn-linea w-full">Ver perfil</Link>
    </div>

    {/* Hint login: texto muted chico DEBAJO */}
    {!logueado && (
      <p className="text-xs leading-tight text-muted">
        Ingresá antes de contactar para poder valorar a este profesional después
      </p>
    )}
  </div>
</article>
```

Cambios clave respecto al actual: nombre ya no va en bloque separado con logo al lado en el mismo nivel de jerarquía (logo si existe, chico, junto al nombre o arriba); badges con check; hint debajo de botones; corazones como línea con borde superior sutil.

- [ ] **Step 3: Ajustar `.insignia-verificada` si hace falta**

Si el `<Check>` no entra bien, agregar `gap-1` (ya tiene `gap-1` en `.etiqueta`). Verificar que `.insignia-verificada` herede `@apply etiqueta border-ink bg-paper text-ink` — sin cambios salvo que el ícono lo requiera.

- [ ] **Step 4: Tests + typecheck**

Run: `npm run test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev` → home (sección "Los mejor valorados") + `/buscar` + `/{slug}` de provincia.
Expected: card con jerarquía clara; hover tiñe borde azul; hint debajo de los botones; verde solo en WhatsApp.

- [ ] **Step 6: Commit**

```bash
git add src/components/profesionales/ProfessionalCard.tsx src/app/globals.css
git commit -m "style: rediseño de ProfessionalCard con jerarquia y hover noa-blue"
```

---

### Task 5: Pulido de secciones restantes de la home (`BuscadorHome.tsx`, `page.tsx`)

**Files:**
- Modify: `src/components/home/BuscadorHome.tsx` (`AccesosPorProvincia`)
- Modify: `src/app/page.tsx:223-239` (sección CTA)

**Interfaces:**
- Consume: `.btn` existente.
- Produce: mismas estructuras, solo clases añadidas.

- [ ] **Step 1: Transición y hover en accesos por provincia**

En `AccesosPorProvincia`, los links `border-[3px] border-ink hover:bg-ink hover:text-paper`: agregar `transition-colors duration-150` si no lo tienen.

- [ ] **Step 2: CTA "¿Ofrecés un servicio?"**

Los dos `.btn` del bloque (page.tsx:231-236): verificar que `.btn` ya tenga `transition-transform` (la tiene) — agregar `duration-150` si falta. Sin cambios estructurales.

- [ ] **Step 3: Verificación visual de la home completa**

Run: `npm run dev` → home, scrollear completa.
Expected: todas las secciones con el mismo sistema (3px ink, acento azul, sin redondeo/sombra). Sin CSS vars huérfanas visibles (backgrounds `#F4F7FB` grises de la vieja card de rubros ya no aparecen).

- [ ] **Step 4: Commit**

```bash
git add src/components/home/BuscadorHome.tsx src/app/page.tsx
git commit -m "style: pulido de provincias y CTA con transiciones consistentes"
```

---

### Task 6: Verificación final + deploy

**Files:**
- Ninguno (solo verificación), salvo arreglos mínimos que surjan.

- [ ] **Step 1: Suite completa**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: PASS (478 tests, 0 errores TS, 0 lint).

- [ ] **Step 2: Grep de vars heredadas**

Run: `rg "var\\(--color-(bg|border|chip)" src/`
Expected: 0 coincidencias fuera de `:root` (o0 en total si se borraron las defs sin uso — decidir: borrar del `:root` las que quedaron sin uso: `--color-bg`, `--color-border`, `--color-chip-*` si nadie las referencia).

- [ ] **Step 3: Smoke test visual en dev de páginas clave**

Home, `/buscar`, una provincia, `/login`, `/panel`, `/publica-tu-servicio`.
Expected: sin layouts rotos, sin texto ilegible.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "style: verificacion final del rediseño editorial pulido"
git push
```

Esperar deploy Vercel READY y verificar en producción `https://poliserviciosnoa.com`.
