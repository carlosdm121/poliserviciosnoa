-- Migración: Espacios personalizados
-- Aplica en: Supabase -> SQL Editor -> Run (DESPUÉS de schema.sql)

-- 1. Hacer whatsapp_e164 opcional (permitir NULL)
-- En tu schema.sql la tabla es 'profiles' y el campo es 'whatsapp_e164'
ALTER TABLE profiles ALTER COLUMN whatsapp_e164 DROP NOT NULL;

-- 2. Agregar campos de personalización a profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS page_colors JSONB;

-- 3. Crear tabla servicio
CREATE TABLE IF NOT EXISTS servicio (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10,2) NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'ARS',
    cuotas_max INTEGER NOT NULL DEFAULT 0,
    interes_cuota DECIMAL(5,2) NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Índices de servicio
CREATE INDEX IF NOT EXISTS idx_servicio_profile_activo ON servicio(profile_id, activo);
CREATE INDEX IF NOT EXISTS idx_servicio_profile_sort ON servicio(profile_id, sort_order);
