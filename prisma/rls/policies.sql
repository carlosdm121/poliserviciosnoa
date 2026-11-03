-- PoliserviciosNOA — Políticas de Row Level Security (RLS) por tabla
--
-- Ejecutar DESPUÉS de enable-rls.sql.
--
-- Las políticas leen las variables de sesión establecidas por la app:
--   current_setting('app.user_id', true)  -> ID del usuario autenticado
--   current_setting('app.role', true)     -> Rol: PROFESSIONAL, CLIENT, MODERADOR, ADMIN, system
--
-- Cada tabla tiene políticas SELECT, INSERT, UPDATE, DELETE según corresponda.
-- Si una tabla no tiene política para una operación, esa operación está
-- denegada (deny-all por defecto con RLS activado).

-- ---------------------------------------------------------------------------
-- Helper: el usuario dueño de un perfil
-- ---------------------------------------------------------------------------
-- current_setting('app.user_id', true) = profile.userId
-- current_setting('app.role', true) = 'system'  (webhooks/cron)

-- ---------------------------------------------------------------------------
-- Tabla: User
-- ---------------------------------------------------------------------------
-- Un usuario puede leer y modificar su propia fila. El sistema puede leer todo.
CREATE POLICY IF NOT EXISTS "users_own_read" ON "User"
  FOR SELECT TO app_runtime
  USING (current_setting('app.user_id', true) = id);

CREATE POLICY IF NOT EXISTS "users_own_write" ON "User"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = id)
  WITH CHECK (current_setting('app.user_id', true) = id);

CREATE POLICY IF NOT EXISTS "users_system_all" ON "User"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Account, Session, VerificationToken (solo dueño y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "accounts_own" ON "Account"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = userId)
  WITH CHECK (current_setting('app.user_id', true) = userId);

CREATE POLICY IF NOT EXISTS "sessions_own" ON "Session"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = userId)
  WITH CHECK (current_setting('app.user_id', true) = userId);

CREATE POLICY IF NOT EXISTS "verification_tokens_own" ON "VerificationToken"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = identifier)
  WITH CHECK (current_setting('app.user_id', true) = identifier);

-- ---------------------------------------------------------------------------
-- Tabla: Catálogo (lectura pública, escritura solo sistema/admin)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "catalog_read_all" ON "CategoryGroup"
  FOR SELECT TO app_runtime
  USING (true);

CREATE POLICY IF NOT EXISTS "catalog_read_all" ON "Category"
  FOR SELECT TO app_runtime
  USING (true);

CREATE POLICY IF NOT EXISTS "catalog_read_all" ON "Subcategory"
  FOR SELECT TO app_runtime
  USING (true);

CREATE POLICY IF NOT EXISTS "catalog_read_all" ON "City"
  FOR SELECT TO app_runtime
  USING (true);

CREATE POLICY IF NOT EXISTS "catalog_system_write" ON "CategoryGroup"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

CREATE POLICY IF NOT EXISTS "catalog_system_write" ON "Category"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

CREATE POLICY IF NOT EXISTS "catalog_system_write" ON "Subcategory"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

CREATE POLICY IF NOT EXISTS "catalog_system_write" ON "City"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: Profile
-- ---------------------------------------------------------------------------
-- El dueño puede leer y modificar todo su perfil.
CREATE POLICY IF NOT EXISTS "profile_own_all" ON "Profile"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = userId)
  WITH CHECK (current_setting('app.user_id', true) = userId);

-- Cualquiera puede leer perfiles publicados (criterio de perfil público).
-- Esto permite la búsqueda pública y el perfil público /p/[slug].
CREATE POLICY IF NOT EXISTS "profile_public_read" ON "Profile"
  FOR SELECT TO app_runtime
  USING (
    isPublished = true
    AND moderationStatus = 'APPROVED'
  );

-- El sistema puede leer/modificar todo (webhooks, cron, admin).
CREATE POLICY IF NOT EXISTS "profile_system_all" ON "Profile"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Image (solo dueño del perfil y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "image_own_all" ON "Image"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Image".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Image".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "image_system_all" ON "Image"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Plan (lectura pública, escritura solo sistema/admin)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "plan_read_all" ON "Plan"
  FOR SELECT TO app_runtime
  USING (true);

CREATE POLICY IF NOT EXISTS "plan_system_write" ON "Plan"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: Subscription (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "subscription_own_all" ON "Subscription"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Subscription".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Subscription".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "subscription_admin_read" ON "Subscription"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "subscription_system_all" ON "Subscription"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Payment (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "payment_own_all" ON "Payment"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Subscription" s
      JOIN "Profile" p ON p.id = s.profileId
      WHERE s.id = "Payment".subscriptionId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Subscription" s
      JOIN "Profile" p ON p.id = s.profileId
      WHERE s.id = "Payment".subscriptionId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "payment_admin_read" ON "Payment"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "payment_system_all" ON "Payment"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Invoice (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "invoice_own_all" ON "Invoice"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Payment" pay
      JOIN "Subscription" s ON s.id = pay.subscriptionId
      JOIN "Profile" p ON p.id = s.profileId
      WHERE pay.id = "Invoice".paymentId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Payment" pay
      JOIN "Subscription" s ON s.id = pay.subscriptionId
      JOIN "Profile" p ON p.id = s.profileId
      WHERE pay.id = "Invoice".paymentId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "invoice_admin_read" ON "Invoice"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "invoice_system_all" ON "Invoice"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: CreditNote (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "creditnote_own_all" ON "CreditNote"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Invoice" inv
      JOIN "Payment" pay ON pay.id = inv.paymentId
      JOIN "Subscription" s ON s.id = pay.subscriptionId
      JOIN "Profile" p ON p.id = s.profileId
      WHERE inv.id = "CreditNote".invoiceId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Invoice" inv
      JOIN "Payment" pay ON pay.id = inv.paymentId
      JOIN "Subscription" s ON s.id = pay.subscriptionId
      JOIN "Profile" p ON p.id = s.profileId
      WHERE inv.id = "CreditNote".invoiceId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "creditnote_system_all" ON "CreditNote"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: PriceChange (sistema y admin)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "pricechange_admin_read" ON "PriceChange"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "pricechange_system_all" ON "PriceChange"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: ContactIntent (cliente dueño)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "contactintent_own_all" ON "ContactIntent"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = clientId)
  WITH CHECK (current_setting('app.user_id', true) = clientId);

CREATE POLICY IF NOT EXISTS "contactintent_system_all" ON "ContactIntent"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: ProfileVote (cliente dueño)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "profilevote_own_all" ON "ProfileVote"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = clientId)
  WITH CHECK (current_setting('app.user_id', true) = clientId);

CREATE POLICY IF NOT EXISTS "profilevote_system_all" ON "ProfileVote"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: VoteInvite (cliente dueño y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "voteinvite_own_all" ON "VoteInvite"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = clientId)
  WITH CHECK (current_setting('app.user_id', true) = clientId);

CREATE POLICY IF NOT EXISTS "voteinvite_system_all" ON "VoteInvite"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: WhatsAppVerification (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "whatsappverif_own_all" ON "WhatsAppVerification"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "WhatsAppVerification".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "WhatsAppVerification".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "whatsappverif_admin_read" ON "WhatsAppVerification"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "whatsappverif_system_all" ON "WhatsAppVerification"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: FiscalData (solo dueño, ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "fiscaldata_own_all" ON "FiscalData"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "FiscalData".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "FiscalData".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "fiscaldata_admin_read" ON "FiscalData"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) = 'ADMIN');

CREATE POLICY IF NOT EXISTS "fiscaldata_system_all" ON "FiscalData"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Report (cliente dueño y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "report_own_all" ON "Report"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Report".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "Report".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "report_system_all" ON "Report"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: BlockedIdentifier (solo staff: ADMIN, MODERADOR, system)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "blocked_staff_all" ON "BlockedIdentifier"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: RiskSignal (solo staff)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "risksignal_staff_all" ON "RiskSignal"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: SiteSetting (solo ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "sitesetting_admin_all" ON "SiteSetting"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: AuditLog (solo INSERT y SELECT para ADMIN y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "auditlog_admin_insert_select" ON "AuditLog"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'));

CREATE POLICY IF NOT EXISTS "auditlog_admin_insert" ON "AuditLog"
  FOR INSERT TO app_runtime
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- No hay política UPDATE ni DELETE para AuditLog: es inmutable.

-- ---------------------------------------------------------------------------
-- Tabla: CancellationRequest (dueño, sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "cancellation_own_all" ON "CancellationRequest"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "CancellationRequest".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "CancellationRequest".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "cancellation_system_all" ON "CancellationRequest"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Reclamo (cliente dueño, sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "reclamo_own_all" ON "Reclamo"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = clientId)
  WITH CHECK (current_setting('app.user_id', true) = clientId);

CREATE POLICY IF NOT EXISTS "reclamo_system_all" ON "Reclamo"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: EvidenciaReclamo (sistema, y lectura del dueño del reclamo)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "evidencia_own_read" ON "EvidenciaReclamo"
  FOR SELECT TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Reclamo" r
      WHERE r.id = "EvidenciaReclamo".reclamoId
        AND r.clientId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "evidencia_system_all" ON "EvidenciaReclamo"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: Complaint (cliente dueño, sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "complaint_own_all" ON "Complaint"
  FOR ALL TO app_runtime
  USING (true)
  WITH CHECK (true);

-- Complaint es público (sin sesión), así que no hay filtrado por userId.
-- El sistema puede leer todo.
CREATE POLICY IF NOT EXISTS "complaint_system_all" ON "Complaint"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: SupportTicket (cliente dueño, staff, sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "supportticket_own_all" ON "SupportTicket"
  FOR ALL TO app_runtime
  USING (current_setting('app.user_id', true) = COALESCE(userId, ''))
  WITH CHECK (current_setting('app.user_id', true) = COALESCE(userId, ''));

CREATE POLICY IF NOT EXISTS "supportticket_staff_all" ON "SupportTicket"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: TicketRespuesta (cliente dueño, staff, sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "ticketrespuesta_own_all" ON "TicketRespuesta"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "SupportTicket" t
      WHERE t.id = "TicketRespuesta".ticketId
        AND (t.userId = current_setting('app.user_id', true) OR t.userId IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "SupportTicket" t
      WHERE t.id = "TicketRespuesta".ticketId
        AND (t.userId = current_setting('app.user_id', true) OR t.userId IS NULL)
    )
  );

CREATE POLICY IF NOT EXISTS "ticketrespuesta_staff_all" ON "TicketRespuesta"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: TicketPlantilla (solo staff y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "ticketplantilla_staff_all" ON "TicketPlantilla"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'))
  WITH CHECK (current_setting('app.role', true) IN ('ADMIN', 'MODERADOR', 'system'));

-- ---------------------------------------------------------------------------
-- Tabla: DataRequest (dueño y sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "datarequest_own_all" ON "DataRequest"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "DataRequest".userId
        AND u.id = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = "DataRequest".userId
        AND u.id = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "datarequest_system_all" ON "DataRequest"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tablas relacionales muchos-a-muchos (heredan del perfil dueño)
-- ---------------------------------------------------------------------------

CREATE POLICY IF NOT EXISTS "profilecategory_own" ON "ProfileCategory"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileCategory".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileCategory".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "profilesubcategory_own" ON "ProfileSubcategory"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileSubcategory".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileSubcategory".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

CREATE POLICY IF NOT EXISTS "profilecoverage_own" ON "ProfileCoverage"
  FOR ALL TO app_runtime
  USING (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileCoverage".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Profile" p
      WHERE p.id = "ProfileCoverage".profileId
        AND p.userId = current_setting('app.user_id', true)
    )
  );

-- ---------------------------------------------------------------------------
-- Tabla: ProfileDailyStat (sistema y admin)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "profilestat_admin_read" ON "ProfileDailyStat"
  FOR SELECT TO app_runtime
  USING (current_setting('app.role', true) IN ('ADMIN', 'system'));

CREATE POLICY IF NOT EXISTS "profilestat_system_all" ON "ProfileDailyStat"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: WebhookEvent (solo sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "webhookevent_system_all" ON "WebhookEvent"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- ---------------------------------------------------------------------------
-- Tabla: EmailLog (solo sistema)
-- ---------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "emaillog_system_all" ON "EmailLog"
  FOR ALL TO app_runtime
  USING (current_setting('app.role', true) = 'system')
  WITH CHECK (current_setting('app.role', true) = 'system');

-- Fin de policies.sql
