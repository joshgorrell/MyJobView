import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Missing authorization');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Reject malformed identifiers before making any privileged database request.
    const payload = await req.json();
    const session_id = payload?.session_id;
    if (typeof session_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session_id)) {
      throw new Error('Invalid session_id');
    }

    // Forwarded headers are routing hints, NOT proof of the caller's location.
    // Never use these values alone for account takeover alerts or access decisions.
    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || req.headers.get('cf-connecting-ip')?.trim() || null;
    // Missing IP must not prevent a valid session from being tracked.
    // Reject malformed values before sending them to the external geo provider.
    const validIp = ip && ip.length <= 45 && /^[0-9a-f:.]+$/i.test(ip) &&
      (ip.includes(':') || /^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(ip)) &&
      (!ip.includes('.') || ip.split('.').every(part => /^\\d+$/.test(part) && Number(part) <= 255));
    const usableIp = validIp ? ip : null;

    let location: Record<string, string | null> = { city: null, region: null, country: null, isp: null };
    if (usableIp) try {
      const geo = await fetch(`https://ipwho.is/${encodeURIComponent(usableIp)}`, {
        signal: AbortSignal.timeout(2500),
      }).then(r => r.json());
      if (geo?.success !== false) {
        location = {
          city: geo.city || null,
          region: geo.region || null,
          country: geo.country || null,
          isp: geo.connection?.isp || null,
        };
      }
    } catch {
      // IP is still useful even when optional geolocation is unavailable.
    }

    // Browser clients cannot write user_sessions directly. This function
    // verifies the caller with Supabase Auth, then updates ONLY that user's
    // session with a server-only service-role client.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) throw new Error('Session location service unavailable');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: updated, error } = await admin
      .from('user_sessions')
      .update({
        ...(usableIp ? { ip_address: usableIp, ...location, location_updated_at: new Date().toISOString() } : {}),
      })
      .eq('id', session_id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new Error('Session not found for authenticated user');

    return new Response(JSON.stringify({ ok: true, ...location }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
