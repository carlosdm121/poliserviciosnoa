-- PoliserviciosNOA — Rol de migración (app_migrator)
--
-- Este rol se usa solo por `prisma migrate deploy` en CI/build mediante
-- DIRECT_URL. Tiene permisos de DDL sobre el esquema público pero no debería
-- usarse por la aplicación en tiempo de ejecución.
--
-- Ejecutar como superusuario o como el dueño actual de la base de datos.

-- 1. Crear el rol si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator NOLOGIN;
  END IF;
END
$$;

-- 2. Conceder permisos sobre el esquema público
REVOKE ALL ON SCHEMA public FROM app_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO app_migrator;

-- 3. Permisos completos sobre todas las tablas existentes (necesario para migrate)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_migrator;

-- 4. Permisos por defecto para futuras tablas creadas por migraciones
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_migrator;

-- 5. app_migrator es dueño de las tablas que crea. app_runtime no es dueño,
--    así que RLS se aplica sin BYPASSRLS.

-- Fin de app-migrator.sql
