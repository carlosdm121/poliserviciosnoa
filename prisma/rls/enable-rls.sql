-- PoliserviciosNOA — Activar Row Level Security (RLS) en todas las tablas
--
-- Ejecutar DESPUÉS de `prisma migrate deploy` y de crear los roles
-- app_runtime y app_migrator (ver prisma/roles-sql/).
--
-- Este script:
-- 1. Habilita RLS en TODAS las tablas del esquema public.
-- 2. Fuerza RLS (FORCE ROW LEVEL SECURITY) en tablas de negocio para que
--    incluso el dueño de las tablas esté sujeto a las políticas.
-- 3. Revoca todos los permisos de roles públicos (anon, authenticated,
--    public) si existen.
--
-- Ejecutar como superusuario o como el dueño actual de las tablas.

-- ---------------------------------------------------------------------------
-- 1. Crear roles públicos si no existen (para denegarles acceso explícitamente)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public') THEN
    CREATE ROLE public NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Habilitar RLS en todas las tablas de negocio
-- ---------------------------------------------------------------------------

-- Tablas de identidad y catálogo (lectura pública controlada, escritura solo admin/system)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CategoryGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subcategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "City" ENABLE ROW LEVEL SECURITY;

-- Tablas de perfil (propiedad del usuario)
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Image" ENABLE ROW LEVEL SECURITY;

-- Tablas de suscripción y pagos
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceChange" ENABLE ROW LEVEL SECURITY;

-- Tablas de contacto y confianza
ALTER TABLE "ContactIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfileVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VoteInvite" ENABLE ROW LEVEL SECURITY;

-- Verificación de WhatsApp
ALTER TABLE "WhatsAppVerification" ENABLE ROW LEVEL SECURITY;

-- Facturación
ALTER TABLE "FiscalData" ENABLE ROW LEVEL SECURITY;

-- Operación y moderación
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedIdentifier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RiskSignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Baja, reclamos y soporte
ALTER TABLE "CancellationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reclamo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenciaReclamo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Complaint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketRespuesta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketPlantilla" ENABLE ROW LEVEL SECURITY;

-- Derechos del titular
ALTER TABLE "DataRequest" ENABLE ROW LEVEL SECURITY;

-- Relaciones muchos-a-muchos
ALTER TABLE "ProfileCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfileSubcategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfileCoverage" ENABLE ROW LEVEL SECURITY;

-- Estadísticas y webhooks
ALTER TABLE "ProfileDailyStat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailLog" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. FORCE ROW LEVEL SECURITY en tablas de negocio
--
-- FORCE hace que RLS se aplique incluso al dueño de la tabla. Sin esto, si
-- app_runtime fuera dueño de las tablas, podría saltarse las políticas.
-- Como app_runtime NO es dueño (app_migrator lo es), FORCE es defensa en
-- profundidad por si el rol cambia en el futuro.
-- ---------------------------------------------------------------------------

ALTER TABLE "Profile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Image" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ContactIntent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ProfileVote" FORCE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppVerification" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FiscalData" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Reclamo" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CancellationRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BlockedIdentifier" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RiskSignal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SiteSetting" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Revocar acceso de roles públicos a todas las tablas
--
-- Deny-all para anon, authenticated, public. Sin políticas = sin acceso.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tabla record;
BEGIN
  FOR tabla IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated, public', tabla.tablename);
  END LOOP;
END
$$;

-- Fin de enable-rls.sql
