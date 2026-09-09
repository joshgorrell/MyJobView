import { corsHeaders } from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${appUrl}/admin/settings?qbo=error&msg=Legacy%20OAuth%20flow%20disabled` },
  });
});
