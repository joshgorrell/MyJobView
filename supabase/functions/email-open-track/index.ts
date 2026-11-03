import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const image = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const type = url.searchParams.get('type') || 'review';

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
          .update({ email_opened: true, opened_at: now })
          .eq('open_token', token)
          .is('opened_at', null);
      } else if (type === 'satisfaction') {
        await admin
          .from('customer_satisfaction')
          .update({ opened_at: now })
          .eq('open_token', token)
          .is('opened_at', null);
      } else if (type === 'lost_review') {
        await admin
          .from('lost_review_details')
          .update({ email_opened_at: now })
          .eq('open_token', token)
          .is('email_opened_at', null);
      }
    } catch {
      // Silently fail — the pixel must still return an image
    }
  }

  return new Response(
    req.method === 'HEAD' ? null : image,
    {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        ...corsHeaders,
      },
    },
  );
});
