import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const type = url.searchParams.get('type') || 'review';
  const dest = url.searchParams.get('dest');

  if (token) {
    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      const now = new Date().toISOString();

      if (type === 'review') {
        await admin
          .from('review_requests')
          .update({ link_clicked: true, clicked_at: now })
          .eq('open_token', token);
      }
    } catch {
      // Don't block the redirect even if tracking fails
    }
  }

  if (dest && /^https:\/\/(www\.)?google\.com\//.test(dest)) {
    return Response.redirect(dest, 302);
  }

  return new Response(
    JSON.stringify({ error: 'Invalid destination' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
