# Rediseño visual — acabado senior, paleta del header

Fecha: 2026-11-19
Estado: aprobado por el usuario (dirección A — "Editorial pulido")

## Objetivo

Elevar el acabado visual de las 21 páginas públicas y las 11 del panel a nivel
"senior developer", manteniendo la identidad actual: tinta/papel, bordes
gruesos de 3px, sin redondeo, y `noa-blue` como único color de acento (el
mismo que usa el Header). El admin (18 páginas) queda fuera de alcance.

## Problemas detectados (auditoría previa)

1. Mezcla de dos sistemas: la sección de rubros usa CSS plano heredado
   (bordes 1px, `border-radius: 1rem`, sombras difusas, pills redondeadas,
   vars `--color-*`) que choca con el resto (borde `3px ink`, sin redondeo).
2. La card de profesional (`ProfessionalCard`) no tiene jerarquía: badges
   pesados, botón de corazones compitiendo con WhatsApp, hint de login
   interrumpiendo el flujo, tipografía inconsistente.
3. Efectos ausentes o genéricos: sin hover intencional, sin transiciones
   consistentes.

## Dirección de estilo (aprobada)

**"Editorial pulido"**: mismo DNA actual, acabado profesional.

- Paleta sin cambios: `ink #0A0A0A`, `paper #FFFFFF`, `noa-blue #0A84FF`
  (acento único), `noa-cyan #22D3EE` (solo hero), `noa-silver`, `noa-mist`,
  `whatsapp #25D366` (solo botón de contacto).
- Bordes gruesos, sin redondeo, sin sombras difusas (regla brutalista
  original de `globals.css`).
- Efectos sobrios: transiciones 150–200ms, elevación sutil + borde que se
  tiñe de azul en hover, botones que se hunden al `:active`, subrayado
  animado en nav, zoom lento en el hero.

## Cambios por parte

### 1. Base (`globals.css`, `tailwind.config.ts` si hace falta)

- Eliminar el uso de las CSS vars heredadas (`--color-bg`, `--color-border`,
  `--color-primary`, `--color-chip-*`, `--color-text`) en las secciones de la
  home. Antes de borrar las vars del `:root`, se grepea su uso en todo
  `src/`; si otras páginas las usan, se reemplazan también o se dejan
  intactas y solo se cambia el estilo de la home.
- Componentes globales existentes (`.btn`, `.tarjeta`, `.etiqueta`,
  `.btn-linea`, `.btn-oscuro`, `.btn-whatsapp`) se conservan; se les agregan
  transiciones consistentes donde falten.
- Subrayado animado para links de navegación (crece desde la izquierda,
  150ms).

### 2. Sección de rubros ("¿Qué estás buscando?")

- `.grupo-card`: pasar de card suave (1px, redondeo 1rem, sombra) a borde
  `3px ink`, sin redondeo, sin sombra. Hover: borde `noa-blue` +
  `translateY(-2px)`, 150ms.
- `.chip-busqueda`: pasar de pill redondo a estilo `.etiqueta` (borde 2px
  ink, uppercase, cuadrado), con `.conteo` integrado. Hover: fondo ink,
  texto paper.
- `.grupo-accent-bar`: se conserva (barrita azul `noa-blue`), cuadrada.
- `.grupos-grid`: se conserva el grid responsive.
- El título mantiene el gradiente `from-noa-blue to-noa-cyan` (es un buen
  acento y coincide con el hero).

### 3. Sección "Accesos por provincia"

- Solo utilities actuales (`border-[3px] border-ink`,
  `hover:bg-ink hover:text-paper`). Se agrega transición 150ms y elevación
  sutil en hover para que no se sienta estático.

### 4. Sección "¿Ofrecés un servicio?"

- Se mantiene el bloque ink con texto paper (es el contraste fuerte de la
  página). Se agregan transiciones a los `.btn` (hover 150ms) y consistencia
  de gap. Sin cambios estructurales.

### 5. Hero (`HeroSlideshow`)

- Se conserva el crossfade de 6s.
- Se agrega zoom lento en la imagen activa (`scale 1.0 → 1.04`, duración de
  la transición del slide), respetando el guard global
  `prefers-reduced-motion` ya existente.
- El texto (etiqueta cian + título) no cambia: ya es coherente con la
  paleta.
- `.hero-buscador` (contenedor del buscador sobre el hero): hoy usa CSS
  plano (borde 1px, redondeo 1rem, vars `--color-border`). Se unifica:
  borde `3px ink`, sin redondeo, sombra mínima o ninguna. Los inputs y el
  botón submit (hoy azul `--color-primary` redondeado) pasan a `.campo` y
  `.btn-oscuro` para que el buscador del hero sea idéntico al de la página
  `/buscar`.

### 6. Card de profesional (`ProfessionalCard`) — cambio principal

Problemas de la captura actual: sin jerarquía, hint de login en el medio,
botón de corazones con borde compitiendo con WhatsApp, badges pesados.

Nuevo diseño:

- **Estructura**: `.tarjeta` (borde 3px ink). Hover de la card: borde se
  tiñe `noa-blue` + elevación sutil, 150ms.
- **Imagen**: mantiene `aspect-[4/3]` + borde inferior. Placeholder de
  inicial mejorado: fondo ink, `font-display` grande, inicial en paper.
- **Badges**: fila compacta con `.etiqueta`; "WhatsApp verificado" con ícono
  de check (lucide-react). Se elimina el peso visual del borde negro actual.
- **Nombre**: `font-display` uppercase, jerarquía máxima (lo más grande de
  la card).
- **Rubros**: chips `.etiqueta` (primario + secundario) debajo del nombre.
- **Ubicación**: ícono `MapPin` + texto muted chico.
- **Cobertura/bio**: texto chico consistente, bio con `line-clamp-2`.
- **Acciones**:
  - Corazones: línea sutil con ícono (no botón con borde de 3px).
  - WhatsApp (verde) y "Ver perfil" (`.btn-linea`) apilados, ancho completo,
    gap consistente.
  - Hint "Ingresá antes de contactar…": texto muted chico **debajo** de los
    botones, no en el medio.
- **Transiciones**: 150ms, sin rebotes.

### 7. Header

- Ya es la referencia de estilo: no se cambia salvo si aparece alguna
  inconsistencia con las transiciones nuevas (subrayado animado de nav).

### 8. Panel (11 páginas)

- Aplicar la misma base (transiciones, foco, consistencia de componentes)
  vía `globals.css` y `PanelNavbar`. No se rediseñan flujos, solo acabado.

## Alcance explícito

- **Dentro**: 21 páginas públicas, 11 páginas de panel, componentes
  compartidos (`Header`, `ProfessionalCard`, componentes de home).
- **Fuera**: 18 páginas de admin, modelo de datos, lógica de negocio,
  formulario de registro multi-profesión (sub-proyecto aparte, aprobado para
  después).

## Error handling y testing

- Nada de lógica nueva: cambios de estilo puros + un par de clases.
- Verificación: `npm run test` (478 tests), `tsc`, lint.
- Verificación visual en dev server: home (todas las secciones), una página
  de búsqueda con cards, una provincia, login/registro, panel.
- Chequear `prefers-reduced-motion` (zoom hero y transiciones).

## Criterios de éxito

1. La home se lee como una sola pieza: mismo borde, misma tipografía, mismo
   acento azul en todas las secciones.
2. La card de profesional tiene jerarquía clara: nombre > acciones > meta.
3. Ninguna página pública muestra las CSS vars heredadas (`--color-bg`,
   pills redondeadas, sombras).
4. Todos los tests pasan.
