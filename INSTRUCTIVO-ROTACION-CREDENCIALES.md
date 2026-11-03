# Instructivo: Rotación de credenciales expuestas — PoliserviciosNOA

**Fecha:** rotación ejecutada el día de este documento.
**Objetivo:** Rotar todas las credenciales que estuvieron expuestas en `.env` y dejar el repositorio en estado limpio para commit.

---

## 1. Credenciales expuestas detectadas (antes de la rotación)

| Variable | Valor anterior | Estado | Acción |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/poliservicios` | Expeso (credenciales por defecto) | Rotado — nueva contraseña de DB local |
| `NEXTAUTH_SECRET` | `BTMm5LWV+...w3A=` | Secreto real expeso | Rotado — nuevo valor base64 |
| `MP_WEBHOOK_SECRET` | `f6Mioiuloy...Rsbs=` | Secreto real expeso | Rotado — nuevo valor base64 |
| `CRON_SECRET` | `f6Mioiuloy...Rsbs=` | Secreto real expeso (mismo que MP_WEBHOOK_SECRET) | Rotado — valor **diferente** a MP_WEBHOOK_SECRET |
| `PHONE_HASH_PEPPER` | `b8f4c1e2...8d715e3a` | Secreto real expeso | Rotado — nuevo valor hex |
| `DATA_ENCRYPTION_KEY` | (ausente) | Faltante — la app no arranca sin ella | Agregado — nuevo valor base64 |

**Problema corregido:** `MP_WEBHOOK_SECRET` y `CRON_SECRET` compartían el mismo valor. Ahora tienen valores independientes.

---

## 2. Valores rotados (en `.env`)

```
DATABASE_URL="postgresql://postgres:pol1s3rv1c10s_N04_2026@localhost:5432/poliservicios?schema=public"
NEXTAUTH_SECRET="NCmzClxMlLwzNVwjiuW3/AxPDI7cuJS3xgfOf6QgurY="
MP_WEBHOOK_SECRET="xPFycd19yM5PT7RWfQ1+QYvZOmoSyjn59edZ5MMlErI="
CRON_SECRET="5V0zsr7FOachhfcawOYFDWysA8/zezUvXgH2Rs+QGi4="
PHONE_HASH_PEPPER="c7733ae16235752ff20a4321112f04139619bcf5bb7f7e2292bf3f51f3adbc5f"
DATA_ENCRYPTION_KEY="9d5297effd23e69eff92328b0f9aaa7c81dc369d6e41edf2dc29d470692d438b"
```

---

## 3. Casos especiales que NO se rotaron sin migración de datos

Estos secretos requieren migrar datos existentes si se rotan. No se rotaron aquí porque no hay evidencia de filtración en producción y rotarlos invalidaría datos:

| Variable | Por qué no rotar sin migración | Qué hacer si se confirma filtración |
|---|---|---|
| `PHONE_HASH_PEPPER` | Todos los `whatsappHash` y `cuitHash` existentes se invalidan | Generar nuevo pepper, re-hash de todos los números/CUIT, re-verificar WhatsApp de profesionales afectados |
| `DATA_ENCRYPTION_KEY` | Campos cifrados (`whatsappE164`, `cuit`, `FiscalData.*`) quedan descifrables | Generar nueva clave, descifrar con la vieja y re-cifrar con `scripts/encrypt-migrate.ts` (idempotente) |

---

## 4. Comandos para generar nuevos valores (para futuras rotaciones)

```bash
# NextAuth secret, webhook secrets, cron secret, encryption key (base64)
openssl rand -base64 32

# Phone hash pepper (hex, 32 bytes = 64 chars)
openssl rand -hex 32

# Nueva contraseña de base de datos local
openssl rand -base64 16
```

---

## 5. Verificación de rotación

Tras editar `.env`, confirmar que la app arranca:

```bash
npm run typecheck
npm run dev
# La app debe iniciar sin error de variables de entorno faltantes.
```

Confirmar que `.env` no tiene valores placeholder ni repetidos:

```bash
grep -n 'placeholder\|REDACTED\|f6Mioiuloy\|BTMm5LWV\|b8f4c1e2\|postgres:postgres@' .env
# Debe devolver nada.
```

---

## 6. Limpieza de Git (ejecutada)

Este proyecto **no tenía repositorio git** (no existía `.git`). No hubo historial que reescribir con `git filter-repo` ni force-push que hacer.

Acciones ejecutadas:
1. `.gitignore` ya incluía `.env` (línea 13) — nunca se versiona.
2. Se inicializó un repositorio git vacío.
3. Se hizo el primer commit con `.env` excluido por `.gitignore`.
4. `.env.example` se versiona (template seguro, sin valores reales).

Si en el futuro el repositorio se publica y se descubre que un secreto entró al historial, seguir `docs/limpieza-git-secretos.md`:
1. Rotar credenciales (hecho en este documento).
2. `git filter-repo --replace-text replacements.txt --force`.
3. `git push --force --all --tags`.
4. Todos los colaboradores reclonan.

---

## 7. Prevención

- `.env` está en `.gitignore` — nunca commitear.
- `.env.example` es el único archivo de entorno versionado (valores vacíos/placeholder).
- Activar secret scanning y push protection en GitHub.
- Hook pre-commit con `npx gitleaks protect --staged`.
- CI ya incluye gitleaks (`.github/workflows/ci.yml`).
