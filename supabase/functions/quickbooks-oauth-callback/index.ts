import { corsHeaders, getTokenUrl, getSupabaseAdmin, getBaseUrl } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const realmId = url.searchParams.get('realmId');
    const state = url.searchParams.get('state');

    if (!code || !realmId || !state) {
      throw new Error('Missing required parameters');
    }

    const supabase = getSupabaseAdmin();

    const { data: session, error: sessionError } = await supabase
      .from('qbo_oauth_sessions')
      .select('*')
      .eq('id', state)
      .maybeSingle();

    if (sessionError || !session) {
      console.error('Invalid OAuth state:', state);
      return redirectToError('Invalid state parameter');
    }

    if (session.consumed_at) {
      console.error('OAuth state already consumed:', state);
      return redirectToError('State already used');
    }

    if (new Date(session.expires_at) < new Date()) {
      console.error('OAuth state expired:', state);
      return redirectToError('State expired');
    }

    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const redirectUri = Deno.env.get('QUICKBOOKS_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToError('OAuth not configured');
    }

    const tokenResponse = await fetch(getTokenUrl(), {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return redirectToError('Token exchange failed');
    }

    const tokens = await tokenResponse.json();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';

    const { data: existing } = await supabase
      .from('quickbooks_settings')
      .select('id')
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('quickbooks_settings')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          token_expires_at: expiresAt.toISOString(),
          is_connected: true,
          environment,
          sync_health: 'healthy',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('quickbooks_settings')
        .insert({
          organization_id: session.organization_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          token_expires_at: expiresAt.toISOString(),
          is_connected: true,
          environment,
          auto_import_complete_data: false,
          auto_sync_enabled: false,
        });
    }

    await supabase
      .from('qbo_oauth_sessions')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', state);

    try {
      const companyResponse = await fetch(
        `${getBaseUrl(environment)}/v3/company/${realmId}/companyinfo/${realmId}`,
        { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } }
      );
      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        const companyName = companyData?.CompanyInfo?.CompanyName;
        if (companyName) {
          await supabase
            .from('quickbooks_settings')
            .update({ company_name: companyName })
            .eq('organization_id', session.organization_id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch company name:', e);
    }

    return redirectToSuccess();
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return redirectToError(error.message || 'Unknown error');
  }
});

function redirectToSuccess(): Response {
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${appUrl}/admin/settings?qbo=success` },
  });
}

function redirectToError(message: string): Response {
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${appUrl}/admin/settings?qbo=error&msg=${encodeURIComponent(message)}` },
  });
}
