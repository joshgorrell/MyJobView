import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in to search photos.' }, { status: 401, headers: cors });
  const key = Deno.env.get('TAVILY_API_KEY');
  if (!key) return Response.json({ images: [], unavailable: true }, { headers: cors });

  try {
    const input = await req.json();
    const manufacturer = String(input.manufacturer ?? '').trim().slice(0, 100);
    const model = String(input.model ?? '').trim().slice(0, 100);
    if (!manufacturer || model.length < 3) return Response.json({ error: 'Make and model are required.' }, { status: 400, headers: cors });
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `${manufacturer} "${model.replaceAll('"', '')}" product image`,
        search_depth: 'basic',
        max_results: 5,
        include_images: true,
        include_image_descriptions: true,
        include_answer: false,
        safe_search: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Image search returned ${response.status}`);
    const data = await response.json();
    const seen = new Set<string>();
    const images = (Array.isArray(data.images) ? data.images : []).flatMap((item: any) => {
      const raw = typeof item === 'string' ? item : item?.url;
      if (typeof raw !== 'string' || seen.has(raw)) return [];
      try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return [];
        seen.add(raw);
        return [{ url: raw, description: typeof item?.description === 'string' ? item.description.slice(0, 180) : '' }];
      } catch { return []; }
    }).slice(0, 12);
    return Response.json({ images }, { headers: cors });
  } catch (error) {
    console.error('Product photo suggestions failed:', error);
    return Response.json({ error: 'Photo suggestions are temporarily unavailable.' }, { status: 502, headers: cors });
  }
});
