# Verificación de email — diseño

Fecha: 2026-11-11
Estado: aprobado, pendiente de implementación

## Problema

El alta autoservicio (`src/app/actions/registro.ts`) crea el usuario con
`emailVerified: null` y manda un email cuyo enlace apunta a
`/api/auth/verify-email?token=...`. Esa ruta **no existe**: el proyecto usa
Auth.js con `CredentialsProvider` y `GoogleProvider`, y no tiene provider de
Email, así que Auth.js nunca generó ese endpoint.

Consecuencia: el link del email da 404, `emailVerified` nunca se completa, y
`evaluarPublicacion` (`src/services/publicacion.ts`, decisión D4) exige email
verificado como condición para publicar. Un profesional que se registra solo
completa el perfil, paga la suscripción y **nunca puede publicar**.

El alta por admin (`src/app/actions/admin/crear-perfil.ts:85`) no sufre esto:
crea el usuario con `emailVerified: new Date()`.

## Alcance

- Alta autoservicio: generar token, enviar email con enlace válido.
- Página pública que valida el token y marca el email como verificado.
- Página de reenvío con límite de intentos.
- Limpieza diaria de tokens vencidos.
- Tests de la lógica pura.

## Fuera de alcance

- No se cambia el login ni el modelo de autenticación.
- No se agrega magic link ni provider de Email de Auth.js.
- No se toca el flujo de Google OAuth (el adaptador ya copia `emailVerified`).
- No se implementa recuperación de contraseña (`src/lib/recovery-token.ts`
  queda como está, listo para otro módulo).
- No se verifica el email de las cuentas existentes: se marcan a mano si hace
  falta.

## Modelo de datos

Se reutiliza el modelo `VerificationToken` que ya existe en
`prisma/schema.prisma:355`:

```prisma
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Mapeo:

- `identifier` = email del usuario (normalizado a minúsculas, como
  `emailSchema`).
- `token` = SHA-256 en hex del token en claro. **Nunca se guarda el token en
  claro**, mismo criterio que `PasswordResetToken`.
- `expires` = ahora + 24 h.

**No hay cambio de schema.** Es deliberado: el proyecto no tiene
`prisma/migrations` (el schema se aplicó con `db push`) y no se quiere correr
`db push` contra producción.

## Archivos

| Archivo | Acción | Qué hace |
|---|---|---|
| `src/lib/verificacion-email.ts` | nuevo | `crearTokenVerificacion`, `validarTokenVerificacion`, `consumirTokenVerificacion`, `limpiarTokensVerificacion` |
| `src/lib/email.ts` | modificar | `enviarEmailVerificacion` arma el enlace a `/verificar-email?token=...` |
| `src/app/actions/registro.ts` | modificar | el alta genera token antes de enviar; `reenviarEmailVerificacion` se muda |
| `src/app/verificar-email/page.tsx` | nuevo | valida el token y muestra el resultado |
| `src/app/reenviar-verificacion/page.tsx` | nuevo | formulario de reenvío |
| `src/app/actions/verificacion-email.ts` | nuevo | `reenviarVerificacion(email)` con Zod y rate limit; reemplaza la de `registro.ts` |
| `src/server/jobs/limpieza.ts` | modificar | borra tokens vencidos |
| `tests/verificacion-email.test.ts` | nuevo | hash, expiración, armado de URL |

## Flujo

### 1. Alta

1. `registrarProfesional` crea `User` + `Profile` en una transacción
   (sin cambios).
2. Después del commit, `crearTokenVerificacion(user.id, user.email)`:
   - borra los tokens previos de ese email,
   - genera 32 bytes aleatorios en base64url,
   - guarda el SHA-256 con vencimiento a 24 h,
   - devuelve el token en claro.
3. `enviarEmailVerificacion({ email, nombre, url })` con
   `${env.NEXTAUTH_URL}/verificar-email?token=<token>`.
4. Si el envío falla, se mantiene el comportamiento actual: se borra el usuario
   y se devuelve error (rollback ya implementado).

### 2. Verificación

`GET /verificar-email?token=<token>` (Server Component):

1. Sin token → mensaje de enlace inválido.
2. `validarTokenVerificacion(token)`:
   - no existe el hash → inválido,
   - `expires < ahora` → vencido (y se borra),
   - usuario ya verificado → "ya estaba verificado", sin error.
3. Si es válido: `consumirTokenVerificacion(token)` en una transacción:
   - `User.emailVerified = now`,
   - `deleteMany` de los tokens de ese email.
4. Muestra "Email verificado" con enlace a `/panel`.

La verificación no requiere sesión: el enlace funciona en cualquier navegador.

Un consumidor de links (Outlook Safe Links, antivirus) puede abrir el enlace
antes que la persona. No es un problema: consumirlo verifica el email, que es
exactamente el objetivo.

### 3. Reenvío

La acción `reenviarEmailVerificacion` que hoy vive en
`src/app/actions/registro.ts:232` se muda a
`src/app/actions/verificacion-email.ts`. No queda duplicada.

`/reenviar-verificacion` con un campo email:

1. Zod valida el email.
2. Rate limit `verificacion:ip:<hash>` y `verificacion:email:<hash>`: 3 por hora.
3. Si el usuario existe y no está verificado: nuevo token + email.
4. Respuesta **siempre igual**: "Si el email está registrado, te mandamos un
   enlace". No se revela qué emails existen.

### 4. Limpieza

`jobLimpieza` suma `limpiarTokensVerificacion()`: borra los tokens con
`expires < ahora`. Se corre en el cron diario que ya existe
(`src/app/api/cron/daily/route.ts`).

## Seguridad

- **Token hasheado.** SHA-256 alcanza: 256 bits de entropía y el atacante no
  puede elegir el preimage.
- **Un solo uso.** Al consumirse se borran todos los tokens del email.
- **Vida corta.** 24 h.
- **No enumera cuentas.** El reenvío responde igual exista o no el email.
- **Rate limit.** 3 intentos por hora por IP y por email.
- **Sin datos en la URL más que el token.** El email no viaja en el query.
- **No se registra el token en logs.** El logger redacta igual, pero no se
  pasa.

## Errores y mensajes

| Caso | Mensaje |
|---|---|
| Link sin token | "El enlace está incompleto." |
| Token inexistente | "El enlace no es válido." |
| Token vencido | "El enlace venció. Pedí uno nuevo." + link a reenvío |
| Ya verificado | "Tu email ya estaba verificado." + link al panel |
| Reenvío exitoso o email inexistente | "Si el email está registrado, te mandamos un enlace." |
| Rate limit | "Probaste demasiadas veces. Esperá una hora." |

Todos los mensajes en español rioplatense, con voseo, como el resto del
proyecto.

## Tests

`tests/verificacion-email.test.ts`, lógica pura sin base:

- El hash del token es estable y distinto para tokens distintos.
- La URL se arma con `NEXTAUTH_URL` y el token codificado.
- Un token vencido se detecta por fecha.
- El token generado tiene la longitud esperada y no contiene caracteres
  problemáticos para una URL.

Los caminos con base (crear, consumir, borrar) se verifican con el script de
flujo si se agrega, o a mano contra producción con una cuenta de prueba.

## Criterios de aceptación

1. Un alta nueva recibe un email cuyo enlace abre una página real (no 404).
2. Al abrir el enlace, `User.emailVerified` queda con fecha y el perfil puede
   publicarse si cumple el resto de los requisitos.
3. Abrir el mismo enlace dos veces no rompe: la segunda dice "ya estaba
   verificado".
4. Un enlace vencido ofrece pedir uno nuevo.
5. `/reenviar-verificacion` manda un email nuevo y no revela si la cuenta
   existe.
6. El cron diario borra los tokens vencidos.
7. `npm run typecheck`, `npm run lint` y `npx vitest run` en verde.

## Riesgos

- **El email puede no salir.** Resend ya se usa en el resto del sistema; si
  falla, el alta hace rollback y el usuario ve un error. Es el comportamiento
  actual.
- **Usuarios ya registrados y sin verificar** no se verifican solos: no tienen
  token. Se resuelve pidiendo el reenvío desde la página nueva, o a mano desde
  el admin.
