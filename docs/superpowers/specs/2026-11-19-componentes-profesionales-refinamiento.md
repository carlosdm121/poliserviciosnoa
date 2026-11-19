# Refinamiento de componentes — profesional, pulido, sin tocar hero/colores/estructura

**Fecha:** 2026-11-19
**Estado:** para implementar y ver en local antes de commit
**Alcance:** Solo `globals.css` + componentes que lo usan (`.btn`, `.tarjeta`, `.campo`, `.etiqueta`, `.chip-busqueda`, `.insignia-verificada`, `.grupo-card`, `ProfessionalCard`, `AccesosPorProvincia`, `BuscadorHome`, `HeroSlideshow` buscador). **NO toca:** hero (imágenes, textos, zoom, crossfade), layout de páginas, paleta, estructura HTML.

## Objetivo

Elevar la percepción de calidad de botones, inputs, cards, chips y badges a nivel "mejor página de internet" manteniendo:
- Colores exactos actuales (`ink #0A0A0A`, `paper #FFFFFF`, `noa-blue #0A84FF`, `whatsapp #25D366`)
- Hero sin cambios (zoom, crossfade, buscador, textos)
- Estructura de páginas y componentes (misma jerarquía, mismos props, mismo JSX)

## Principios visuales

| Componente | Estilo | Detalle |
|------------|--------|---------|
| **Botones** (`.btn`, `.btn-oscuro`, `.btn-linea`, `.btn-whatsapp`) | Elevado sutil (Opción 2) | `border-1.5` → `border-2` ink/30, `rounded-xl` (12px), `shadow-sm` → hover `shadow-md` + `translateY(-1px)`, active `translateY(1px) scale-[0.98]`. Transición 180ms cubic-bezier(0.2, 0.8, 0.2, 1). |
| **Cards** (`.tarjeta`, `ProfessionalCard`, `.grupo-card`) | Limpia con sombra (Opción 1) | `border-1` ink/15, `rounded-2xl` (16px), `shadow-sm` → hover `shadow-lg` + `translateY(-2px)`. Sin borde grueso 3px. |
| **Inputs** (`.campo`, `select`, `BuscadorHome`) | Refinado (Opción 3) | `border-1.5` ink/20, `rounded-xl` (12px), `bg-paper`. Focus: `ring-3` `ring-noa-blue/30` + `border-noa-blue`, sin outline. Placeholder `text-muted/60`. |
| **Chips/badges** (`.etiqueta`, `.chip-busqueda`, `.insignia-verificada`) | Pulidos | `border-1` ink/20, `rounded-full` (pill), `px-3 py-1.5`, `text-sm font-semibold`. Hover: `bg-ink/5` → `bg-ink/10`. `.chip-busqueda:hover`: `bg-ink` `text-paper`. |
| **Enlaces nav** (`.link-nav`) | Mantener subrayado animado | Ya está bien. Solo asegurar que no choque con nuevos redondeos. |

## Cambios en `globals.css` (resumen)

1. **Eliminar** `border-[3px] border-ink` de `.btn`, `.tarjeta`, `.campo`, `.etiqueta`, `.error`, `.exito`, `.progreso`.
2. **Añadir** redondeos (`rounded-xl`, `rounded-2xl`, `rounded-full`), bordes finos (`border-1.5` ink/20-30), sombras (`shadow-sm`, `shadow-md`, `shadow-lg`).
3. **Transiciones** unificadas: `transition-all duration-180 ease-out` (cubic-bezier suave).
4. **Focus visible** global: `ring-3 ring-noa-blue/30 ring-offset-2 ring-offset-paper`.
5. **Hero buscador** (`.hero-buscador`): mantener estructura, solo actualizar inputs/botón a nuevas clases `.campo` y `.btn-oscuro` (ya heredan lo nuevo).
6. **ProfessionalCard**: el contenedor `article` pasa de `tarjeta` (3px) a nueva card con sombra. Internos (badges, chips, botones) heredan lo nuevo.
7. **Grupo-card** (home rubros): `border-1` ink/15, `rounded-2xl`, `shadow-sm` → hover `shadow-lg` `translateY(-2px)` `border-noa-blue/40`.
8. **AccesosPorProvincia**: `border-1` ink/15, `rounded-2xl`, hover `bg-ink/5` `shadow-md` (sin `translateY` para que no salte el grid).

## Checklist de no-regresión (ver en local)

- [ ] Hero: zoom 1.0→1.04, crossfade 6s, textos, buscador **idénticos**.
- [ ] Home rubros: cards con sombra suave, hover eleva, chips pill redondeados.
- [ ] ProfessionalCard: card con sombra, badges pill, botones elevados, hint login abajo.
- [ ] Buscador home: inputs redondeados, botón elevado, focus ring azul.
- [ ] Accesos por provincia: cards redondeadas, hover sutil.
- [ ] Formulario registro/login: inputs + botones nuevos.
- [ ] Panel: hereda base sin cambios estructurales.
- [ ] `prefers-reduced-motion`: transiciones/sombras se desactivan (ya está en utilities).
- [ ] Tests: 479/479 pasan.

## Archivos a tocar

- `src/app/globals.css` (base completa)
- `src/components/profesionales/ProfessionalCard.tsx` (solo `className` del article y badges — **no** cambiar estructura/JSX)
- `src/app/page.tsx` (solo `className` de `.grupo-card` y `.chip-busqueda` — ya usan CSS classes, no Tailwind)
- `src/components/home/BuscadorHome.tsx` (usa `.campo` y `.btn-oscuro` — hereda automático)
- `src/components/home/BuscadorHome.tsx` `AccesosPorProvincia` (className del Link)

## Riesgo bajo

- Solo CSS + classNames puntuales. Sin lógica, sin Prisma, sin Server Actions.
- Si algo no gusta en local → revert `globals.css` y listo.