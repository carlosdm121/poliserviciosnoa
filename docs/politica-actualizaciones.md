# Política de actualización de dependencias (punto 20 del módulo 6.1)

## Objetivo
Mantener las dependencias al día para reducir la superficie de ataque por
vulnerabilidades conocidas, sin romper la producción.

## Proceso

1. **Dependabot** abre PRs semanales (lunes) para todas las dependencias de npm.
2. Las correcciones de seguridad se aplican en **menos de 48 horas**.
3. Cada PR de Dependabot debe pasar: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`.
4. `npm audit --audit-level=high` se ejecuta en el CI y falla en alta o crítica.
5. `package-lock.json` está versionado; se instala con `npm ci` (versiones fijas).
6. No instalar versiones publicadas hace menos de 2 semanas (evitar paquetes
   comprometidos poco después de publicarse).
7. `npm audit signatures` se revisa periódicamente.
8. Los scripts `postinstall` se minimizan; se usa `ignore-scripts` donde sea posible.

## Escáneres adicionales (CI)

- **CodeQL**: análisis estático del código en cada PR y push a main.
- **OSV-Scanner** o **Snyk**: segundo escáner de vulnerabilidades de dependencias.
- **gitleaks**: detección de secretos en el historial (ver `docs/limpieza-git-secretos.md`).

## Registro de cambios

Cada actualización de dependencia se documenta en el PR vinculado, con la
versión anterior, la nueva y el motivo (parche de seguridad, feature, etc.).
