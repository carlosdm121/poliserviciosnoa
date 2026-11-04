-- =============================================================================
-- PoliserviciosNOA — Esquema Supabase (estilo proyecto ecr)
-- =============================================================================
-- Listo para pegar en el SQL Editor de Supabase o ejecutar con Supabase CLI.
--
-- Convenciones (igual que ecr):
--  * IDs: UUID con uuid_generate_v4()
--  * Auth: auth.users de Supabase (FK en perfiles)
--  * Cifrado: pgcrypto a nivel de DB (trigger), nunca en app
--  * RLS: auth.uid() en todas las tablas
--  * Storage buckets públicos/privados para imágenes
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones
-- -----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos enumerados (enums)
-- -----------------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('PROFESSIONAL', 'CLIENT', 'MODERADOR', 'ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type province as enum ('TUCUMAN', 'SALTA', 'SANTIAGO_DEL_ESTERO', 'CATAMARCA', 'JUJUY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type profile_type as enum ('PERSON', 'COMPANY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('APPROVED', 'REJECTED', 'PENDING', 'REFUNDED', 'CHARGED_BACK');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('PENDING', 'ISSUED', 'FAILED', 'VOIDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_comprobante as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_reason as enum ('DUDOSO', 'DATO_FALSO', 'CONTENIDO_INADECUADO', 'ESTAFO', 'OTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESCARTADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type whatsapp_verification_status as enum ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELED', 'LOCKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_persona_fiscal as enum ('PERSONA_HUMANA', 'EMPRESA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type condicion_iva as enum ('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_MONOTRIBUTO', 'EXENTO', 'LIBERADO', 'CONSUMIDOR_FINAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moderation_status as enum ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type blocked_identifier_type as enum ('WHATSAPP_HASH', 'EMAIL', 'CUIT_HASH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_signal_type as enum (
    'EMAIL_DESECHABLE',
    'MULTIPLES_ALTAS_MISMA_IP',
    'DESCRIPCION_CON_CONTACTO_EXTERNO',
    'NO_FUI_YO',
    'REPORTES_MULTIPLES',
    'CAMBIO_DE_CUIT_TARDIO',
    'CAMBIO_DE_IP_POSTERIOR_AL_ALTA',
    'MUCHOS_VOTOS_MISMO_CLIENTE',
    'VOTOS_DOMINIO_DESECHABLE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type team_size as enum ('T1_5', 'T6_20', 'T21_50', 'T50_PLUS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type price_change_estado as enum ('PROGRAMADO', 'AVISADO', 'APLICADO', 'CANCELADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('ABIERTO', 'EN_CURSO', 'RESUELTO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('BAJA', 'MEDIA', 'ALTA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_category as enum ('VERIFICACION_WHATSAPP', 'PAGO', 'PERFIL', 'PUBLICACION', 'OTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_data_request as enum ('ACCESO', 'RECTIFICACION', 'SUPRESION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_data_request as enum ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'RECHAZADO', 'CANCELADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_cupon as enum ('MES_GRATIS', 'PORCENTAJE', 'MONTO_FIJO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cancellation_type as enum ('BAJA', 'ARREPENTIMIENTO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cancellation_status as enum ('PENDIENTE', 'COMPLETADA', 'FALLIDA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('ABIERTO', 'EN_REVISION', 'RESUELTO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reclamo_motivo as enum ('NO_SE_PRESENTO', 'MALA_CALIDAD', 'COBRO_EXCESIVO', 'TRATO_INADECUADO', 'FRAUDE', 'OTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reclamo_estado as enum ('NUEVO', 'EN_REVISION', 'VALIDADO', 'DESESTIMADO');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tabla: profiles (1:1 con auth.users)
-- Campos sensibles (whatsapp, cuit, documento, domicilio) se cifran con pgcrypto
-- vía trigger auto_encrypt_profiles().
-- -----------------------------------------------------------------------------

create table profiles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique not null references auth.users(id) on delete cascade,
  type            profile_type not null default 'PERSON',
  name            text not null,
  slug            text unique not null,
  company_name    text,
  trade_name      text,
  cuit            text,                      -- cifrado
  cuit_hash       text unique,               -- hash para dedup
  logo_url        text,
  team_size       team_size,
  year_founded    integer,
  website         text,
  company_document_key text,                -- ruta privada en storage
  company_document_reviewed_at timestamptz,
  company_verified_at  timestamptz,
  company_verified_by  text,
  company_rejection_reason text,
  license_number  text,
  license_reviewed_at timestamptz,
  license_reviewed_by  text,
  whatsapp_e164   text unique not null,     -- cifrado
  whatsapp_hash   text unique,               -- hash para dedup
  whatsapp_verified_at timestamptz,
  whatsapp_verified_by text,
  description     text,
  short_bio       text,
  base_city_id    uuid references cities(id) on delete set null,
  covers_whole_province boolean not null default false,
  covers_other_provinces province[] not null default '{}',
  is_published    boolean not null default false,
  unpublished_reason text,
  moderation_status moderation_status not null default 'PENDING_REVIEW',
  moderation_reason text,
  moderation_reviewed_at timestamptz,
  moderation_reviewed_by text,
  views_count     integer not null default 0,
  contacts_count  integer not null default 0,
  whatsapp_clicks integer not null default 0,
  hearts_count    integer not null default 0,
  last_payment_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Tabla: fiscal_data (1:1 con profiles)
-- documento y domicilio_fiscal se cifran.
-- -----------------------------------------------------------------------------

create table fiscal_data (
  id                  uuid primary key default uuid_generate_v4(),
  profile_id          uuid unique not null references profiles(id) on delete cascade,
  tipo_persona        tipo_persona_fiscal not null,
  nombre_o_razon_social text not null,
  documento           text not null,         -- cifrado
  documento_hash      text unique,           -- hash para dedup
  condicion_iva       condicion_iva not null,
  domicilio_fiscal    text not null,         -- cifrado
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------

create table category_groups (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null,
  slug      text unique not null,
  icon      text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_category_groups_sort on category_groups(sort_order);

create table categories (
  id        uuid primary key default uuid_generate_v4(),
  group_id  uuid not null references category_groups(id) on delete cascade,
  name      text not null,
  slug      text unique not null,
  icon      text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  requires_license boolean not null default false,
  license_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_categories_group_sort on categories(group_id, sort_order);
create index idx_categories_is_active on categories(is_active);

create table subcategories (
  id          uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category_id, slug)
);

create index idx_subcategories_category_sort on subcategories(category_id, sort_order);

create table cities (
  id        uuid primary key default uuid_generate_v4(),
  province  province not null,
  name      text not null,
  slug      text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (province, slug)
);

create index idx_cities_province_sort on cities(province, sort_order);

-- -----------------------------------------------------------------------------
-- Relaciones perfil <-> catálogo
-- -----------------------------------------------------------------------------

create table profile_categories (
  profile_id  uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (profile_id, category_id)
);

create index idx_profile_categories_category on profile_categories(category_id);

create table profile_subcategories (
  profile_id      uuid not null references profiles(id) on delete cascade,
  subcategory_id  uuid not null references subcategories(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (profile_id, subcategory_id)
);

create index idx_profile_subcategories_subcategory on profile_subcategories(subcategory_id);

create table profile_coverage (
  profile_id uuid not null references profiles(id) on delete cascade,
  city_id    uuid not null references cities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, city_id)
);

create index idx_profile_coverage_city on profile_coverage(city_id);

-- -----------------------------------------------------------------------------
-- Imágenes (galería)
-- -----------------------------------------------------------------------------

create table images (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  public_id text not null,
  url       text not null,
  width     integer not null,
  height    integer not null,
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  hidden_reason text,
  hidden_at  timestamptz,
  hidden_by  text,
  created_at timestamptz not null default now()
);

create index idx_images_profile_sort on images(profile_id, sort_order);
create index idx_images_profile_hidden on images(profile_id, is_hidden);

-- -----------------------------------------------------------------------------
-- Contacto y confianza
-- -----------------------------------------------------------------------------

create table contact_intents (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_contact_intents_client_profile_created on contact_intents(client_id, profile_id, created_at);
create index idx_contact_intents_profile_created on contact_intents(profile_id, created_at);

create table profile_votes (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, client_id)
);

create index idx_profile_votes_profile_created on profile_votes(profile_id, created_at);
create index idx_profile_votes_client_created on profile_votes(client_id, created_at);

create table vote_invites (
  id        uuid primary key default uuid_generate_v4(),
  client_id  uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  sent_at   timestamptz not null default now(),
  unique (client_id, profile_id)
);

create index idx_vote_invites_client_sent on vote_invites(client_id, sent_at);
create index idx_vote_invites_profile_sent on vote_invites(profile_id, sent_at);

-- -----------------------------------------------------------------------------
-- Verificación de WhatsApp
-- -----------------------------------------------------------------------------

create table whatsapp_verifications (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  phone_e164 text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  status    whatsapp_verification_status not null default 'PENDING',
  attempts  integer not null default 0,
  message_id text unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_whatsapp_verifications_profile_status on whatsapp_verifications(profile_id, status);
create index idx_whatsapp_verifications_codehash_status on whatsapp_verifications(code_hash, status);

-- -----------------------------------------------------------------------------
-- Suscripción y pagos
-- -----------------------------------------------------------------------------

create table plans (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  amount       numeric(10, 2) not null,
  currency     text not null default 'ARS',
  is_active    boolean not null default true,
  vigente_desde timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table subscriptions (
  id                  uuid primary key default uuid_generate_v4(),
  profile_id          uuid unique not null references profiles(id) on delete cascade,
  plan_id             uuid references plans(id) on delete set null,
  plan_amount         numeric(10, 2) not null,
  price_frozen        boolean not null default false,
  status              subscription_status not null default 'PENDING',
  mp_preapproval_id   text unique,
  current_period_start timestamptz,
  current_period_end  timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at        timestamptz,
  past_due_since      timestamptz,
  grace_until         timestamptz,
  terms_version       text,
  terms_accepted_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_subscriptions_status_period_end on subscriptions(status, current_period_end);

create table payments (
  id             uuid primary key default uuid_generate_v4(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  mp_payment_id  text unique not null,
  amount         numeric(10, 2) not null,
  currency       text not null default 'ARS',
  status         payment_status not null,
  fee_amount     numeric(10, 2),
  net_amount     numeric(10, 2),
  paid_at        timestamptz,
  refunded_at    timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_payments_subscription_created on payments(subscription_id, created_at);
create index idx_payments_status on payments(status);

create table invoices (
  id                 uuid primary key default uuid_generate_v4(),
  payment_id         uuid unique not null references payments(id) on delete cascade,
  tipo_comprobante   tipo_comprobante not null,
  punto_venta        integer not null,
  fecha              timestamptz not null,
  receptor_nombre       text not null,
  receptor_documento    text,
  receptor_condicion_iva condicion_iva,
  descripcion          text not null,
  cuit_emisor          text,
  numero               integer,
  cae                  text,
  cae_vence            timestamptz,
  neto   numeric(10, 2) not null,
  iva    numeric(10, 2) not null,
  total  numeric(10, 2) not null,
  pdf_url            text,
  status             invoice_status not null default 'PENDING',
  attempts           integer not null default 0,
  next_attempt_at    timestamptz,
  last_error         text,
  issued_at          timestamptz,
  voided_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_invoices_status_next_attempt on invoices(status, next_attempt_at);
create index idx_invoices_fecha on invoices(fecha);

create table credit_notes (
  id        uuid primary key default uuid_generate_v4(),
  invoice_id uuid unique not null references invoices(id) on delete cascade,
  mp_payment_id text,
  motivo      text not null,
  tipo_comprobante   tipo_comprobante not null,
  punto_venta      integer not null,
  fecha           timestamptz not null,
  numero   integer,
  cae      text,
  cae_vence timestamptz,
  neto  numeric(10, 2) not null,
  iva   numeric(10, 2) not null,
  total numeric(10, 2) not null,
  status invoice_status not null default 'PENDING',
  attempts      integer not null default 0,
  next_attempt_at timestamptz,
  last_error     text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_credit_notes_status_next_attempt on credit_notes(status, next_attempt_at);
create index idx_credit_notes_fecha on credit_notes(fecha);

create table price_changes (
  id             uuid primary key default uuid_generate_v4(),
  plan_id        uuid not null references plans(id) on delete cascade,
  old_amount     numeric(10, 2) not null,
  new_amount     numeric(10, 2) not null,
  fecha_aviso    timestamptz not null,
  fecha_aplicacion timestamptz not null,
  estado         price_change_estado not null default 'PROGRAMADO',
  motivo         text,
  creado_por     text,
  avisada_en     timestamptz,
  aplicada_en    timestamptz,
  cancelada_en   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_price_changes_estado on price_changes(estado);
create index idx_price_changes_fecha_aplicacion on price_changes(fecha_aplicacion);
create index idx_price_changes_plan_id on price_changes(plan_id);

-- -----------------------------------------------------------------------------
-- Operación
-- -----------------------------------------------------------------------------

create table webhook_events (
  id           uuid primary key default uuid_generate_v4(),
  provider     text not null,
  event_type   text not null,
  processed_at timestamptz,
  payload_hash text,
  error        text,
  created_at   timestamptz not null default now()
);

create index idx_webhook_events_provider_processed on webhook_events(provider, processed_at);

create table email_logs (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade,
  email     text not null,
  template  text not null,
  dedupe_key text not null,
  error     text,
  created_at timestamptz not null default now(),
  unique (email, template, dedupe_key)
);

create index idx_email_logs_profile_created on email_logs(profile_id, created_at);

create table reports (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  reason    report_reason not null,
  detail    text,
  reporter_ip_hash text,
  status     report_status not null default 'PENDIENTE',
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reports_status_created on reports(status, created_at);
create index idx_reports_profile on reports(profile_id);

-- Antiabuso
create table blocked_identifiers (
  id        uuid primary key default uuid_generate_v4(),
  type      blocked_identifier_type not null,
  value_hash text not null,
  reason    text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (type, value_hash)
);

create index idx_blocked_identifiers_type on blocked_identifiers(type);

create table risk_signals (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type      risk_signal_type not null,
  details   jsonb,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);

create index idx_risk_signals_profile_created on risk_signals(profile_id, created_at);
create index idx_risk_signals_type_created on risk_signals(type, created_at);
create index idx_risk_signals_resolved_at on risk_signals(resolved_at);

create table site_settings (
  key   text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id         uuid primary key default uuid_generate_v4(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action     text not null,
  entity_type text not null,
  entity_id   text,
  before     jsonb,
  after      jsonb,
  ip_hash    text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor_created on audit_logs(actor_id, created_at);

-- -----------------------------------------------------------------------------
-- Baja y arrepentimiento
-- -----------------------------------------------------------------------------

create table cancellation_requests (
  id                  uuid primary key default uuid_generate_v4(),
  profile_id          uuid not null references profiles(id) on delete cascade,
  subscription_id     text,
  refunded_payment_id text,
  type   cancellation_type not null,
  reason text,
  status cancellation_status not null default 'PENDIENTE',
  tramite_number text unique not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cancellation_requests_profile_created on cancellation_requests(profile_id, created_at);
create index idx_cancellation_requests_status_created on cancellation_requests(status, created_at);
create index idx_cancellation_requests_refunded_payment on cancellation_requests(refunded_payment_id);

create table complaints (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null,
  email     text not null,
  phone     text,
  reference text,
  message   text not null,
  status complaint_status not null default 'ABIERTO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_complaints_status_created on complaints(status, created_at);
create index idx_complaints_email_created on complaints(email, created_at);

create table reclamos (
  id              uuid primary key default uuid_generate_v4(),
  profile_id       uuid not null references profiles(id) on delete cascade,
  client_id        uuid not null references auth.users(id) on delete cascade,
  contact_intent_id uuid not null references contact_intents(id) on delete cascade,
  motivo      reclamo_motivo not null,
  descripcion text not null,
  estado     reclamo_estado not null default 'NUEVO',
  resolucion text,
  tramite_number text unique not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_reclamos_profile_created on reclamos(profile_id, created_at);
create index idx_reclamos_client_created on reclamos(client_id, created_at);
create index idx_reclamos_contact_intent on reclamos(contact_intent_id);
create index idx_reclamos_estado_created on reclamos(estado, created_at);

create table evidencia_reclamo (
  id        uuid primary key default uuid_generate_v4(),
  reclamo_id uuid not null references reclamos(id) on delete cascade,
  url       text not null,
  created_at timestamptz not null default now()
);

create index idx_evidencia_reclamo_reclamo_id on evidencia_reclamo(reclamo_id);

-- -----------------------------------------------------------------------------
-- Soporte y moderación
-- -----------------------------------------------------------------------------

create table support_tickets (
  id        uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete set null,
  nombre    text,
  email     text,
  categoria ticket_category not null,
  asunto    text not null,
  mensaje   text not null,
  prioridad ticket_priority not null default 'MEDIA',
  estado    ticket_status not null default 'ABIERTO',
  asignado_a text,
  numero_tramite text unique not null,
  respuesta_en timestamptz,
  resuelto_en  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_support_tickets_estado on support_tickets(estado);
create index idx_support_tickets_categoria on support_tickets(categoria);
create index idx_support_tickets_asignado on support_tickets(asignado_a);
create index idx_support_tickets_numero_tramite on support_tickets(numero_tramite);
create index idx_support_tickets_created_at on support_tickets(created_at);

create table ticket_respuestas (
  id        uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  autor_id  uuid not null references auth.users(id),
  mensaje   text not null,
  es_del_equipo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_ticket_respuestas_ticket_id on ticket_respuestas(ticket_id);

create table ticket_plantillas (
  id     uuid primary key default uuid_generate_v4(),
  codigo text unique not null,
  nombre text not null,
  asunto text not null,
  mensaje text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Derechos del titular (Ley 25.326)
-- -----------------------------------------------------------------------------

create table data_requests (
  id        uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete set null,
  email     text not null,
  nombre    text,
  tipo   tipo_data_request not null,
  estado estado_data_request not null default 'PENDIENTE',
  tramite_number text unique not null,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolucion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_data_requests_estado on data_requests(estado);
create index idx_data_requests_tipo on data_requests(tipo);
create index idx_data_requests_profile_id on data_requests(profile_id);
create index idx_data_requests_tramite on data_requests(tramite_number);

-- -----------------------------------------------------------------------------
-- Historial del cron
-- -----------------------------------------------------------------------------

create table cron_job_runs (
  id         uuid primary key default uuid_generate_v4(),
  job        text not null,
  ok         boolean not null,
  procesados integer not null,
  errores    integer not null,
  duracion_ms integer not null,
  error      text,
  detalle    text,
  ejecutado_en timestamptz not null default now()
);

create index idx_cron_job_runs_job_executed on cron_job_runs(job, ejecutado_en);
create index idx_cron_job_runs_ok on cron_job_runs(ok);

-- -----------------------------------------------------------------------------
-- Métricas diarias (desnormalizadas)
-- -----------------------------------------------------------------------------

create table profile_daily_stats (
  profile_id     uuid not null references profiles(id) on delete cascade,
  date           date not null,
  views          integer not null default 0,
  whatsapp_clicks integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (profile_id, date)
);

create index idx_profile_daily_stats_date on profile_daily_stats(date);

-- -----------------------------------------------------------------------------
-- Lanzamiento: cupones
-- -----------------------------------------------------------------------------

create table cupones (
  id               uuid primary key default uuid_generate_v4(),
  codigo          text unique not null,
  tipo            tipo_cupon not null,
  valor           numeric(10, 2),
  cupo_maximo_usos  integer not null,
  usos_actuales   integer not null default 0,
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,
  rubros_habilitados jsonb,
  provincias_habilitados jsonb,
  activo          boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cupones_codigo on cupones(codigo);
create index idx_cupones_activo_vigencia on cupones(activo, vigente_desde, vigente_hasta);

create table cupon_redenciones (
  id        uuid primary key default uuid_generate_v4(),
  cupon_id   uuid not null references cupones(id) on delete cascade,
  profile_id uuid unique not null references profiles(id) on delete cascade,
  whatsapp_hash text unique,
  cuit_hash     text unique,
  usado_en timestamptz not null default now()
);

create index idx_cupon_redenciones_cupon_id on cupon_redenciones(cupon_id);
create index idx_cupon_redenciones_profile_id on cupon_redenciones(profile_id);

-- -----------------------------------------------------------------------------
-- Recuperación de contraseña
-- -----------------------------------------------------------------------------

create table password_reset_tokens (
  id        uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used      boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_password_reset_tokens_user_id on password_reset_tokens(user_id);
create index idx_password_reset_tokens_token_hash on password_reset_tokens(token_hash);
create index idx_password_reset_tokens_expires_at on password_reset_tokens(expires_at);

-- =============================================================================
-- CIFRADO A NIVEL DE DB (patrón ecr: trigger pgcrypto)
-- Campos sensibles: whatsapp_e164, cuit, documento, domicilio_fiscal
-- =============================================================================

-- Clave maestra de cifrado (se rota cambiando esta variable; los datos viejos
-- se descifran con la clave antigua si se guarda el key_id).
-- En producción esta clave se inyecta via Supabase secrets, no hardcodeada.
set search_path = public, pgcrypto;

create or replace function profiles_enc_key() returns text as $$
  select current_setting('app.enc_key', true);
$$ language sql stable;

create or replace function encrypt_text(plain text) returns text as $$
  select case
    when plain is null then null
    else convert_to(encrypt(convert_to(plain, 'UTF8'), profiles_enc_key(), 'aes'), 'base64')
  end;
$$ language sql immutable;

create or replace function decrypt_text(cipher text) returns text as $$
  select case
    when cipher is null then null
    else convert_from(decrypt(decode(cipher, 'base64'), profiles_enc_key(), 'aes'), 'UTF8')
  end;
$$ language sql immutable;

-- Trigger que cifra campos sensibles antes de insert/update
create or replace function auto_encrypt_profiles() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.cuit = encrypt_text(new.cuit);
    new.whatsapp_e164 = encrypt_text(new.whatsapp_e164);
  elsif tg_op = 'UPDATE' then
    if new.cuit is distinct from old.cuit then
      new.cuit = encrypt_text(new.cuit);
    end if;
    if new.whatsapp_e164 is distinct from old.whatsapp_e164 then
      new.whatsapp_e164 = encrypt_text(new.whatsapp_e164);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger encrypt_profiles_trigger
  before insert or update on profiles
  for each row execute function auto_encrypt_profiles();

create or replace function auto_encrypt_fiscal_data() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.documento = encrypt_text(new.documento);
    new.domicilio_fiscal = encrypt_text(new.domicilio_fiscal);
  elsif tg_op = 'UPDATE' then
    if new.documento is distinct from old.documento then
      new.documento = encrypt_text(new.documento);
    end if;
    if new.domicilio_fiscal is distinct from old.domicilio_fiscal then
      new.domicilio_fiscal = encrypt_text(new.domicilio_fiscal);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger encrypt_fiscal_data_trigger
  before insert or update on fiscal_data
  for each row execute function auto_encrypt_fiscal_data();

-- Funciones RPC para leer datos descifrados (solo dueño o system)
create or replace function get_my_profile() returns jsonb
  language plpgsql security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile profiles%rowtype;
  v_fiscal fiscal_data%rowtype;
begin
  select * into v_profile from profiles where user_id = v_user_id;
  if not found then return null; end if;

  select * into v_fiscal from fiscal_data where profile_id = v_profile.id;

  return jsonb_build_object(
    'id', v_profile.id,
    'name', v_profile.name,
    'slug', v_profile.slug,
    'type', v_profile.type,
    'company_name', v_profile.company_name,
    'cuit', decrypt_text(v_profile.cuit),
    'whatsapp', decrypt_text(v_profile.whatsapp_e164),
    'whatsapp_verified_at', v_profile.whatsapp_verified_at,
    'moderation_status', v_profile.moderation_status,
    'is_published', v_profile.is_published,
    'fiscal_data', case when v_fiscal.id is not null then
      jsonb_build_object(
        'tipo_persona', v_fiscal.tipo_persona,
        'nombre_o_razon_social', v_fiscal.nombre_o_razon_social,
        'documento', decrypt_text(v_fiscal.documento),
        'condicion_iva', v_fiscal.condicion_iva,
        'domicilio_fiscal', decrypt_text(v_fiscal.domicilio_fiscal)
      )
    else null end
  );
end;
$$;

grant execute on function get_my_profile() to authenticated;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) — patrón ecr: auth.uid()
-- =============================================================================

-- Habilitar RLS en todas las tablas
alter table profiles enable row level security;
alter table fiscal_data enable row level security;
alter table category_groups enable row level security;
alter table categories enable row level security;
alter table subcategories enable row level security;
alter table cities enable row level security;
alter table images enable row level security;
alter table profile_categories enable row level security;
alter table profile_subcategories enable row level security;
alter table profile_coverage enable row level security;
alter table contact_intents enable row level security;
alter table profile_votes enable row level security;
alter table vote_invites enable row level security;
alter table whatsapp_verifications enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;
alter table credit_notes enable row level security;
alter table price_changes enable row level security;
alter table webhook_events enable row level security;
alter table email_logs enable row level security;
alter table reports enable row level security;
alter table blocked_identifiers enable row level security;
alter table risk_signals enable row level security;
alter table site_settings enable row level security;
alter table audit_logs enable row level security;
alter table cancellation_requests enable row level security;
alter table complaints enable row level security;
alter table reclamos enable row level security;
alter table evidencia_reclamo enable row level security;
alter table support_tickets enable row level security;
alter table ticket_respuestas enable row level security;
alter table ticket_plantillas enable row level security;
alter table data_requests enable row level security;
alter table cron_job_runs enable row level security;
alter table profile_daily_stats enable row level security;
alter table cupones enable row level security;
alter table cupon_redenciones enable row level security;
alter table password_reset_tokens enable row level security;

-- Revocar acceso público (deny-all)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'public') then
    create role public nologin;
  end if;
end $$;

do $$
declare
  tabla record;
begin
  for tabla in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table %I from anon, authenticated, public', tabla.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Políticas RLS
-- -----------------------------------------------------------------------------

-- profiles: dueño lee/escribe todo; público lee publicados+aprobados
create policy profiles_own_all on profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy profiles_public_read on profiles
  for select to authenticated
  using (is_published = true and moderation_status = 'APPROVED');

-- fiscal_data: solo dueño
create policy fiscal_data_own_all on fiscal_data
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- imágenes: dueño del perfil
create policy images_own_all on images
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- catálogo: lectura pública
create policy catalog_read_all on category_groups for select to authenticated using (true);
create policy catalog_read_all on categories for select to authenticated using (true);
create policy catalog_read_all on subcategories for select to authenticated using (true);
create policy catalog_read_all on cities for select to authenticated using (true);

-- plans: lectura pública
create policy plans_read_all on plans for select to authenticated using (true);

-- subscriptions: dueño + sistema
create policy subscriptions_own_all on subscriptions
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- payments: dueño
create policy payments_own_all on payments
  for all to authenticated
  using (
    auth.uid() = (
      select p.user_id from subscriptions s
      join profiles p on p.id = s.profile_id
      where s.id = subscription_id
    )
  )
  with check (
    auth.uid() = (
      select p.user_id from subscriptions s
      join profiles p on p.id = s.profile_id
      where s.id = subscription_id
    )
  );

-- contact_intents: cliente dueño
create policy contact_intents_own_all on contact_intents
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- profile_votes: cliente dueño
create policy profile_votes_own_all on profile_votes
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- vote_invites: cliente dueño
create policy vote_invites_own_all on vote_invites
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- whatsapp_verifications: dueño del perfil
create policy whatsapp_verifications_own_all on whatsapp_verifications
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- reports: dueño del perfil
create policy reports_own_all on reports
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- blocked_identifiers / risk_signals: solo staff
create policy blocked_identifiers_staff_all on blocked_identifiers
  for all to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'))
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

create policy risk_signals_staff_all on risk_signals
  for all to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'))
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- site_settings: solo admin
create policy site_settings_admin_all on site_settings
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

-- audit_logs: select admin/moderador, insert admin/moderador
create policy audit_logs_select on audit_logs
  for select to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

create policy audit_logs_insert on audit_logs
  for insert to authenticated
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- cancellation_requests: dueño del perfil
create policy cancellation_requests_own_all on cancellation_requests
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- reclamos: cliente dueño
create policy reclamos_own_all on reclamos
  for all to authenticated
  using (auth.uid() = client_id)
  with check (auth.uid() = client_id);

-- evidencia_reclamo: lectura del dueño del reclamo
create policy evidencia_reclamo_own_read on evidencia_reclamo
  for select to authenticated
  using (
    auth.uid() = (select client_id from reclamos where id = reclamo_id)
  );

-- complaints: público (sin sesión), sistema lee todo
create policy complaints_own_all on complaints
  for all to authenticated
  using (true)
  with check (true);

-- support_tickets: dueño + staff
create policy support_tickets_own_all on support_tickets
  for all to authenticated
  using (auth.uid() = coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  with check (auth.uid() = coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

create policy support_tickets_staff_all on support_tickets
  for all to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'))
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- ticket_respuestas: dueño del ticket + staff
create policy ticket_respuestas_own_all on ticket_respuestas
  for all to authenticated
  using (
    auth.uid() = coalesce((select user_id from support_tickets where id = ticket_id), '00000000-0000-0000-0000-000000000000'::uuid)
  )
  with check (
    auth.uid() = coalesce((select user_id from support_tickets where id = ticket_id), '00000000-0000-0000-0000-000000000000'::uuid)
  );

create policy ticket_respuestas_staff_all on ticket_respuestas
  for all to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'))
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- ticket_plantillas: staff
create policy ticket_plantillas_staff_all on ticket_plantillas
  for all to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'))
  with check (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- data_requests: dueño (vía profile -> user)
create policy data_requests_own_all on data_requests
  for all to authenticated
  using (
    auth.uid() = (select user_id from profiles where id = profile_id)
  )
  with check (
    auth.uid() = (select user_id from profiles where id = profile_id)
  );

-- relaciones muchos-a-muchos: heredan del dueño del perfil
create policy profile_categories_own on profile_categories
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

create policy profile_subcategories_own on profile_subcategories
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

create policy profile_coverage_own on profile_coverage
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- profile_daily_stats: admin/sistema
create policy profile_daily_stats_admin_read on profile_daily_stats
  for select to authenticated
  using (auth.jwt()->>'role' in ('ADMIN', 'MODERADOR'));

-- webhook_events, email_logs, cron_job_runs, cupones: sistema/admin
create policy webhook_events_system_all on webhook_events
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

create policy email_logs_system_all on email_logs
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

create policy cron_job_runs_system_all on cron_job_runs
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

create policy cupones_read_all on cupones for select to authenticated using (true);
create policy cupones_admin_write on cupones
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

create policy cupon_redenciones_own_all on cupon_redenciones
  for all to authenticated
  using (auth.uid() = (select user_id from profiles where id = profile_id))
  with check (auth.uid() = (select user_id from profiles where id = profile_id));

-- password_reset_tokens: solo sistema
create policy password_reset_tokens_system_all on password_reset_tokens
  for all to authenticated
  using (auth.jwt()->>'role' = 'ADMIN')
  with check (auth.jwt()->>'role' = 'ADMIN');

-- =============================================================================
-- Storage buckets (patrón ecr)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Políticas de storage: público lee profile-images; dueño escribe sus propias fotos
create policy storage_profile_images_public_read on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-images');

create policy storage_profile_images_owner_write on storage.objects
  for all to authenticated
  using (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy storage_verification_docs_owner_write on storage.objects
  for all to authenticated
  using (bucket_id = 'verification-docs' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'verification-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy storage_verification_docs_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================================================
-- Fin del esquema
-- =============================================================================
