/**
 * admin-bloquear — Edge Function para bloquear perfiles y lista negra
 * Patrón ecr: clave admin compartida (X-Admin-Key), service_role para bypass de RLS.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SB_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SB_SERVICE_ROLE')!;
const ADMIN_API_KEY = Deno.env.get('ADMIN_API_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const adminKey = req.headers.get('x-admin-key');
  if (adminKey !== ADMIN_API_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const { profileId, reason, type } = await req.json();
  if (!profileId || !reason || !type) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
  }

  // Bloquear identificador (usa hash; aquí se asume que ya se tiene el hash)
  await supabaseAdmin
    .from('blocked_identifiers')
    .insert({ id: crypto.randomUUID(), type, value_hash: profileId, reason, created_by: 'admin' });

  // Suspender perfil
  await supabaseAdmin
    .from('profiles')
    .update({ moderation_status: 'SUSPENDED', moderation_reason: reason })
    .eq('id', profileId);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
