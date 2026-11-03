# Guía de eliminación de secretos del historial de Git (punto 2 del módulo 6.1)

**No ejecutar automáticamente.** Es un procedimiento manual que requiere rotación previa de credenciales.

## Orden obligatorio

### a) Rotar PRIMERO todas las credenciales expuestas
Reescribir el historial NO alcanza: un secreto filtrado se da por comprometido. Rotar antes de limpiar:

- Contraseña de la base de datos (`DATABASE_URL`)
- `AUTH_SECRET` / `NEXTAUTH_SECRET`
- Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`)
- Resend (`RESEND_API_KEY`)
- Cloudinary (`CLOUDINARY_API_SECRET`, `CLOUDINARY_API_KEY`)
- Token y app secret de Meta/WhatsApp (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`)
- Upstash (`UPSTASH_REDIS_REST_TOKEN`)
- `CRON_SECRET`

### b) Casos especiales: no rotables sin migración de datos
`PHONE_HASH_PEPPER` y `DATA_ENCRYPTION_KEY` no se pueden rotar sin migrar los datos:

- **PHONE_HASH_PEPPER**: si se filtró, todos los `whatsappHash` y `cuitHash` existentes se invalidan. Plan: generar nuevo pepper, re-hash de todos los números y CUIT existentes, volver a verificar WhatsApp de los profesionales afectados.
- **DATA_ENCRYPTION_KEY**: si se filtró, todos los campos cifrados (`whatsappE164`, `cuit`, `FiscalData.documento`, `FiscalData.domicilioFiscal`) son descifrables por el atacante. Plan: generar nueva clave, descifrar con la clave vieja y re-cifrar con la nueva usando `scripts/encrypt-migrate.ts` (idempotente).

### c) Detectar secretos en TODO el historial
Ejecutar sobre todas las ramas y tags:

```bash
# Con gitleaks (recomendado)
gitleaks detect --source . --report-path gitleaks-report.json --report-format json --branches=all --tags

# O con trufflehog
trufflehog filesystem . --only-verified --fail
```

### d) Limpiar con git filter-repo (o BFG)
Usar un archivo de reemplazos para borrar los secretos del historial:

```bash
# Crear archivo de reemplazos (formato: expresiones regulares o strings)
cat > replacements.txt <<'EOF'
MP_ACCESS_TOKEN=REDACTED
RESEND_API_KEY=REDACTED
CLOUDINARY_API_SECRET=REDACTED
WHATSAPP_ACCESS_TOKEN=REDACTED
WHATSAPP_APP_SECRET=REDACTED
UPSTASH_REDIS_REST_TOKEN=REDACTED
PHONE_HASH_PEPPER=REDACTED
CRON_SECRET=REDACTED
NEXTAUTH_SECRET=REDACTED
DATABASE_URL=REDACTED
EOF

# Ejecutar git filter-repo
git filter-repo --replace-text replacements.txt --force
```

Si se prefiere BFG:

```bash
bfg --delete-files .env --replace-text replacements.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### e) Force push de todas las ramas y tags
```bash
git push --force --all
git push --force --tags
```

### f) Revisar y borrar forks, PRs y caches
- Borrar forks del repositorio si existen y contienen los secretos.
- Cerrar y borrar PRs abiertos que hagan referencia a commits con secretos.
- Pedir a GitHub que purge vistas en caché si el repositorio fue público:
  https://docs.github.com/es/repositories/managing-your-repositorys-settings-and-features/enabling-security-features-for-your-repository/about-secret-scanning

### g) Todos los colaboradores vuelven a clonar
Nadie debe hacer `pull` tras el force push. Deben hacer un `clone` fresco.

### h) Prevención
- Activar **secret scanning** y **push protection** en GitHub (Configuración del repositorio → Seguridad y análisis de código).
- Hook pre-commit con gitleaks:
  ```bash
  # .husky/pre-commit o similar
  npx gitleaks protect --staged
  ```
- Job de CI con gitleaks (ya incluido en `.github/workflows/ci.yml`).

## Verificación posterior
Tras la limpieza, confirmar que ningún secreto aparece en el historial:

```bash
git log --all -p | grep -iE 'MP_ACCESS_TOKEN|RESEND_API_KEY|CLOUDINARY_API_SECRET|WHATSAPP_ACCESS_TOKEN|PHONE_HASH_PEPPER|CRON_SECRET|NEXTAUTH_SECRET|DATABASE_URL'
```

El comando no debe devolver resultados.
