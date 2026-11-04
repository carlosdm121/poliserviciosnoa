-- =============================================================================
-- PoliserviciosNOA — Seed de datos iniciales (idempotente)
-- =============================================================================
-- Patrón ecr: INSERT ... SELECT ... WHERE NOT EXISTS para que sea seguro
-- reejecutar. (VALUES no admite WHERE, por eso se usa SELECT.)
-- =============================================================================

-- Planes de suscripción
insert into plans (id, name, amount, currency, is_active, vigente_desde)
select uuid_generate_v4(), 'Básico', 10000.00, 'ARS', true, now()
where not exists (select 1 from plans where name = 'Básico');

insert into plans (id, name, amount, currency, is_active, vigente_desde)
select uuid_generate_v4(), 'Premium', 15000.00, 'ARS', true, now()
where not exists (select 1 from plans where name = 'Premium');

-- Categoría grupo mínima (el catálogo completo se carga por separado desde el panel admin)
insert into category_groups (id, name, slug, icon, sort_order)
select uuid_generate_v4(), 'Hogar', 'hogar', 'home', 1
where not exists (select 1 from category_groups where slug = 'hogar');

insert into category_groups (id, name, slug, icon, sort_order)
select uuid_generate_v4(), 'Salud y bienestar', 'salud-bienestar', 'heart', 2
where not exists (select 1 from category_groups where slug = 'salud-bienestar');

-- Ajustes del sitio por defecto
insert into site_settings (key, value, updated_by)
values
  ('require_manual_approval', '{"value": false}'::jsonb, 'system'),
  ('payment_grace_days',      '{"value": 3}'::jsonb,     'system'),
  ('subscription_price_ars',  '{"value": 10000}'::jsonb, 'system')
on conflict (key) do nothing;

-- =============================================================================
-- Fin del seed
-- =============================================================================
