import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, getSupabaseAdmin, getTokenUrl } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Only administrators can disconnect QuickBooks' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminSupabase = getSupabaseAdmin();

    const { data: connection } = await adminSupabase
      .from('quickbooks_settings')
      .select('id, refresh_token, environment')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (connection.refresh_token) {
      const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
      const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

      if (clientId && clientSecret) {
        try {
          await fetch(getTokenUrl(), {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: connection.refresh_token,
            }),
          });
        } catch (e) {
          console.error('Token revocation failed (non-blocking):', e);
        }
      }
    }

    await adminSupabase
      .from('quickbooks_settings')
      .update({
        is_connected: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        sync_health: 'healthy',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Disconnect error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to disconnect' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
