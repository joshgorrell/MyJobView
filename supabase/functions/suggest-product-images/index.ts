import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: 'Sign in to search product photos.' }, { status: 401, headers: corsHeaders });

  const key = Deno.env.get('BRAVE_SEARCH_API_KEY');
  if (!key) return Response.json({ images: [], unavailable: true }, { headers: corsHeaders });

  try {
    const body = await request.json();
    const manufacturer = String(body.manufacturer ?? '').trim().slice(0, 100);
    const model = String(body.model ?? '').trim().slice(0, 100);
    if (!manufacturer || model.length < 3) {
      return Response.json({ error: 'Manufacturer and model are required.' }, { status: 400, headers: corsHeaders });
    }

    const query = `${manufacturer} "${model.replaceAll('"', '')}" product`;
    const url = new URL('https://api.search.brave.com/res/v1/images/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '30');
    url.searchParams.set('safesearch', 'strict');
    url.searchParams.set('spellcheck', 'false');
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Image search returned ${response.status}`);
    const data = await response.json();
    const seen = new Set<string>();
    const images = (Array.isArray(data.results) ? data.results : []).flatMap((result: any) => {
      const imageUrl = safeUrl(result.properties?.url);
      if (!imageUrl || seen.has(imageUrl)) return [];
      seen.add(imageUrl);
      return [{
        url: imageUrl,
        preview: safeUrl(result.thumbnail?.src) ?? imageUrl,
        title: String(result.title ?? '').slice(0, 160),
        source: String(result.source ?? '').slice(0, 100),
        page: safeUrl(result.url),
      }];
    }).slice(0, 12);
    return Response.json({ images }, { headers: corsHeaders });
  } catch (error) {
    console.error('Product image search failed:', error);
    return Response.json({ error: 'Photo suggestions are temporarily unavailable.' }, { status: 502, headers: corsHeaders });
  }
});
