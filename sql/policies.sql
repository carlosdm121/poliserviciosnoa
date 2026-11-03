-- PoliserviciosNOA — Políticas de Row Level Security (RLS)
-- Punto 4 del módulo 6.1 (endurecimiento de seguridad).
--
-- Las políticas leen las variables de sesión de PostgreSQL establecidas por
-- src/lib/db/rls.ts (setearVariablesSesion / withUser / withSystem):
--   current_setting('app.user_id', true)  -> ID del usuario o ''
--   current_setting('app.role', true)     -> 'PROFESSIONAL' | 'CLIENT' | 'MODERADOR' | 'ADMIN' | 'system'
--
-- Aplicar DESPUÉS de sql/001_roles_rls.sql (que ya habilitó RLS en las tablas).
--
-- Nota: app_runtime no es dueño de las tablas ni tiene BYPASSRLS, por lo que
-- RLS se aplica incluso a la aplicación. Sin una política que coincida, la
-- consulta devuelve 0 filas (deny-all implícito).

-- ---------------------------------------------------------------------------
-- Helper: comprobar si el rol de sesión es ADMIN o MODERADOR (staff)
-- ---------------------------------------------------------------------------
-- No se puede crear una función SQL que lea current_setting y la reutilice en
-- políticas de forma sencilla sin SECURITY DEFINER, así que se inlinea en cada
-- política que lo necesite.

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------
-- El dueño ve y edita su propio perfil.
-- Cualquiera (incluido rol system para webhooks) puede leer perfiles publicados.
CREATE POLICY profile_owner_all ON public."Profile"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.user_id', true) = userId
  )
  WITH CHECK (
    current_setting('app.user_id', true) = userId
  );

CREATE POLICY profile_public_read ON public."Profile"
  FOR SELECT TO app_runtime
  USING (
    isPublished = true
    OR current_setting('app.role', true) = 'system'
    OR current_setting('app.role', true) IN ('ADMIN', 'MODERADOR')
  );

-- ---------------------------------------------------------------------------
-- Image
-- ---------------------------------------------------------------------------
-- Solo el dueño del perfil y ADMIN.
CREATE POLICY image_owner_admin ON public."Image"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "Image".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "Image".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Subscription
-- ---------------------------------------------------------------------------
-- Solo el dueño del perfil y ADMIN.
CREATE POLICY subscription_owner_admin ON public."Subscription"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "Subscription".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "Subscription".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Payment
-- ---------------------------------------------------------------------------
-- Solo el dueño del perfil (vía subscription) y ADMIN.
CREATE POLICY payment_owner_admin ON public."Payment"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM public."Subscription" s
      JOIN public."Profile" p ON p.id = s.profileId
      WHERE s.id = "Payment".subscriptionId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Subscription" s
      JOIN public."Profile" p ON p.id = s.profileId
      WHERE s.id = "Payment".subscriptionId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Invoice
-- ---------------------------------------------------------------------------
-- Solo INSERT y SELECT para ADMIN. El dueño puede leer sus propias facturas.
CREATE POLICY invoice_admin_insert_select ON public."Invoice"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.role', true) = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public."Payment" pay
      JOIN public."Subscription" s ON s.id = pay.subscriptionId
      JOIN public."Profile" p ON p.id = s.profileId
      WHERE pay.id = "Invoice".paymentId
        AND current_setting('app.user_id', true) = p.userId
    )
  )
  WITH CHECK (
    current_setting('app.role', true) = 'ADMIN'
  );

-- ---------------------------------------------------------------------------
-- WhatsAppVerification
-- ---------------------------------------------------------------------------
-- Solo el dueño del perfil y ADMIN.
CREATE POLICY whatsapp_verification_owner_admin ON public."WhatsAppVerification"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "WhatsAppVerification".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "WhatsAppVerification".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- ContactIntent
-- ---------------------------------------------------------------------------
-- Solo el cliente dueño (clientId) y ADMIN.
CREATE POLICY contact_intent_client_admin ON public."ContactIntent"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  )
  WITH CHECK (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  );

-- ---------------------------------------------------------------------------
-- ProfileVote
-- ---------------------------------------------------------------------------
-- Solo el cliente dueño y ADMIN.
CREATE POLICY profile_vote_client_admin ON public."ProfileVote"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  )
  WITH CHECK (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  );

-- ---------------------------------------------------------------------------
-- Complaint (reclamo de cliente contra profesional)
-- ---------------------------------------------------------------------------
-- Solo el cliente dueño y ADMIN.
CREATE POLICY complaint_client_admin ON public."Reclamo"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  )
  WITH CHECK (
    current_setting('app.user_id', true) = clientId
    OR current_setting('app.role', true) = 'ADMIN'
  );

-- ---------------------------------------------------------------------------
-- AuditLog
-- ---------------------------------------------------------------------------
-- Solo INSERT y SELECT para ADMIN.
CREATE POLICY auditlog_admin_only ON public."AuditLog"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.role', true) = 'ADMIN'
  )
  WITH CHECK (
    current_setting('app.role', true) = 'ADMIN'
  );

-- ---------------------------------------------------------------------------
-- BlockedIdentifier, RiskSignal
-- ---------------------------------------------------------------------------
-- Solo staff (ADMIN, MODERADOR).
CREATE POLICY blocked_identifier_staff ON public."BlockedIdentifier"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.role', true) IN ('ADMIN', 'MODERADOR')
  )
  WITH CHECK (
    current_setting('app.role', true) IN ('ADMIN', 'MODERADOR')
  );

CREATE POLICY risk_signal_staff ON public."RiskSignal"
  FOR ALL TO app_runtime
  USING (
    current_setting('app.role', true) IN ('ADMIN', 'MODERADOR')
  )
  WITH CHECK (
    current_setting('app.role', true) IN ('ADMIN', 'MODERADOR')
  );

-- ---------------------------------------------------------------------------
-- FiscalData
-- ---------------------------------------------------------------------------
-- Solo el dueño del perfil y ADMIN. MODERADOR no accede a datos fiscales.
CREATE POLICY fiscal_data_owner_admin ON public."FiscalData"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "FiscalData".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."Profile" p
      WHERE p.id = "FiscalData".profileId
        AND (
          current_setting('app.user_id', true) = p.userId
          OR current_setting('app.role', true) = 'ADMIN'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Tablas de catálogo (lectura pública)
-- ---------------------------------------------------------------------------
-- CategoryGroup, Category, Subcategory, City, Plan: lectura para todos.
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('CategoryGroup', 'Category', 'Subcategory', 'City', 'Plan')
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_public_read ON public.%I FOR SELECT TO app_runtime USING (true)',
      'policy_' || tbl.tablename, tbl.tablename
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Tablas restantes sin política específica: deny-all (0 filas para app_runtime)
-- ---------------------------------------------------------------------------
-- Account, Session, VerificationToken, WebhookEvent, EmailLog, Report,
-- SiteSetting, CancellationRequest, SupportTicket, TicketRespuesta,
-- TicketPlantilla, DataRequest, ProfileDailyStat, VoteInvite
-- No se crea política SELECT/INSERT/UPDATE/DELETE para app_runtime,
-- por lo que queda denegado por defecto. Los servicios de dominio que
-- las necesitan deben usar withSystem (rol 'system') con políticas
-- específicas agregadas aquí cuando se requiera.
