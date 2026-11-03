# Guía de limpieza de secretos del historial de Git

**ADVERTENCIA:** No ejecutes esta guía por tu cuenta sin haber rotado primero
todas las credenciales. Un secreto que estuvo en el repo se da por comprometido
inmediatamente: borrarlo del historial no lo descompromete.

## Orden obligatorio

### a) ROTAR PRIMERO todas las credenciales

Rotar (generar valores nuevos e invalidez los antiguos) en este orden:

| Secreto | Qué rotar | Dónde |
|---------|-----------|-------|
| Contraseña de la base de datos | Nueva contraseña de usuario de la base | Consola de Neon / Supabase / proveedor |
| `NEXTAUTH_SECRET` | Nuevo valor con `openssl rand -base64 32` | `.env`, Vercel |
| `MP_ACCESS_TOKEN` | Nuevo access token de Mercado Pago | Panel de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Nuevo secreto de webhook | Panel de Mercado Pago |
| `RESEND_API_KEY` | Nueva API key | Panel de Resend |
| `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Nuevas credenciales | Panel de Cloudinary |
| `WHATSAPP_ACCESS_TOKEN` | Nuevo token permanente | Meta for Developers |
| `WHATSAPP_APP_SECRET` | Nuevo app secret | Meta for Developers |
| `WHATSAPP_VERIFY_TOKEN` | Nuevo token de handshake | Meta for Developers |
| `UPSTASH_REDIS_REST_TOKEN` | Nuevo token | Consola de Upstash |
| `CRON_SECRET` | Nuevo valor aleatorio | `.env`, Vercel |
| `PHONE_HASH_PEPPER` | **NO se puede rotar sin migrar datos** (ver caso especial b) | — |

Después de rotar, actualizar los valores en:
- `.env` (local, nunca se commitea)
- Variables de entorno de Vercel (Production, Preview, Development por separado)

### b) Casos especiales: pepper y clave de cifrado

`PHONE_HASH_PEPPER` y la `DATA_ENCRYPTION_KEY` (punto 5 del módulo 6.1) no se
pueden rotar sin migrar los datos:

- **PHONE_HASH_PEPPER:** todos los `whatsappHash` y `cuitHash` de la base
  están atados a este valor. Si se filtró, hay que:
  1. Generar un pepper nuevo.
  2. Escribir un script de migración que rehashee todos los hashes existentes
     con el pepper nuevo.
  3. Ejecutar la migración antes de que el pepper antiguo deje de funcionar.

- **DATA_ENCRYPTION_KEY:** todos los campos cifrados (`whatsappE164`, CUIT,
  domicilio fiscal) están cifrados con esta clave. Si se filtró, hay que:
  1. Generar una nueva clave.
  2. Descifrar todos los valores con la clave antigua y volverlos a cifrar
     con la nueva.
  3. Rotar la versión de clave (el formato `v1:{keyId}:...` soporta rotación).

### c) Detectar secretos en TODO el historial

Instalar **gitleaks** o **trufflehog** y ejecutar sobre todas las ramas y tags:

```bash
# Gitleaks
gitleaks detect --source . --verbose --report-format json --report-path gitleaks-report.json

# O con historial completo (todas las ramas y tags)
gitleaks detect --source . --verbose --log-opts '--all'

# Trufflehog (detector de secretos)
trufflehog filesystem . --only-verified
```

Si se encuentra algo, anotar qué secreto, en qué commit y en qué archivo.

### d) Limpiar con git filter-repo

Instalar [git-filter-repo](https://github.com/newren/git-filter-repo).

Crear un archivo de reemplazos (`.git-filter-repo-replacements.txt`) con el
formato:

```
valor-antiguo==>valor-nuevo
```

Ejemplo:

```
sk_live_abc123==>ROTADO
MP_ACCESS_TOKEN_VALOR==>ROTADO
```

Ejecutar:

```bash
# Backup obligatorio antes de cualquier reescritura
git clone --mirror https://github.com/usuario/poliservicios-noa.git backup.git

# Reemplazar secretos conocidos
git filter-repo --replace-text .git-filter-repo-replacements.txt --force

# O borrar completamente un archivo del historial
git filter-repo --path .env --invert-paths --force
```

### e) Force push de todas las ramas y tags

```bash
git push --force --all
git push --force --tags
```

### f) Revisar y borrar forks, PRs y caches

- Borrar forks del repositorio (en GitHub, configuración del fork → Danger Zone → Delete this fork).
- Cerrar y borrar PRs abiertos que contengan los secretos.
- Pedir a GitHub que purgue vistas en caché si el repositorio fue público en algún momento:
  - GitHub: contactar a soporte o usar la herramienta de remisión de datos sensibles.
  - También revisar que no haya releases, packages o artifacts con los secretos.

### g) Todos los colaboradores vuelven a clonar

Nadie debe hacer `git pull` después de reescribir el historial. Todos deben:

```bash
# Borrar el clone local
cd .. && rm -rf poliservicios-noa

# Volver a clonar desde cero
git clone https://github.com/usuario/poliservicios-noa.git
```

### h) Prevención

1. **Secret scanning y push protection en GitHub:** Configuración del repositorio → Security → Code scanning y Secret scanning → Push protection.
2. **Hook pre-commit con gitleaks:** Agregar a `.pre-commit-config.yaml` o ejecutar `gitleaks protect --staged` en el hook pre-commit.
3. **Job de CI con gitleaks:** Agregar un paso en el pipeline de CI que ejecute `gitleaks detect` en cada push y pull request.
4. **`.env` en `.gitignore`:** Ya está configurado (ver `.gitignore` del proyecto).
5. **`.env.example` solo con nombres:** Ya está configurado, sin valores reales.

## Checklist de verificación

- [ ] Todos los secretos rotados antes de limpiar el historial
- [ ] Gitleaks / Trufflehog ejecutado sobre todas las ramas y tags
- [ ] Hallazgos documentados (qué secreto, qué commit, qué archivo)
- [ ] `git filter-repo` ejecutado con replacements o `--path` para borrar archivos
- [ ] Force push de `--all` y `--tags`
- [ ] Forks borrados, PRs cerrados y borrados
- [ ] GitHub caché purgada (si el repo fue público)
- [ ] Todos los colaboradores volvieron a clonar
- [ ] Secret scanning y push protection activados en GitHub
- [ ] Hook pre-commit con gitleaks configurado
- [ ] Job de CI con gitleaks configurado
