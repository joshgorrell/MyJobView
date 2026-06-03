import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');

    if (!code || !state || !realmId) {
      return new Response('Missing required parameters', { status: 400 });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify state parameter
    const { data: settings, error: settingsError } = await supabaseClient
      .from('company_settings')
      .select('*')
      .eq('qbo_oauth_state', state)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response('Invalid state parameter', { status: 400 });
    }

    // Exchange code for tokens
    const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
    const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
    const redirectUri = Deno.env.get('QUICKBOOKS_REDIRECT_URI');
    const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox';

    if (!clientId || !clientSecret || !redirectUri) {
      return new Response('OAuth not configured', { status: 500 });
    }

    const tokenUrl = environment === 'production'
      ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const authString = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`,
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
      return new Response('Failed to exchange code for tokens', { status: 500 });
    }

    const tokens = await tokenResponse.json();

    // Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    // Store tokens in database
    const { error: updateError } = await supabaseClient
      .from('company_settings')
      .update({
        qbo_connected: true,
        qbo_realm_id: realmId,
        qbo_access_token: tokens.access_token,
        qbo_refresh_token: tokens.refresh_token,
        qbo_token_expires_at: expiresAt.toISOString(),
        qbo_oauth_state: null, // Clear state
      })
      .eq('id', settings.id);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return new Response('Failed to store tokens', { status: 500 });
    }

    // Redirect back to settings page with success message
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    return Response.redirect(`${appUrl}/settings?qbo=connected`, 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});