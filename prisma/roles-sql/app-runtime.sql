-- PoliserviciosNOA — Rol de runtime de la aplicación (app_runtime)
--
-- Este rol es el que usa la app en DATABASE_URL. Solo puede leer/escribir las
-- tablas que necesita, no puede hacer DDL, no es dueño de las tablas y no tiene
-- BYPASSRLS. Con RLS activado (FORCE) y políticas por propietario, incluso si
-- la app tiene un bug de IDOR, una consulta con el id de otro usuario devuelve
-- 0 filas.
--
-- Aplicar después de `prisma migrate deploy` y de haber creado las tablas.
-- Ejecutar como superusuario o como el dueño actual de las tablas.

-- 1. Crear el rol si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END
$$;

-- 2. Conceder permisos sobre el esquema público (solo USAGE, no CREATE)
REVOKE ALL ON SCHEMA public FROM app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;

-- 3. Permisos sobre tablas: solo SELECT/INSERT/UPDATE/DELETE, nada más
--    Se listan explícitamente las tablas de negocio que la app necesita.
--    Tablas que NO aparecen aquí son inaccesibles para este rol.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "User",
  "Profile",
  "CategoryGroup",
  "Category",
  "Subcategory",
  "City",
  "ProfileCategory",
  "ProfileSubcategory",
  "ProfileCoverage",
  "Image",
  "Subscription",
  "Payment",
  "Invoice",
  "CreditNote",
  "ContactIntent",
  "ProfileVote",
  "VoteInvite",
  "WhatsAppVerification",
  "Report",
  "RiskSignal",
  "BlockedIdentifier",
  "CancellationRequest",
  "Reclamo",
  "EvidenciaReclamo",
  "SupportTicket",
  "TicketRespuesta",
  "Complaint",
  "FiscalData",
  "Plan",
  "PriceChange",
  "ProfileDailyStat",
  "WebhookEvent",
  "EmailLog",
  "AuditLog",
  "DataRequest",
  "SiteSetting",
  "TicketPlantilla"
TO app_runtime;

-- 4. Permisos sobre secuencias (necesarias para cuid() y serials)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- 5. Permisos por defecto para futuras tablas: nada (denegar por defecto)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM app_runtime;

-- 6. El rol NO es dueño de ninguna tabla. El dueño sigue siendo el rol de
--    migración (app_migrator) o el rol que ejecutó prisma migrate.

-- 7. Nota: RLS se activa en cada tabla con ALTER TABLE ... ENABLE ROW LEVEL
--    SECURITY y FORCE ROW LEVEL SECURITY (ver bloque A, punto 4 del módulo 6.1).
--    Este rol no tiene BYPASSRLS, así que las políticas de RLS se aplican.

-- 8. Conexión siempre con SSL: se impone desde la cadena de conexión
--    DATABASE_URL con sslmode=require (o verify-full en Neon/Supabase).

-- 9. Variables de sesión para RLS: la app las establece al inicio de cada
--    request con set_config('app.user_id', ..., true) y
--    set_config('app.role', ..., true) dentro de la transacción.

-- Fin de app_runtime.sql
