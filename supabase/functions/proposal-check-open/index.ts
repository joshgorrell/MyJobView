import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
// Same response for valid, missing and expired tokens: disclose no customer data.
const image = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
export async function handleOpen(req: Request, db: any) {
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token');
    if (token && /^[0-9a-f-]{72}$/.test(token)) {
      try {
        const { error } = await db.from('proposal_check_emails').update({ opened_at: new Date().toISOString() })
          .eq('open_token', token).is('opened_at', null).neq('status', 'failed');
        if (error) console.error('Could not record proposal check open');
      } catch { console.error('Could not record proposal check open'); }
    }
  }
  return new Response(req.method === 'HEAD' ? null : image, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Content-Type-Options': 'nosniff' } });
}
Deno.serve(req => handleOpen(req, createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)));
