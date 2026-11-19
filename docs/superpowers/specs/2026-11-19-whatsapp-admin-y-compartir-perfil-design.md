# Diseño: Editar WhatsApp desde admin + Compartir perfil desde panel

Fecha: 2026-11-19

## Problema

1. El primer suscriptor cargó un número de WhatsApp incorrecto. WhatsApp no está
   configurado (el webhook no recibe mensajes), así que el suscriptor no puede
   re-verificar por su cuenta. Se necesita que el admin pueda editar el número
   directamente.

2. El panel no tiene botón para compartir la URL del perfil, ni muestra la URL
   completa de forma visible y copiable.

## Solución

### 1. Admin: editar número de WhatsApp

**Dónde:** `/admin/perfiles/[id]`, sección nueva junto a "Verificar WhatsApp a mano".

**Formulario (FormData, patrón existente):**
- `telefono` — número nuevo, con el actual precargado como `defaultValue`
- `verificar` — checkbox, por defecto marcado
- `motivo` — obligatorio, queda en AuditLog
- `ruta` — hidden, para el redirect

**Server action `adminEditarWhatsapp(datos: FormData)`:**
1. `exigirAdmin()`
2. Llama a `editarWhatsappManual()` en `services/admin.ts`
3. `refrescarPanel()` + `volver()` con `?ok=`/`?error=`

**Servicio `editarWhatsappManual(params)`:**
1. `normalizarWhatsapp(telefono)` → si inválido, error de validación
2. `motivo.trim()` vacío → error de validación
3. Buscar perfil; si no existe → `NO_ENCONTRADO`
4. Transacción:
   - `profile.update`: `whatsappE164 = encryptField(e164)`,
     `whatsappHash = verificar ? hashTelefono(e164) : null`,
     `whatsappVerifiedAt = verificar ? new Date() : null`
   - `auditLog.create`: acción `whatsapp.editar_numero`, antes/después con
     números enmascarados, motivo
5. Catch P2002 → error "número asociado a otra cuenta"
6. `sincronizarPublicacion(profileId)`
7. `ok(null)`

**Datos necesarios en la página:** el `whatsappE164` actual ya se muestra en el
detalle del perfil (`perfil.whatsappE164`), se usa como `defaultValue`.

### 2. Panel: URL visible + compartir

**Componente nuevo:** `src/components/panel/CompartirPerfil.tsx` (client).

Props: `{ url: string }`.

Render:
- Div con estilo "barra de direcciones": borde redondeado, icono 🔒 o 🌐,
  URL en `font-mono`, truncada si es larga
- Botón "Copiar" → `navigator.clipboard.writeText(url)`, muestra "¡Copiado!"
  por 2s
- Botón "Compartir" → si `navigator.share` existe, lo usa; si no, copia al
  clipboard

**En `/panel/page.tsx`:**
- Importar `env` de `@/lib/env`
- Calcular `urlPerfil = env.NEXTAUTH_URL.replace(/\/+$/, '') + '/p/' + slug`
- Mostrar `<CompartirPerfil url={urlPerfil} />` en el header, debajo del
  saludo, solo si `estado.perfil?.slug` existe
- Se muestra siempre que haya slug, sin importar el estado de publicación

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/services/admin.ts` | +`editarWhatsappManual` |
| `src/app/actions/admin.ts` | +`adminEditarWhatsapp` |
| `src/app/admin/perfiles/[id]/page.tsx` | +sección de edición WhatsApp |
| `src/components/panel/CompartirPerfil.tsx` | nuevo componente |
| `src/app/panel/page.tsx` | +URL y botón compartir en header |

## Testing

- Test unitario para `editarWhatsappManual`: número inválido, motivo vacío,
  número duplicado, caso happy path (mock de prisma).
- `tsc --noEmit` limpio.
- Tests existentes sin regresiones.
