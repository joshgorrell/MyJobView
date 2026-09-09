import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export interface QBOConnection {
  id: string;
  organization_id: string;
  access_token: string;
  refresh_token: string;
  realm_id: string;
  token_expires_at: string;
  is_connected: boolean;
  environment: string;
  company_name: string | null;
  last_synced_at: string | null;
  sync_health: string;
  last_error: Record<string, unknown> | null;
}

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

export function getBaseUrl(environment: string): string {
  return environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function getOAuthBaseUrl(): string {
  return 'https://appcenter.intuit.com/connect/oauth2';
}

export function getTokenUrl(): string {
  return 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
}

export async function getConnection(supabase: ReturnType<typeof createClient>, organizationId: string): Promise<QBOConnection | null> {
  const { data, error } = await supabase
    .from('quickbooks_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data || !data.is_connected) {
    return null;
  }

  return data as QBOConnection;
}

export async function getConnectionByRealm(supabase: ReturnType<typeof createClient>, realmId: string): Promise<QBOConnection | null> {
  const { data, error } = await supabase
    .from('quickbooks_settings')
    .select('*')
    .eq('realm_id', realmId)
    .eq('is_connected', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as QBOConnection;
}

export async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: QBOConnection
): Promise<string | null> {
  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID');
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('QBO client credentials not configured');
    return null;
  }

  const tokenResponse = await fetch(getTokenUrl(), {
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

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token refresh failed:', errorText);

    await supabase
      .from('quickbooks_settings')
      .update({
        sync_health: 'error',
        last_error: { type: 'token_refresh', message: errorText, at: new Date().toISOString() },
      })
      .eq('id', connection.id);

    return null;
  }

  const tokens = await tokenResponse.json();
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

  await supabase
    .from('quickbooks_settings')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      sync_health: 'healthy',
      last_error: null,
    })
    .eq('id', connection.id);

  return tokens.access_token;
}

export async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: QBOConnection
): Promise<string | null> {
  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  if (expiresAt > now) {
    return connection.access_token;
  }

  return await refreshAccessToken(supabase, connection);
}

export async function qboRequest(
  supabase: ReturnType<typeof createClient>,
  connection: QBOConnection,
  method: string,
  path: string,
  body?: any
): Promise<{ ok: boolean; status: number; data: any }> {
  let accessToken = await getValidAccessToken(supabase, connection);

  if (!accessToken) {
    return { ok: false, status: 401, data: { error: 'Failed to obtain valid access token' } };
  }

  const baseUrl = getBaseUrl(connection.environment);
  const url = `${baseUrl}/v3/company/${connection.realm_id}/${path}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken(supabase, connection);
    if (refreshed) {
      accessToken = refreshed;
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const retryData = await retryResponse.json().catch(() => null);
      return { ok: retryResponse.ok, status: retryResponse.status, data: retryData };
    }
  }

  if (response.status === 429 || response.status === 503) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    headers['Authorization'] = `Bearer ${accessToken}`;
    const retryResponse = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const retryData = await retryResponse.json().catch(() => null);
    return { ok: retryResponse.ok, status: retryResponse.status, data: retryData };
  }

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function logSyncOperation(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  direction: string,
  operation: string,
  entityType: string,
  entityId: string | null,
  qboId: string | null,
  status: string,
  errorMessage?: string | null,
  details?: any,
  durationMs?: number
): Promise<void> {
  await supabase.from('quickbooks_sync_logs').insert({
    organization_id: organizationId,
    direction,
    operation,
    entity_type: entityType,
    entity_id: entityId,
    qbo_id: qboId,
    status,
    error_message: errorMessage || null,
    details: details || null,
    duration_ms: durationMs || null,
  });
}

export async function createSyncRun(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  runType: string,
  entityType: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('qbo_sync_runs')
    .insert({
      organization_id: organizationId,
      run_type: runType,
      entity_type: entityType,
      status: 'running',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Failed to create sync run:', error);
    return null;
  }

  return data.id;
}

export async function completeSyncRun(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  status: string,
  entityCount: number,
  errorSummary?: string | null
): Promise<void> {
  await supabase
    .from('qbo_sync_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      entity_count: entityCount,
      error_summary: errorSummary || null,
    })
    .eq('id', runId);
}

export async function upsertEntityMapping(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  entityType: string,
  localId: string,
  qboId: string,
  qboSyncToken?: string | null
): Promise<void> {
  await supabase
    .from('qbo_entity_mappings')
    .upsert({
      organization_id: organizationId,
      entity_type: entityType,
      local_id: localId,
      qbo_id: qboId,
      qbo_sync_token: qboSyncToken || null,
      last_synced_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,entity_type,qbo_id',
    });
}

export async function getLocalIdByQboId(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  entityType: string,
  qboId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('qbo_entity_mappings')
    .select('local_id')
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .eq('qbo_id', qboId)
    .maybeSingle();

  return data?.local_id ?? null;
}

export async function getQboIdByLocalId(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  entityType: string,
  localId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('qbo_entity_mappings')
    .select('qbo_id')
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .eq('local_id', localId)
    .maybeSingle();

  return data?.qbo_id ?? null;
}

export function jsonParseSafe(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
