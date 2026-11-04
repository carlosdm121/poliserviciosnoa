/**
 * webhook-kyc — Edge Function para webhooks de verificación de identidad (Didit o similar)
 * Patrón ecr: verifica firma HMAC-SHA256, aplica veredicto vía función segura,
 * usa service_role para actualizar estados sensibles.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SB_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SB_SERVICE_ROLE')!;
const KYC_WEBHOOK_SECRET = Deno.env.get('KYC_WEBHOOK_SECRET')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get('x-signature') ?? '';

  // Verificar HMAC-SHA256 del webhook
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(KYC_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (!timingSafeEqual(signature, expectedHex)) {
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 });
  }

  const payload = JSON.parse(body);
  const { event_type, data } = payload;

  // Idempotencia
  const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: existing } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .eq('provider', 'kyc')
    .eq('payload_hash', hashHex)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // Aplicar veredicto (aquí se actualizaría whatsapp_verifications o profiles según el proveedor KYC)
  // Ejemplo: si el KYC verifica titularidad de WhatsApp, marcar whatsapp_verified_at

  await supabaseAdmin
    .from('webhook_events')
    .insert({ id: crypto.randomUUID(), provider: 'kyc', event_type, payload_hash: hashHex, processed_at: new Date().toISOString() });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
