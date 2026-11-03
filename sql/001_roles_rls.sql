-- PoliserviciosNOA — Roles de base de datos y Row Level Security
-- Puntos 3 y 4 del módulo 6.1 (endurecimiento de seguridad).
--
-- Aplicar sobre la base de producción antes del primer deploy con app_runtime.
-- app_migrator se usa solo por `prisma migrate deploy` en CI mediante DIRECT_URL.
--
-- Orden de ejecución:
--   1. Crear roles
--   2. Conceder privilegios mínimos a app_runtime
--   3. Habilitar RLS en todas las tablas del schema public
--   4. FORCE ROW LEVEL SECURITY en tablas sensibles
--   5. Revisar políticas en sql/policies.sql

-- ---------------------------------------------------------------------------
-- 1. Roles
-- ---------------------------------------------------------------------------

-- Rol usado por la aplicación en tiempo de ejecución (DATABASE_URL).
-- NO es dueño de las tablas, NO tiene BYPASSRLS, solo DML sobre tablas necesarias.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END
$$;

-- Rol usado solo por migraciones en CI (DIRECT_URL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Privilegios de esquema
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_migrator;

-- ---------------------------------------------------------------------------
-- 3. Tablas del schema public (lista extraída de prisma/schema.prisma)
-- ---------------------------------------------------------------------------

-- app_runtime puede leer y escribir solo las tablas del negocio.
-- No puede hacer DDL, ni TRUNCATE, ni acceder a tablas de sistema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;

-- app_migrator recibe todo para poder migrar (solo en CI).
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_migrator;

-- Privilegios por defecto para tablas futuras.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO app_migrator;

-- Secuencias (si las hubiera) para que app_runtime no quede sin poder insertar.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_migrator;

-- ---------------------------------------------------------------------------
-- 4. Habilitar RLS en todas las tablas del schema public
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. FORCE ROW LEVEL SECURITY en tablas sensibles
-- ---------------------------------------------------------------------------
-- FORCE RLS obliga incluso al dueño de la tabla a pasar por las políticas.
-- Se aplica a tablas con datos personales y financieros.

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN (
        'User', 'Account', 'Session', 'VerificationToken',
        'Profile', 'ContactIntent', 'ProfileVote', 'VoteInvite',
        'ProfileDailyStat', 'ProfileCategory', 'ProfileSubcategory',
        'ProfileCoverage', 'Image', 'FiscalData',
        'WhatsAppVerification', 'Plan', 'Subscription', 'Payment',
        'Invoice', 'CreditNote', 'PriceChange',
        'WebhookEvent', 'EmailLog', 'Report', 'BlockedIdentifier',
        'RiskSignal', 'SiteSetting', 'AuditLog',
        'CancellationRequest', 'Complaint', 'Reclamo', 'EvidenciaReclamo',
        'SupportTicket', 'TicketRespuesta', 'TicketPlantilla', 'DataRequest'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Conexión siempre con SSL
-- ---------------------------------------------------------------------------
-- Se aplica a nivel de conexión (DATABASE_URL con sslmode=verify-full),
-- no hay comando SQL global para forzar SSL en PostgreSQL.
-- Verificar que DATABASE_URL incluya sslmode=verify-full en .env de producción.

-- ---------------------------------------------------------------------------
-- 7. Deny-all para roles públicos (anon, authenticated, public)
-- ---------------------------------------------------------------------------
-- En Supabase existen los roles anon y authenticated. En este proyecto
-- la app nunca se conecta como esos roles desde el cliente (Prisma corre en
-- el servidor), pero si existieran, se les revoca todo acceso:
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "public";
  END IF;
END
$$;
