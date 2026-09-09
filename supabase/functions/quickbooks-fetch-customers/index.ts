import { corsHeaders } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) return response({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return response({ error: 'Service unavailable' }, 503);

  try {
    const target = `${supabaseUrl}/functions/v1/quickbooks-sync-customer`;
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runType: 'manual' }),
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Legacy customer fetch forwarding failed:', error);
    return response({ error: 'Customer sync unavailable' }, 503);
  }
});

function response(data: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
