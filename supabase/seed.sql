-- =============================================================================
-- PoliserviciosNOA — Seed de datos iniciales (idempotente)
-- =============================================================================
-- Patrón ecr: INSERT ... WHERE NOT EXISTS para que sea seguro reejecutar.
-- =============================================================================

-- Planes de suscripción
insert into plans (id, name, amount, currency, is_active, vigente_desde)
values
  (gen_random_uuid(), 'Básico', 10000.00, 'ARS', true, now())
where not exists (select 1 from plans where name = 'Básico');

insert into plans (id, name, amount, currency, is_active, vigente_desde)
values
  (gen_random_uuid(), 'Premium', 15000.00, 'ARS', true, now())
where not exists (select 1 from plans where name = 'Premium');

-- Categoría grupo mínima (el catálogo completo se carga por separado desde el panel admin)
insert into category_groups (id, name, slug, icon, sort_order)
values
  (gen_random_uuid(), 'Hogar', 'hogar', 'home', 1)
where not exists (select 1 from category_groups where slug = 'hogar');

insert into category_groups (id, name, slug, icon, sort_order)
values
  (gen_random_uuid(), 'Salud y bienestar', 'salud-bienestar', 'heart', 2)
where not exists (select 1 from category_groups where slug = 'salud-bienestar');

-- Ajustes del sitio por defecto
insert into site_settings (key, value, updated_by)
values
  ('require_manual_approval', '{"value": false}', 'system')
on conflict (key) do nothing;

insert into site_settings (key, value, updated_by)
values
  ('payment_grace_days', '{"value": 3}', 'system')
on conflict (key) do nothing;

insert into site_settings (key, value, updated_by)
values
  ('subscription_price_ars', '{"value": 10000}', 'system')
on conflict (key) do nothing;

-- =============================================================================
-- Fin del seed
-- =============================================================================
